# Análise técnica atualizada e próximos passos — FitLife Sync

> Atualizado em 16/07/2026 após os merges dos PRs #22 a #28, confirmação do CI completo da `main` e restauração segura dos metadados Git do workspace.

## 1. Resumo executivo

O plano técnico anterior foi implementado quase integralmente pelos PRs #7 a #21. Entretanto, a integração sequencial de branches empilhadas introduziu regressões na `main`: a API e o worker de tradução não iniciavam, partes da autenticação por cookie foram perdidas e a suíte de testes ficou inconsistente.

As correções foram reunidas no PR #22:

- PR: https://github.com/carlossuzin6111-code/sistema-tonho/pull/22
- Branch: `fix/stacked-pr-integration-regressions`
- Commit: `82e287e`
- Estado verificado: mesclado em 16/07/2026 no commit `2d000df`, com CI da `main` aprovado

O PR #22 foi mesclado antes do início das correções operacionais seguintes.

O código presente neste workspace contém as correções do PR #22 e passa nas suítes automatizadas. A análise dos logs, porém, encontrou problemas operacionais adicionais que não são detectados pelos testes atuais: quedas periódicas do SSE do chat, bloqueios compartilhados no rate limiter de autenticação e configuração legada de chaves de cadastro.

## 2. Estado validado

### Testes automatizados

- Backend: 9 suítes e 68 testes aprovados.
- Frontend, CSP e infraestrutura: 13 testes aprovados.
- Verificação de sintaxe: nenhum erro nos arquivos JavaScript do backend e frontend.
- Dependências: instalação reproduzível e auditoria sem vulnerabilidades conhecidas.
- A suíte backend encerra naturalmente, sem `--forceExit`.

### Docker

Os quatro serviços foram iniciados e inspecionados:

- `fitlife_app`: ativo e sem reinícios após a correção.
- `fitlife_translation_worker`: ativo e sem reinícios.
- `fitlife_web`: ativo e respondendo HTTP 200.
- `fitlife_tunnel`: conectado ao Cloudflare Tunnel.

O Compose agora possui healthchecks de API/SQLite e Nginx, e condiciona web, worker e túnel à saúde das dependências. Essas mudanças estão na `main`, mas ainda não foram implantadas porque a rotação de credenciais permanece pendente.

As três migrations foram aplicadas corretamente:

1. Schema inicial.
2. Índices das consultas principais.
3. Chaves de cadastro transacionais.

### Site público

URL validada: https://tonho.personaltonho.online

Um smoke test com Chrome real confirmou:

- redirecionamento para a interface desktop;
- carregamento da tela de login;
- login de personal;
- abertura do painel e da lista de alunos;
- navegação para cadastro de aluno e biblioteca de exercícios;
- sessão em cookie `HttpOnly` não acessível por JavaScript;
- cookie CSRF presente durante a sessão;
- logout com limpeza dos cookies e do cache local;
- nenhuma exceção JavaScript;
- nenhuma resposta inesperada de erro da API.

As contas e os dados criados para o teste foram removidos após a validação.

Esse smoke test representa um recorte pontual. A inspeção posterior dos logs revelou timeouts recorrentes na conexão SSE do chat e respostas de autenticação `400`, `403` e `429`, detalhadas na seção 4.

## 3. Regressões corrigidas pelo PR #22

- Declaração duplicada de `JWT_SECRET`, que impedia a API de iniciar.
- Constantes de métodos seguros do middleware CSRF ausentes.
- Funções de criação e limpeza de cookies não importadas no controller.
- Retorno do segredo JWT legado como fallback.
- Script `worker:translate` ausente do `package.json`.
- Lista duplicada e incompleta de migrations nos testes.
- Testes de integração ainda esperando JWT no corpo da resposta.
- Helpers e imports ausentes nos testes de cookie, logout e sessão expirada.
- Cenário multi-personal reutilizando uma chave de cadastro já consumida.
- Teste CSP ausente do comando `npm test` da raiz.
- Requisito de Node e permissão do SQLite desalinhados com o SQLite 6.0.1.
- `.gitignore` raiz vazio, sem proteção para arquivos `.env`.

## 4. Erros atuais confirmados e causas-raiz

