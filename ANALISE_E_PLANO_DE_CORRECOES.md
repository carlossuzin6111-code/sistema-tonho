# Análise técnica e plano de correções — FitLife Sync

> Documento de apoio à manutenção colaborativa. Esta alteração contém apenas documentação.

## Objetivo

Este documento consolida a análise técnica do projeto e divide as correções em Pull Requests pequenos e independentes. Como o trabalho será feito por um colaborador, cada item deve usar branch, PR e commit próprios, sem misturar refatorações ou melhorias não relacionadas.

## Projeto analisado

- Frontend: HTML, CSS e JavaScript puro, com interfaces desktop e mobile.
- Backend: Node.js, Express, JWT, bcrypt e Swagger.
- Banco: SQLite acessado por Knex.
- Tempo real: Server-Sent Events (SSE) no chat.
- Infraestrutura: Nginx, Docker Compose e Cloudflare Tunnel.

O desenho atual é um monólito modular conteinerizado, e não uma arquitetura de microsserviços: há uma única aplicação backend acompanhada do Nginx.

## Pontos positivos

- Controllers e middleware estão separados.
- O Knex parametriza as consultas.
- Senhas usam bcrypt e JWTs possuem expiração.
- Alunos, medidas e treinos já possuem verificações de vínculo em vários fluxos.
- Swagger e testes de integração cobrem boa parte da API.
- A configuração Docker/Nginx é simples de entender.

## Achados

### SEC-01 — XSS persistente no frontend

**Severidade: crítica.** Dados da API e dos usuários são interpolados diretamente em `innerHTML`, inclusive mensagens, nomes, e-mails, treinos e exercícios.

Referências: `frontend/js/student.js` (incluindo linhas próximas de 235 e 282) e `frontend/js/personal.js` (card próximo da linha 60).

Uma mensagem com HTML malicioso pode executar JavaScript no navegador de outro usuário. Como o JWT fica no `localStorage`, isso também pode levar ao roubo da sessão.

Correção: usar `textContent`, criar elementos DOM explicitamente e sanitizar somente o HTML que for realmente necessário.

Critérios de aceite:

- Conteúdo como `<img src=x onerror=alert(1)>` é exibido literalmente.
- Nenhum campo controlado pelo usuário executa código.
- Desktop e mobile mantêm a renderização esperada.
- Existem testes para chat, nomes, treinos e exercícios maliciosos.

### SEC-02 — Autorização quebrada no chat

**Severidade: crítica.** Um personal pode informar qualquer `receiverId` ou acessar `/api/chat/:userId` sem o controller confirmar que o alvo é seu aluno. Isso pode permitir leitura, envio e alteração do estado de mensagens de outro vínculo.

Referência: `backend/src/controllers/chatController.js`, funções `getMessages` e `sendMessage`.

Correção: validar em `student_profiles` o vínculo entre personal autenticado e aluno alvo antes de qualquer leitura, atualização ou envio.

Critérios de aceite:

- Personal conversa somente com seus alunos.
- Aluno conversa somente com seu personal.
- Acesso cruzado retorna `403` e não marca mensagens como lidas.
- Testes usam dois personals e alunos de vínculos diferentes.

### SEC-03 — Segredos e dados versionados

**Severidade: alta.** `backend/keys_aut.json` e `backend/database.sqlite` estão rastreados. Há ainda um `JWT_SECRET` padrão conhecido no middleware, Dockerfile, Compose e `.env.example`.

Riscos: fabricação de tokens e exposição de hashes, mensagens e dados corporais.

Correção:

- Remover banco e chaves reais do rastreamento e ampliar `.gitignore`.
- Manter somente exemplos sem valores funcionais.
- Exigir `JWT_SECRET` no startup, sem fallback.
- Rotacionar segredos possivelmente utilizados.
- Tratar eventual limpeza do histórico Git somente após alinhamento com o mantenedor.

### SEC-04 — Chaves de cadastro não atômicas

**Severidade: alta.** A chave é removida do JSON antes da verificação do e-mail e da criação do usuário. Falhas posteriores consomem a chave; concorrência pode causar reutilização ou perda de atualização.

Correção: armazenar hashes das chaves no banco e consumi-las na mesma transação que cria o personal.

Critérios de aceite: falhas não consomem a chave, uma chave nunca cria duas contas e nenhum valor fica armazenado em texto puro.

### DB-01 — Ausência de migrations reais

**Severidade: alta.** O schema é criado no startup por `hasTable/createTable` em `backend/src/database.js`. O `knexfile.js` aponta para diretórios de migrations e seeds que não existem. Isso cria bancos novos, mas não atualiza bancos existentes de forma confiável.

Correção: criar migrations versionadas, preservar dados existentes e fazer o ambiente de testes aplicar o mesmo schema.

### DB-02 — Índices insuficientes

**Severidade: média.** Devem ser medidos e provavelmente criados índices para:

- `chat_messages(sender_id, receiver_id, created_at)`;
- `measurements(student_id, recorded_at)`;
- `workouts(student_id, created_at)`;
- `student_profiles(personal_id)`;
- consultas relevantes por `personal_id`.

### ARCH-01 — Worker infinito dentro da API