Os achados desta seção foram confirmados nos logs do ambiente anterior. As correções foram mescladas na `main` pelos PRs #23 a #25, mas a validação operacional final depende da rotação de credenciais e da recriação dos containers.

### SSE-01 — Timeout recorrente no chat

**Prioridade: alta.**

**Estado do código:** corrigido pelo PR #23; implantação pendente.

O Nginx registrava repetidamente `upstream timed out while reading upstream` para `GET /api/chat/stream`. A conexão era encerrada aproximadamente a cada 60 segundos e o `EventSource` do navegador tentava reconectar, gerando ciclos de conexão e desconexão e, em alguns momentos, múltiplos streams para o mesmo usuário.

Causa-raiz:

- o backend enviava apenas o comentário inicial `:ok` ao abrir o SSE;
- não existia heartbeat periódico durante períodos sem mensagens;
- o bloco `/api/` do Nginx desabilitava buffering, mas não definia `proxy_read_timeout`;
- o timeout padrão do proxy encerrava a conexão ociosa.

Correção implementada:

1. Enviar heartbeat SSE a cada 15 a 30 segundos.
2. Definir um `proxy_read_timeout` explicitamente maior para a rota do stream.
3. Limpar o timer de heartbeat quando a conexão fechar.
4. Criar teste automatizado que mantenha o stream aberto além do timeout anterior.

### AUTH-KEY-01 — Cadastro retorna `403`

**Prioridade: alta.**

**Estado do código:** corrigido pelo PR #25; implantação pendente.

Os `403` observados possuem a resposta `Access Key Inválida`. O backend atual valida somente hashes existentes e ainda não utilizados na tabela `registration_keys`. O arquivo legado `keys_aut.json` não é lido nem importado.

Problemas associados:

- antes do PR #25, o README orientava copiar e preencher `backend/keys_aut.json`, contradizendo o fluxo transacional atual;
- antes do PR #25, o Compose montava `backend/keys_aut.json` em `/app/keys_aut.json`;
- no workspace analisado, esse caminho foi criado pelo bind mount como diretório, não como arquivo;
- `.dockerignore` já excluía o arquivo do build, mas o `.gitignore` raiz não protegia explicitamente `keys_aut.json` nem bancos SQLite.

Correção implementada:

1. Gerar chaves no mesmo banco usado pela aplicação com `docker compose exec app npm run access-key:create`.
2. Remover do Compose a montagem de `keys_aut.json`.
3. Remover do README as instruções do mecanismo legado.
4. Adicionar ao `.gitignore` padrões para `keys_aut.json`, `*.sqlite` e arquivos auxiliares do SQLite.
5. Não restaurar nem importar chaves antigas que já foram versionadas.

### AUTH-RATE-01 — Login e cadastro retornam `429`

**Prioridade: alta.**

**Estado do código:** corrigido pelo PR #24; implantação pendente.

Login e cadastro compartilhavam o mesmo rate limiter: por padrão eram permitidas 10 tentativas malsucedidas em 15 minutos, agrupadas por endereço IP.

A implantação pública possui dois proxies antes do Express: Cloudflare Tunnel e Nginx. Antes do PR #24, o Nginx repassava a cadeia recebida e o backend não obtinha de forma confiável o endereço canônico do visitante, fazendo clientes diferentes compartilharem a mesma contagem.

Isso explica a sequência observada nos logs: várias chaves inválidas retornam `403`; essas falhas consomem o limite; em seguida, cadastro e login passam a responder `429`.

Correção implementada:

1. Validar `req.ip` e `req.ips` em ambiente controlado, sem registrar dados pessoais permanentemente.
2. Configurar a cadeia de proxies confiáveis de forma explícita e restrita.
3. Não usar uma configuração ampla que permita ao cliente forjar `X-Forwarded-For`.
4. Avaliar limitadores separados para login e cadastro.
5. Incluir teste de integração representando Cloudflare Tunnel, Nginx e Express.

### AUTH-LOGIN-01 — Login retorna `400`

**Prioridade: informativa.**

O `400` observado no login corresponde a e-mail inexistente ou senha incorreta. Nesse caso, o backend está se comportando conforme implementado. O problema operacional ocorre quando essas falhas legítimas são agregadas incorretamente pelo rate limiter e evoluem para `429` compartilhado.

### OPS-DNS-01 — Timeout DNS isolado no túnel

**Prioridade: baixa/monitoramento.**

O Cloudflare Tunnel registrou um timeout ao atualizar o resolvedor DNS local. As conexões QUIC já estavam estabelecidas e os testes prévios de DNS, UDP, TCP e API haviam sido aprovados. O evento aparenta ser transitório; deve ser monitorado antes de qualquer mudança de configuração.

O aviso sobre tamanho do buffer UDP também não impediu o túnel de conectar e não é, isoladamente, a causa dos erros da aplicação.

### DOC-01 — Documentação arquitetural desatualizada

**Prioridade: média.**

`docs/ARCHITECTURE.md` ainda descreve ausência de migrations, worker de tradução dentro da API, JWT no armazenamento do navegador e token SSE na URL. O código atual já possui três migrations, worker separado, sessão em cookie `HttpOnly` e SSE autenticado pelo cookie.

O README também mistura o fluxo novo de `registration_keys` com instruções do arquivo legado `keys_aut.json`. Essa divergência aumenta a chance de operação incorreta e explica tentativas de cadastro com chaves que o backend nunca aceitará.

### WORKSPACE-01 — Metadados Git restaurados

**Estado: concluído em 16/07/2026.**

Os metadados Git foram reconstruídos a partir da `main` remota após o merge do PR #22. A branch local `main` acompanha `origin/main` no commit `2d000df`. A restauração atualizou somente referências e índice, preservando os arquivos existentes. O único arquivo funcionalmente modificado no workspace é este documento de acompanhamento.

## 5. Ações urgentes após o merge

### SEC-01 — Rotação de credenciais

**Prioridade: crítica.**

O token do Cloudflare Tunnel e um segredo JWT foram expostos durante a manutenção. Eles não foram incluídos no PR, mas devem ser considerados comprometidos.

Ações:

1. Revogar o token atual do Cloudflare Tunnel.
2. Gerar um token novo.
3. Gerar um `JWT_SECRET` novo, aleatório e exclusivo, com pelo menos 32 bytes.
4. Atualizar somente o `.env` local ou o gerenciador de segredos do ambiente.
5. Recriar os containers.
6. Invalidar sessões antigas e repetir o smoke test.

Não registrar os novos valores em documentação, commits, logs ou mensagens.

### REL-01 — Implantar somente após o merge

O gate foi concluído: a `main` pública contém as correções do PR #22 e o workflow backend pós-merge foi aprovado. A implantação ainda depende da rotação das credenciais comprometidas e das validações operacionais subsequentes.

## 6. Melhorias recomendadas

### CI-01 — Executar testes frontend no GitHub Actions

**Estado: concluído pelo PR #27.**

O workflow atual executa apenas a suíte backend. O CI deve também executar o `npm test` da raiz para impedir regressões de XSS, sessão e CSP.

Critérios de aceite:

- backend e frontend aparecem como checks obrigatórios;
- falha de qualquer suíte bloqueia o merge;
- o workflow usa versões fixadas e instalação reproduzível.

### PERF-01 — Retirar a carga do catálogo do cadastro

**Prioridade: média/alta.**

O cadastro de um personal insere aproximadamente 1.324 exercícios antes de responder. Isso aumenta a latência da requisição e pode causar timeout em conexões lentas.

Recomendação:

- criar o usuário e responder sem aguardar toda a carga;
- popular o catálogo por job idempotente;
- registrar progresso e falhas;
- impedir duplicação por nome/personal.

### OPS-01 — Adicionar healthchecks

**Estado do código: concluído pelo PR #28; implantação pendente.**

O Compose considera o container iniciado mesmo quando o processo entra em reinício. Adicionar healthchecks para API e Nginx e condicionar dependências à saúde real.

Os healthchecks não substituem a correção do SSE: uma API pode responder ao healthcheck e ainda encerrar indevidamente streams de longa duração.

### TEST-01 — E2E contínuo para desktop e mobile

**Prioridade: média.**

Transformar o smoke test realizado manualmente em teste automatizado de navegador, cobrindo:

- login e logout;
- personal e aluno;
- criação de aluno;
- treino e exercícios;
- medidas;
- chat e SSE;
- desktop e viewport mobile;
- ausência de erros JavaScript e respostas 5xx.