**Severidade: média.** `backend/src/database.js` inicia um loop de tradução que chama uma API pública não documentada. Cada réplica iniciará outro worker; isso também produz concorrência, handles abertos e acoplamento da disponibilidade web com um serviço externo.

Correção: torná-lo configurável e cancelável e, depois, executá-lo como job separado, idempotente e observável.

### SEC-05 — JWT no localStorage e na URL do SSE

**Severidade: média/alta.** O JWT fica no `localStorage` e é passado como `?token=` ao EventSource. URLs podem aparecer em logs e histórico.

Correção: depois do PR de XSS, migrar a sessão para cookie `HttpOnly`, `Secure` e `SameSite`, adicionar proteção CSRF e autenticar o SSE sem token na URL.

### SEC-06 — Hardening HTTP incompleto

**Severidade: média.** Faltam rate limiting no login/cadastro, headers defensivos, CORS restrito, limites específicos de payload e validação centralizada de entradas.

### TEST-01 — Testes não executáveis no checkout analisado

**Severidade: média.** `npm test` falhou porque `jest` não estava disponível na instalação local. A suíte existente é uma boa base, mas faltam testes multi-personal, XSS, concorrência, migrations e validação.

Correção: padronizar `npm ci`, validar o lockfile e adicionar CI.

### DOC-01 — Documentação e encoding

**Severidade: baixa.** Há sinais de caracteres UTF-8 corrompidos. O README também exagera ao chamar a solução de microsserviços e totalmente pronta para múltiplos bancos.

## Plano de PRs

| Ordem | Branch sugerida | Escopo único | Commit sugerido |
|---:|---|---|---|
| 1 | `docs/catalogo-analise-tecnica` | Somente este documento | `docs: catalogar riscos e plano de correcoes` |
| 2 | `fix/chat-authorization` | Isolamento e autorização do chat | `fix: restringir chat aos vinculos autorizados` |
| 3 | `fix/frontend-stored-xss` | Remover XSS persistente | `fix: renderizar dados de usuario com seguranca` |
| 4 | `security/remove-tracked-secrets` | Banco/chaves rastreados e JWT padrão | `security: remover segredos e dados versionados` |
| 5 | `test/reproducible-backend-suite` | Testes reproduzíveis e CI básico | `test: tornar suite backend reproduzivel` |
| 6 | `refactor/database-migrations` | Migrations preservando o schema | `refactor: versionar schema com migrations knex` |
| 7 | `perf/database-indexes` | Índices medidos em migration própria | `perf: indexar consultas principais do banco` |
| 8 | `security/transactional-access-keys` | Chaves transacionais no banco | `security: consumir chaves de cadastro atomicamente` |
| 9 | `refactor/translation-worker-lifecycle` | Isolar o worker de tradução | `refactor: isolar ciclo de vida do tradutor` |
| 10 | `security/cookie-session` | Cookie HttpOnly e CSRF | `security: migrar sessao para cookie httpOnly` |
| 11 | `security/http-hardening` | Headers, rate limiting e validação | `security: reforcar protecoes da api` |
| 12 | `docs/architecture-and-encoding` | UTF-8 e documentação arquitetural | `docs: corrigir encoding e descrever arquitetura` |

Dependências:

- PRs 2 e 3 são os bloqueadores imediatos.
- PR 4 exige coordenação para rotação de segredos e histórico Git.
- PR 5 deve preceder refatorações amplas.
- PR 7 depende do PR 6; PR 8 preferencialmente também.
- PR 10 deve vir depois do PR 3.

## Processo para cada PR

1. Atualizar a branch principal sem reescrever trabalho alheio.
2. Criar uma branch nova a partir da principal atualizada.
3. Alterar somente o escopo daquele PR.
4. Adicionar testes relacionados à mudança.
5. Executar as verificações disponíveis.
6. Revisar `git diff` para excluir arquivos fora do escopo.
7. Criar um único commit descritivo.
8. Abrir PR documentando problema, solução, testes e validação.
9. Aguardar revisão antes de iniciar uma mudança dependente.

## Checklist sugerido para PR

```markdown
## Problema
Descreva o comportamento, risco e reprodução.

## Solução
Descreva somente a alteração deste PR.

## Validação
- [ ] Teste automatizado adicionado/ajustado
- [ ] Suíte existente executada
- [ ] Validação manual documentada
- [ ] Desktop/mobile validados, se aplicável
- [ ] Autorização revisada
- [ ] Nenhum segredo ou dado operacional incluído
- [ ] Migração/compatibilidade de dados considerada
```

## Fora de escopo sem aprovação do mantenedor

- Reescrever o frontend em framework.
- Trocar SQLite por outro banco.
- Alterar identidade visual.
- Regravar o histórico Git.
- Mudar deploy, túnel ou arquitetura para microsserviços.

## Prioridade final

1. Bloquear acesso cruzado no chat.
2. Eliminar XSS persistente.
3. Remover e rotacionar segredos/dados versionados.
4. Restaurar testes reproduzíveis.
5. Introduzir migrations e índices.
6. Tornar chaves transacionais.
7. Separar o worker.
8. Migrar sessão e aplicar hardening.
9. Corrigir documentação e encoding.

Até a conclusão dos três primeiros itens, não é recomendável expor o sistema publicamente pelo Cloudflare Tunnel.