### SEC-02 — Remover `unsafe-inline` de estilos

**Prioridade: média.**

O `script-src` já rejeita JavaScript inline, mas `style-src` ainda permite `unsafe-inline` por causa de estilos legados nos HTML. Migrar estilos inline para classes CSS e endurecer a CSP.

### DB-01 — Avaliar substituição do `node-sqlite3`

**Prioridade: média.**

O projeto usa `sqlite3` 6.0.1 e está sem vulnerabilidades conhecidas na auditoria atual. Ainda assim, o repositório do driver foi arquivado. A substituição deve ser estudada em PR próprio, com benchmarks, compatibilidade de migrations e testes de concorrência.

## 7. Ordem sugerida dos próximos PRs

1. Mesclar o PR #22 e confirmar o CI na `main`.
2. Rotacionar credenciais e recriar o ambiente.
3. Restaurar ou recriar o workspace a partir de um clone Git válido.
4. Corrigir heartbeat e timeout do SSE do chat.
5. Corrigir a cadeia de proxies confiáveis e o rate limiter de autenticação.
6. Remover o fluxo legado de `keys_aut.json` e atualizar os padrões de ignore.
7. Atualizar README e documentação arquitetural.
8. Adicionar a suíte frontend ao GitHub Actions.
9. Adicionar healthchecks e smoke test de deploy.
10. Retirar a carga do catálogo do caminho síncrono de cadastro.
11. Automatizar E2E desktop/mobile, incluindo estabilidade do SSE.
12. Remover estilos inline e endurecer a CSP.
13. Avaliar um substituto para `node-sqlite3`.

Cada item deve permanecer em PR próprio, com escopo pequeno e validação proporcional ao risco.

Situação em 16/07/2026: itens 1, 3, 4, 5, 6, 7, 8 e 9 concluídos na `main`. O item 2, rotação de credenciais, permanece como gate para implantação. Os itens 10 a 13 ainda não foram iniciados.

## 8. Checklist para liberar uma versão

- [x] PR #22 mesclado.
- [x] CI da `main` aprovado.
- [ ] Token do Cloudflare rotacionado.
- [ ] `JWT_SECRET` rotacionado.
- [ ] `.env` ausente do Git.
- [ ] `keys_aut.json` e bancos SQLite protegidos pelo `.gitignore`.
- [x] Workspace reconhecido como repositório Git válido.
- [x] Backend: 68 testes aprovados.
- [x] Frontend/CSP/infra: 13 testes aprovados.
- [ ] Docker sem containers em reinício.
- [ ] Healthchecks de API e Nginx aprovados.
- [ ] Stream SSE permanece conectado e recebe heartbeats.
- [ ] Rate limiter diferencia corretamente clientes atrás do túnel e do Nginx.
- [x] Cadastro usa chave gerada na tabela `registration_keys`, sem arquivo legado.
- [ ] API autenticada validada pelo domínio público.
- [ ] Login e logout validados em desktop e mobile.
- [ ] Logs sem segredos, tokens ou dados pessoais.
- [ ] Backup do banco confirmado antes de migrations destrutivas.

## 9. Conclusão

O PR #22 foi mesclado e corrige as regressões que impediam a inicialização da API e do worker. As suítes locais e o CI da `main` estão aprovados, e os metadados Git do workspace foram restaurados. Isso não significa, porém, que o ambiente esteja pronto para liberação: os logs confirmam instabilidade no SSE, bloqueio potencialmente compartilhado no rate limiter e documentação conflitante sobre chaves de cadastro.

A prioridade imediata agora é rotacionar as credenciais expostas e recriar o ambiente a partir da `main`. SSE, cadeia de proxies, fluxo legado de chaves, documentação, CI completo e healthchecks já foram corrigidos no código. Após a validação operacional, o foco pode avançar para redução da latência do cadastro, E2E, endurecimento adicional da CSP e avaliação do driver SQLite.

## 10. Diário de implementação

Este diário deve ser atualizado em cada etapa com estado, arquivos alterados, validações executadas e pendências. Valores de credenciais nunca devem ser registrados.

### 15/07/2026 — Início da execução ordenada

**Estado:** bloqueado no primeiro gate externo, sem alteração de código funcional.

- Item 1 — Mesclar o PR #22: bloqueado porque a autenticação local do GitHub CLI expirou (`HTTP 401`). É necessário autenticar novamente antes de confirmar ou executar o merge.
- Item 2 — Rotacionar credenciais: `TUNNEL_TOKEN` e `JWT_SECRET` estão configurados localmente, mas seus valores não foram lidos nem registrados. A rotação depende de revogação no Cloudflare e substituição controlada no ambiente.
- Item 3 — Restaurar o Git: confirmado que `.git` está vazio e o workspace não é reconhecido como repositório. A regularização será feita somente após confirmar o estado definitivo da `main`, preservando os arquivos atuais.
- Itens de código seguintes: ainda não iniciados para respeitar a ordem aprovada.

**Validações realizadas:**

- presença das variáveis obrigatórias verificada sem exibir valores;
- diretório `.git` inspecionado e confirmado vazio;
- tentativa de consulta do PR retornou falha de autenticação, sem mudança remota.

### 16/07/2026 — Merge e restauração do Git

**Estado:** primeiro gate concluído; rotação de credenciais permanece pendente.

- Item 1 — PR #22 mesclado na `main` pelo commit `2d000df6dcc1b34bad56c7e412b5089040b7571e`.
- CI pós-merge — workflow `Backend tests` concluído com sucesso para o mesmo commit.
- Item 3 — repositório Git local reconstruído; `main` acompanha `origin/main` sem substituir os arquivos do workspace.
- Item 2 — rotação de `TUNNEL_TOKEN` e `JWT_SECRET` ainda requer revogação e geração controlada nos provedores correspondentes.
- Próximos itens de código — permanecem aguardando a conclusão da rotação de credenciais, conforme a ordem aprovada.

**Validações realizadas:**

- autenticação do GitHub CLI confirmada para a conta ativa;
- estado remoto do PR confirmado como `MERGED`;
- SHA da `main` remota confirmado como `2d000df6dcc1b34bad56c7e412b5089040b7571e`;
- suíte local backend: 8 suítes e 64 testes aprovados;
- suíte local frontend/CSP: 10 testes aprovados;
- branch local `main` configurada para acompanhar `origin/main`;
- somente este documento permanece modificado no working tree.

### 16/07/2026 — Correção SSE preparada no PR #23

**Estado:** implementação, merge e CI da `main` concluídos; implantação pendente.

- Branch: `fix/sse-heartbeat-timeout`.
- Commit: `38413d2`.
- PR: https://github.com/carlossuzin6111-code/sistema-tonho/pull/23
- Backend envia heartbeat SSE a cada 25 segundos e limpa o timer na desconexão.
- Nginx usa `proxy_read_timeout 75s` exclusivamente em `/api/chat/stream`.
- O teste automatizado cobre emissão do heartbeat e ausência de timer residual.
- O PR foi mesclado na `main` pelo commit `5cbd6cd`.
- O workflow backend pós-merge foi aprovado para o mesmo commit.
- A recriação dos containers permanece bloqueada até a rotação de `TUNNEL_TOKEN` e `JWT_SECRET`.

**Validações realizadas:**

- backend: 9 suítes e 65 testes aprovados;
- frontend/CSP: 10 testes aprovados;
- `nginx -t` aprovado no container;
- verificação de sintaxe e `git diff --check` aprovados.

### 16/07/2026 — Proxy e rate limiter preparados no PR #24

**Estado:** implementação, merge e CI da `main` concluídos; implantação pendente.

- Branch: `fix/auth-proxy-rate-limits`.
- Commit: `195e322`.
- PR: https://github.com/carlossuzin6111-code/sistema-tonho/pull/24
- Express confia em exatamente um proxy, o Nginx.
- Nginx substitui a cadeia recebida por um único endereço derivado de `CF-Connecting-IP`, com fallback para o socket local.
- A porta publicada pelo Compose fica restrita a `127.0.0.1`; dispositivos externos devem usar o domínio do túnel.
- Login e cadastro usam limitadores independentes.
- O PR foi mesclado na `main` pelo commit `3b0a429`.
- O workflow backend pós-merge foi aprovado para o mesmo commit.
- A implantação permanece bloqueada até a rotação de `TUNNEL_TOKEN` e `JWT_SECRET`.

**Validações realizadas:**

- backend: 9 suítes e 67 testes aprovados;
- frontend/CSP/infra: 11 testes aprovados;
- `docker compose config --quiet` e `nginx -t` aprovados;
- verificação de sintaxe e `git diff --check` aprovados.

### 16/07/2026 — Fluxo legado de chaves removido no PR #25

**Estado:** implementação, merge e CI da `main` concluídos; implantação pendente.

- Branch: `chore/remove-legacy-access-keys`.
- Commit: `9f6a5fc`.
- PR: https://github.com/carlossuzin6111-code/sistema-tonho/pull/25
- Bind mount e arquivo de exemplo `keys_aut.json` removidos.
- Diretório vazio criado pelo mount legado foi removido do workspace após verificação.
- README agora orienta gerar chaves no banco real com `docker compose exec app npm run access-key:create`.
- `.gitignore` raiz protege chaves locais e arquivos auxiliares do SQLite.
- O PR foi mesclado na `main` pelo commit `d67adea`.
- O workflow backend pós-merge foi aprovado para o mesmo commit.

**Validações realizadas:**

- backend: 9 suítes e 67 testes aprovados;
- frontend/CSP/infra: 12 testes aprovados;
- `docker compose config --quiet` e `git diff --check` aprovados.

### 16/07/2026 — Arquitetura atualizada no PR #26

**Estado:** implementação e merge concluídos.

- Branch: `docs/update-current-architecture`.
- Commit: `9906b24`.
- PR: https://github.com/carlossuzin6111-code/sistema-tonho/pull/26
- README e `docs/ARCHITECTURE.md` agora refletem migrations, worker separado, cookies `HttpOnly`, CSRF, heartbeat SSE, cadeia de proxies e chaves transacionais.
- O PR foi mesclado na `main` pelo commit `70c5eb9`.
- O workflow anterior não executava para mudanças apenas em documentação.

**Validações realizadas:**

- busca por afirmações arquiteturais obsoletas concluída;
- backend: 9 suítes e 67 testes aprovados;
- frontend/CSP/infra: 12 testes aprovados;
- `git diff --check` aprovado.

### 16/07/2026 — CI completo preparado no PR #27

**Estado:** implementação, merge e checks da `main` concluídos.

- Branch: `ci/run-full-test-suite`.
- Commit: `647be3d`.
- PR: https://github.com/carlossuzin6111-code/sistema-tonho/pull/27
- O workflow possui checks separados `Backend` e `Frontend and infrastructure`.
- Os filtros incluem backend, frontend, Nginx, Compose, README, `.gitignore` e arquivos de pacote relevantes.
- O PR foi mesclado na `main` pelo commit `b66daa6`.
- Os dois checks também foram aprovados no push pós-merge.

**Validações realizadas:**

- backend local: 9 suítes e 67 testes aprovados;
- frontend/CSP/infra local: 12 testes aprovados;
- checks remotos `Backend` e `Frontend and infrastructure` aprovados;
- `git diff --check` aprovado.

### 16/07/2026 — Healthchecks preparados no PR #28

**Estado:** implementação, merge e checks da `main` concluídos; implantação pendente.

- Branch: `ops/add-service-healthchecks`.
- Commit: `8bc4223`.
- PR: https://github.com/carlossuzin6111-code/sistema-tonho/pull/28
- A API expõe `/api/health` e valida a conexão com o SQLite.
- App e Nginx possuem healthchecks; web, worker e túnel aguardam dependências saudáveis.
- O PR foi mesclado na `main` pelo commit `ecd134c`.
- Os checks `Backend` e `Frontend and infrastructure` também foram aprovados no push pós-merge.
- Durante uma inspeção expandida do Compose, os valores atuais das duas credenciais foram emitidos no output da ferramenta. Eles não são repetidos neste documento, mas devem ser tratados como definitivamente comprometidos.
- A implantação permanece bloqueada até a revogação e substituição de `TUNNEL_TOKEN` e `JWT_SECRET`.

**Validações realizadas:**

- backend: 9 suítes e 68 testes aprovados;
- frontend/CSP/infra: 13 testes aprovados;
- `docker compose config --quiet`, sintaxe e `git diff --check` aprovados;
- checks remotos `Backend` e `Frontend and infrastructure` aprovados.
