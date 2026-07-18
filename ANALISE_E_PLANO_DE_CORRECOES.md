
  ## Prioridade imediata

  ### 1. Corrigir o layout mobile

  Na captura em celular, o cartão de login ultrapassa a largura da tela e fica cortado à direita.

  A causa provável está em frontend/css/mobile.css:7:

  - Uso de width: 100vw junto com padding.
  - overflow: hidden no html e body.
  - Alturas fixas em 100vh.
  - Isso também pode quebrar quando o teclado virtual aparece.

  Recomendação:

  - Trocar 100vw por width: 100%.
  - Usar min-height: 100dvh.
  - Aplicar box-sizing: border-box.
  - Não bloquear o scroll na tela de autenticação.
  - Considerar env(safe-area-inset-*).
  - Testar nas larguras 320, 360 e 390 pixels.

  ### 2. Publicação está usando ambiente de desenvolvimento

  O Compose define NODE_ENV=development como padrão em docker-compose.yml:33.

  Porém, o cookie só recebe o atributo Secure quando o ambiente é production, em backend/src/services/
  sessionService.js:35.

  Como a aplicação está pública via HTTPS, isso deve ser corrigido mesmo sendo uma base de testes. Sugestão:

  - Ambiente público: NODE_ENV=production.
  - Ambiente local: arquivo Compose separado ou override para desenvolvimento.
  - Alternativamente, criar uma configuração explícita como COOKIE_SECURE=true.

  ### 3. Site público ainda está numa versão anterior

  A versão acessível publicamente não contém todas as correções já integradas na branch main. Portanto, alguns
  resultados visuais e de segurança observados no endereço público não representam completamente o código atual.

  Antes de validar definitivamente, será necessário reconstruir e republicar os containers.

  ## Melhorias visuais e interativas

  ### Login

  A identidade visual está limpa e coerente, mas no desktop há muito espaço vazio e pouca informação para orientar o
  usuário.

  Eu adicionaria:

  - Mostrar/ocultar senha.
  - Recuperação de senha.
  - Indicação visível de que o ambiente é de testes.
  - Pequena apresentação dos recursos no lado esquerdo em desktop.
  - Identificação mais clara: “Entrar” e “Criar conta de personal”.
  - Erros junto ao campo correspondente, em vez de depender apenas de mensagens flutuantes.
  - Estado de carregamento no botão e prevenção de cliques duplicados.

  ### Dashboard

  Para tornar a aplicação mais útil no uso diário:

  - Mostrar último peso, evolução, treinos ativos e mensagens não lidas.
  - Busca, filtros e ordenação de alunos e exercícios.
  - Skeletons durante carregamentos.
  - Telas vazias com uma ação direta, por exemplo “Cadastrar primeiro aluno”.
  - Botões de ação fixos no celular.
  - Gráficos com resumo textual e unidades bem visíveis.
  - Manter a aba atual no histórico/URL para o botão Voltar funcionar corretamente.

  ### Chat e atualizações em tempo real

  O SSE já melhorou a atualização em tempo real. A interface poderia informar melhor o estado:

  - “Conectado”, “Reconectando” ou “Sem conexão”.
  - Mensagem com estado “enviando”, “enviada” ou “falhou”.
  - Botão de tentar novamente.
  - Notificação discreta de novas mensagens.
  - Preservar mensagens digitadas em caso de falha.

  ### Exclusões e ações sensíveis

  Adicionar:

  - Confirmação clara antes de excluir aluno, treino ou exercício.
  - Possibilidade de desfazer quando tecnicamente possível.
  - Diferenciar visualmente ações destrutivas.
  - Evitar fechar formulários quando a requisição falhar.

  ## Acessibilidade

  Existem lacunas relevantes:

  - As páginas bloqueiam zoom com user-scalable=0 em frontend/mobile.html:5 e frontend/desktop.html:5. Isso deve ser
    removido.

  - Muitos botões apenas com ícones não têm aria-label.
  - Modais não possuem role="dialog", aria-modal, controle de foco ou fechamento com Escape.
  - O gerenciamento atual apenas mostra ou esconde o modal em frontend/js/app.js:47.
  - Toasts não usam aria-live, então leitores de tela podem não anunciar erros.
  - Falta suporte a prefers-reduced-motion.
  - As abas deveriam expor role="tab", aria-selected e relacionamento com seus painéis.
  - Campos de login deveriam usar autocomplete="email" e autocomplete="current-password".

  ## Segurança

  ### Pontos positivos

  A base atual já possui:

  - JWT obrigatório com segredo mínimo de 32 bytes.
  - Cookie de sessão HttpOnly.
  - SameSite=Strict.
  - Proteção CSRF.
  - Limites separados para login e cadastro.
  - Validação de papéis e vínculos entre personal e aluno.
  - CORS restritivo.
  - Cabeçalhos CSP, anti-iframe, MIME sniffing e política de referência.
  - Auditoria de dependências com resultado atual de zero vulnerabilidades conhecidas.

  ### Melhorias prioritárias

  1. Rotacionar os segredos antes de dados reais

     Como combinado, pode permanecer assim durante os testes. Antes de transformar em ambiente real, troque JWT, token
     do túnel e quaisquer credenciais utilizadas.

  2. Invalidar sessões após troca de senha

     A sessão JWT dura sete dias em backend/src/services/sessionService.js:15. Atualmente, trocar a senha não aparenta
     invalidar tokens emitidos anteriormente.

     O ideal é implementar token_version ou uma tabela de sessões revogáveis.

  3. Aumentar o mínimo de senha

     O mínimo atual é seis caracteres em backend/src/middleware/validateRequest.js:52. Recomendo pelo menos 10–12
     caracteres, aceitando senhas longas e frases-senha.

  4. Fluxo de redefinição de senha

     O personal pode definir diretamente uma nova senha do aluno. Mais seguro seria:
      - Gerar convite ou token temporário.
      - Obrigar troca no primeiro acesso.
      - Registrar quem iniciou a redefinição.
      - Invalidar sessões anteriores.

  5. Remover dependência externa flutuante

     Os ícones são carregados de unpkg.com/lucide@latest em frontend/mobile.html:12. Isso traz risco de cadeia de
     fornecimento.

     Melhor instalar e servir uma versão fixa dentro do próprio projeto.

  6. Fortalecer a CSP

     A CSP ainda aceita estilos inline e imagens de qualquer origem HTTPS em nginx.conf:33.

     Os 38 estilos inline encontrados na versão mobile deveriam virar classes CSS. Depois disso, seria possível remover
     'unsafe-inline' e restringir img-src.

  7. Adicionar HSTS

     O endereço público usa HTTPS, mas não retornou Strict-Transport-Security. Deve ser configurado depois de confirmar
     que todo acesso será exclusivamente HTTPS.

  8. Imagens e GIFs externos

     O campo de GIF aceita texto muito grande e não valida adequadamente protocolo ou domínio. Recomendo:
      - Aceitar apenas URLs https:.
      - Impor tamanho menor.
      - Opcionalmente usar uma lista de domínios permitidos.
      - Futuramente armazenar uploads de forma controlada.

  9. Normalizar e-mails

     Converter e-mail para minúsculas e remover espaços antes de cadastrar ou autenticar. Isso evita contas duplicadas
     por diferenças de capitalização.

  10. Registro de auditoria

  Registrar ações como:

  - Redefinição de senha.
  - Exclusão de alunos e treinos.
  - Alteração de medidas.
  - Mudanças de vínculo.
  - Tentativas administrativas relevantes.

  ### Infraestrutura

  As imagens nginx:alpine, node:20-slim e cloudflared:latest não estão totalmente fixadas. Recomendo versões ou digests
  específicos.

  O container Node também deveria:

  - Executar com usuário não-root.
  - Usar build em múltiplos estágios.
  - Não manter compiladores no container final.
  - Ter backup automatizado e testado do SQLite.

  ## Ordem sugerida para continuar

  1. Corrigir o estouro e teclado no mobile.
  2. Publicar com NODE_ENV=production.
  3. Melhorar acessibilidade de modais, botões, zoom e mensagens.
  4. Adicionar feedback de carregamento, erro e reconexão.
  5. Hospedar Lucide localmente e remover estilos inline.
  6. Implementar revogação de sessões e novo fluxo de senha.
  7. Adicionar HSTS, auditoria e rotina de backup.
  8. Reconstruir os containers e repetir os testes desktop/mobile.

## Progresso de implementação

### 2026-07-16 — Bloco 1 concluído

- [x] Corrigir largura, rolagem e altura dinâmica da tela de login mobile.
- [x] Permitir zoom e adicionar metadados básicos de acessibilidade aos formulários.
- [x] Adicionar anúncio acessível aos toasts e preferência por movimento reduzido.
- [x] Executar os testes automatizados e registrar o resultado.

Observação: o documento já continha alterações locais antes deste bloco; elas foram preservadas.

Validação:

- Frontend e infraestrutura: 13 de 13 testes aprovados.
- Backend: 68 de 68 testes aprovados em 9 suítes.
- `git diff --check`: nenhuma inconsistência de espaços em branco.
- Permanecem dois usos de `100vw` no drawer mobile, fora da tela de login; serão tratados em bloco visual posterior.

### 2026-07-16 — Bloco 2 concluído

- [x] Tornar `production` o ambiente padrão da pilha pública.
- [x] Preservar uma forma explícita de executar localmente em desenvolvimento.
- [x] Confirmar por teste que cookies de produção continuam recebendo `Secure`.

Validação:

- O Compose reconheceu os quatro serviços sem expor a configuração completa no terminal.
- Frontend e infraestrutura: 14 de 14 testes aprovados, incluindo o novo teste do ambiente padrão.
- Cookies de sessão: 2 de 2 testes específicos aprovados, incluindo `Secure` em produção.
- O `.env` local foi ajustado para `production`; para desenvolvimento local, `NODE_ENV=development` deve ser definido explicitamente.

### 2026-07-16 — Bloco 3 concluído

- [x] Aplicar semântica de diálogo a todos os modais ao abri-los.
- [x] Direcionar e prender o foco dentro do modal ativo.
- [x] Fechar com `Escape` e devolver o foco ao elemento acionador.
- [x] Adicionar cobertura automatizada do comportamento.

Validação:

- Frontend e infraestrutura: 15 de 15 testes aprovados.
- Backend completo após as alterações: 68 de 68 testes aprovados em 9 suítes.
- Captura local com viewport CSS equivalente a 360 px confirmou o cartão de login inteiro, com margens laterais e sem corte de campos ou botões.
- A primeira captura feita diretamente em 360 px foi descartada como referência porque o Chrome headless no Windows impõe uma largura interna mínima e recorta a imagem; a validação correta usou 720 px com escala de dispositivo 2.

### Estado ao encerrar este ciclo

- Três blocos concluídos: layout/acessibilidade básica, ambiente público seguro e modais acessíveis.
- Naquele ponto, os containers ainda precisavam ser reconstruídos para adotar `NODE_ENV=production`; a publicação foi concluída e validada na etapa seguinte.
- Próximo bloco sugerido: estados de carregamento e erros junto aos campos de login/cadastro, seguido de botões de mostrar/ocultar senha.

### 2026-07-16 — Publicação e validação concluídas

- [x] Reconstruir e recriar a pilha da base pública de testes.
- [x] Aguardar todos os healthchecks ficarem saudáveis.
- [x] Validar API, cabeçalhos, cookies e interface pública.
- [x] Repetir testes automatizados após a publicação.
- [x] Criar commit, enviar a branch e abrir pull request.

Branch de trabalho: `fix/mobile-accessibility-production`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/30

Resultados da publicação:

- API e Nginx permaneceram saudáveis após mais de três minutos de observação.
- Worker de tradução iniciou normalmente e não apresentou exceções nos logs recentes.
- API local e pública responderam `200` em `/api/health`.
- Backend confirmou execução efetiva com `NODE_ENV=production`.
- Teste isolado confirmou cookie de sessão com `Secure`, `HttpOnly` e CSRF também com `Secure`.
- Requisição pública sem sessão recebeu `401 Unauthorized`, conforme esperado.
- Requisição de login inválida recebeu `400 Bad Request` e cabeçalhos de rate limit.
- HTML público contém o cartão mobile corrigido, toast acessível e não bloqueia zoom.
- Capturas públicas desktop e mobile foram inspecionadas sem corte ou regressão visual aparente.
- Frontend e infraestrutura: 15 de 15 testes aprovados.
- Backend: 68 de 68 testes aprovados em 9 suítes.
- Auditoria npm das dependências de produção: zero vulnerabilidades.
- HSTS foi observado na resposta externa entregue pela Cloudflare.
- GitHub Actions do PR #30: checks `Backend` e `Frontend and infrastructure` concluídos com sucesso.

### 2026-07-16 — Bloco 4 concluído

- [x] Exibir estado de carregamento e impedir envio duplicado no login e cadastro.
- [x] Mostrar erros de autenticação junto ao formulário, mantendo o toast como aviso global.
- [x] Adicionar controle acessível para mostrar ou ocultar senhas.
- [x] Validar em desktop e mobile e adicionar cobertura automatizada.

Branch de trabalho: `feat/auth-form-feedback`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/31

Resultados:

- Botões de envio passam a indicar `Entrando...` ou `Criando conta...`, recebem `aria-busy` e ficam desabilitados durante a requisição.
- Um segundo envio durante a mesma requisição é ignorado.
- Erros são apresentados dentro do formulário com anúncio acessível e continuam aparecendo no toast global.
- Login e cadastro agora possuem controle de mostrar/ocultar senha com `aria-label` e `aria-pressed` atualizados.
- Foi detectada mistura de HTML novo com CSS/JS antigos no cache público; todos os assets locais receberam uma versão de release comum para evitar carregamentos incompatíveis.
- Frontend e infraestrutura: 18 de 18 testes aprovados, incluindo envio duplicado, recuperação após erro, visibilidade de senha e versionamento de assets.
- Backend: 68 de 68 testes aprovados em 9 suítes.
- Captura pública mobile após o versionamento confirmou o ícone alinhado dentro do campo e ausência de corte no formulário.

### 2026-07-16 — Bloco 5 concluído

- [x] Normalizar e-mails de cadastro, criação de aluno e login.
- [x] Impedir duplicidade de e-mail sem diferenciar maiúsculas e minúsculas.
- [x] Elevar para 10 caracteres o mínimo de novas senhas e redefinições, sem bloquear o login de contas existentes.
- [x] Atualizar documentação da API, frontend e testes automatizados.

Branch de trabalho: `fix/auth-input-hardening`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/32

Pré-validação do banco público: zero colisões de e-mail quando comparados com `LOWER(TRIM(email))`; nenhum endereço individual foi exibido.

Resultados:

- Backup consistente criado em `/app/data/database.pre-email-normalization-20260716.sqlite` antes da migration.
- A base pública de testes continha zero usuários antes e depois da migration.
- Migration `202607160001_normalize_user_emails.js` aplicada com sucesso.
- Índice `users_email_normalized_unique` confirmado no banco público.
- Novos e-mails são armazenados com espaços removidos e letras minúsculas; login também normaliza a entrada.
- A migration recusa execução quando encontra colisões case-insensitive, evitando mesclar contas silenciosamente.
- Senhas existentes continuam válidas no login; o mínimo de 10 caracteres vale somente para novos cadastros, novos alunos e redefinições.
- Frontend e infraestrutura: 18 de 18 testes aprovados.
- Backend: 72 de 72 testes aprovados em 9 suítes.
- API pública respondeu `200` no healthcheck e `400` ao smoke test de senha curta, sem criar conta.
- Containers permaneceram saudáveis e os logs pós-migration não apresentaram exceções.

### 2026-07-16 — Bloco 6 concluído e publicado

- [x] Adicionar versão revogável às sessões de usuário.
- [x] Invalidar sessões existentes quando a senha do aluno for redefinida.
- [x] Preservar temporariamente tokens legados enquanto a versão da sessão permanecer zero.
- [x] Confirmar por integração que o token antigo falha e um novo login funciona.

Branch de trabalho: `fix/session-revocation`, rebaseada sobre a `main` após o merge do PR #32.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/33

Resultados locais:

- Migration adiciona `session_version` com valor inicial zero.
- JWT passa a carregar a versão da sessão e cada requisição autenticada compara o token com o usuário atual.
- Redefinir a senha incrementa a versão, revogando cookies e Bearer tokens emitidos anteriormente.
- O teste de integração confirma `403` para o token antigo e sucesso após autenticar com a nova senha.
- O acesso ao banco no middleware é lazy, evitando inicialização assíncrona durante testes isolados de configuração.
- Frontend e infraestrutura: 18 de 18 testes aprovados.
- Backend: 72 de 72 testes aprovados em 9 suítes, sem handles ou erros após o encerramento.
- Migration `202607160002_add_session_version.js` aplicada e coluna `session_version` confirmada na base pública.
- API e containers permaneceram saudáveis após a publicação; healthcheck público respondeu `200`.

### 2026-07-17 — Bloco 7 concluído e publicado

- [x] Validar no backend as mídias associadas aos exercícios do catálogo.
- [x] Aceitar somente URLs HTTPS ou imagens raster em Base64 com tipos e tamanho controlados.
- [x] Antecipar no frontend erros de arquivo incompatível ou grande demais.
- [x] Atualizar documentação, testes automatizados e versão dos assets.
- [x] Publicar na base de testes e validar os serviços.
- [x] Abrir pull request.

Branch de trabalho: `fix/exercise-media-validation`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/34

Resultados locais:

- URLs externas agora precisam usar HTTPS e ter no máximo 2048 caracteres.
- Imagens incorporadas ficam limitadas a GIF, PNG, JPEG ou WebP Base64, até 525000 caracteres; o conteúdo binário precisa corresponder ao formato declarado.
- Arquivos acima de 380 KB ou com tipo incompatível são recusados no navegador antes da conversão.
- O limite JSON permanece controlado em 600 KB para comportar a imagem permitida sem aceitar cargas arbitrariamente grandes.
- A renderização deixou de carregar imagens externas por HTTP.
- Frontend e infraestrutura: 18 de 18 testes aprovados.
- Backend: 81 de 81 testes aprovados em 9 suítes.
- Imagem da aplicação reconstruída e executada com `NODE_ENV=production`.
- API e Nginx permaneceram saudáveis após mais de dois minutos; worker de tradução permaneceu ativo sem erros recentes.
- Healthcheck público respondeu `200` e o HTML externo confirmou a versão de assets `20260717.1`.
- GitHub Actions do PR #34: checks `Backend` e `Frontend and infrastructure` concluídos com sucesso; branch marcada como limpa para merge.

### 2026-07-17 — Bloco 8 concluído e publicado

- [x] Substituir `lucide@latest` externo por uma versão fixa servida localmente.
- [x] Remover `unpkg.com` da política de scripts da CSP.
- [x] Corrigir o limite do Nginx para aceitar exatamente as imagens permitidas pelo backend.
- [x] Atualizar testes e versão dos assets.
- [x] Publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `fix/local-icons-request-limit`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/35

Resultados locais:

- Lucide `1.25.0` fixado no lockfile e distribuído em `frontend/vendor/lucide`, com a licença ISC preservada.
- Desktop e mobile deixaram de executar JavaScript carregado por `unpkg.com`.
- `script-src` da CSP agora permite apenas a própria origem.
- Nginx aceita até `600k`, coerente com o limite JSON do backend e com a imagem Base64 de até 525000 caracteres.
- Versão comum dos assets atualizada para `20260717.2`.
- Frontend e infraestrutura: 19 de 19 testes aprovados.
- Backend: 81 de 81 testes aprovados em 9 suítes.
- Auditoria npm completa e de produção: zero vulnerabilidades.
- Configuração Nginx validada com sucesso por `nginx -t`.
- Nginx público recriado e permaneceu saudável; API pública respondeu `200` no healthcheck.
- Bundle local do Lucide respondeu `200` com 411938 bytes.
- CSP pública confirmou `script-src 'self'`, sem `unpkg.com`.
- Smoke test público confirmou que uma requisição com 550000 caracteres atravessa o proxy e chega à autenticação (`401` sem sessão), enquanto uma carga acima de 600k é recusada pelo Nginx (`413`).
- GitHub Actions do PR #35: checks `Backend` e `Frontend and infrastructure` concluídos com sucesso.

### 2026-07-17 — Bloco 9 concluído e publicado

- [x] Exibir o estado real da conexão do chat em desktop e mobile.
- [x] Remover a reconexão manual concorrente com a reconexão nativa do `EventSource`.
- [x] Informar envio, sucesso e falha de mensagens sem perder o texto digitado.
- [x] Adicionar cobertura automatizada e atualizar a versão dos assets.
- [x] Publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `feat/chat-connection-feedback`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/36

Resultados locais:

- Cabeçalhos do chat mostram `Conectando`, `Conectado`, `Reconectando`, `Sem conexão` ou `Desconectado`, com cor e anúncio acessível.
- Eventos `open`, `error`, `online` e `offline` atualizam o estado sem criar um segundo ciclo de reconexão.
- A reconexão passa a ser responsabilidade exclusiva do `EventSource`, evitando streams e mensagens duplicadas após instabilidade.
- Envio desabilita temporariamente o botão e informa `Enviando`, `Mensagem enviada` ou `Falha no envio`.
- O campo só é limpo após resposta bem-sucedida; em falha, o texto permanece disponível para nova tentativa.
- Botões de envio por ícone receberam nome acessível.
- Versão comum dos assets atualizada para `20260717.3`.
- Frontend e infraestrutura: 20 de 20 testes aprovados.
- Backend: 81 de 81 testes aprovados em 9 suítes.
- API e Nginx permaneceram saudáveis; healthcheck público respondeu `200`.
- HTML público confirmou os quatro indicadores acessíveis e a versão `20260717.3`.
- JavaScript público confirmou o mapeamento de reconexão e o controle de estado do envio.
- GitHub Actions do PR #36: checks `Backend` e `Frontend and infrastructure` concluídos com sucesso.

### 2026-07-17 — Bloco 10 concluído e publicado

- [x] Separar compilação de dependências e imagem final do backend.
- [x] Remover compiladores e ferramentas de build do runtime.
- [x] Executar API e worker como usuário sem privilégios.
- [x] Fazer backup e ajustar a propriedade do volume público existente antes da publicação.
- [x] Validar imagem e container temporário.
- [x] Publicar e validar a pilha pública.
- [x] Abrir pull request.

Branch de trabalho: `fix/nonroot-runtime-image`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/37

Resultados locais:

- Dockerfile separado em estágios `dependencies` e `runtime`.
- Python, `make` e `g++` permanecem apenas na compilação e foram confirmados como ausentes da imagem final.
- Arquivos e dependências são copiados com propriedade de `node:node`; runtime declara `USER node`.
- Inspeção confirmou UID/GID `1000` e usuário configurado `node`.
- Container temporário criou o banco, aplicou todas as migrations e respondeu `200` no healthcheck sem privilégios.
- Imagem final medida em 91482030 bytes.
- Frontend e infraestrutura: 21 de 21 testes aprovados.
- Backend: 82 de 82 testes aprovados em 10 suítes.
- Rotina `npm run db:backup -- <destino>` adicionada e coberta por teste de snapshot, integridade e preservação de dados.
- Backup público criado em `/app/data/database.pre-nonroot-20260717.sqlite`: 102400 bytes, 11 tabelas e integridade `ok`.
- Propriedade do volume migrada para UID/GID 1000; banco atual e backups confirmados como `node:node`.
- API e worker publicados como `uid=1000(node)`; escrita e remoção de arquivo temporário no volume foram bem-sucedidas.
- API, Nginx e worker permaneceram saudáveis e sem exceções nos logs; healthcheck público respondeu `200`.

### 2026-07-17 — Bloco 11 concluído e publicado

- [x] Criar armazenamento persistente e indexado para auditoria.
- [x] Registrar redefinições de senha, medidas e exclusões na mesma transação da ação.
- [x] Não registrar senhas nem valores corporais sensíveis nos metadados.
- [x] Disponibilizar consulta autenticada e limitada às ações do próprio usuário.
- [x] Testar e migrar a base pública.
- [x] Abrir pull request.

Branch de trabalho: `feat/security-audit-log`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/38

Resultados locais:

- Migration cria `audit_logs` com índices por ator/data e ação/data.
- Redefinição de senha, inclusão de medida e exclusão de treino, exercício do treino ou exercício do catálogo gravam auditoria na mesma transação.
- Logs armazenam ação, tipo e identificador do alvo e somente identificadores relacionais necessários; não armazenam senha ou valores de medidas.
- `GET /api/audit-logs` exige autenticação, retorna no máximo 100 ações do próprio usuário e converte metadados para JSON.
- Integração confirma isolamento entre personal e aluno e recusa acesso sem sessão.
- Frontend e infraestrutura: 21 de 21 testes aprovados.
- Backend: 84 de 84 testes aprovados em 10 suítes.

### 2026-07-17 — Bloco 15 concluído e publicado

- [x] Executar backup SQLite validado automaticamente em intervalo configurável.
- [x] Manter retenção limitada e remover somente snapshots automáticos reconhecidos.
- [x] Executar o worker como usuário `node` no mesmo volume persistente.
- [x] Adicionar testes.
- [x] Publicar e confirmar a criação do primeiro snapshot.
- [x] Abrir pull request.

Branch de trabalho: `feat/automated-database-backups`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/42

Resultados locais:

- Novo `backup-worker` aguarda a API saudável, compartilha somente o volume do banco e executa como usuário `node` da imagem endurecida.
- Primeiro ciclo ocorre na inicialização; intervalo padrão é 24 horas e pode ser configurado por `BACKUP_INTERVAL_MS`.
- Retenção padrão mantém sete snapshots e pode ser configurada por `BACKUP_RETENTION`.
- Arquivos automáticos usam nome UTC ordenável; limpeza ignora backups manuais e qualquer arquivo fora do padrão estrito.
- Cada ciclo reutiliza a rotina que verifica tamanho, tabelas e `PRAGMA integrity_check` antes de aplicar retenção.
- Encerramento aguarda o ciclo ativo para não interromper um snapshot em andamento.
- Compose validado com sucesso.
- Frontend e infraestrutura: 25 de 25 testes aprovados.
- Backend: 87 de 87 testes aprovados em 11 suítes.
- Worker publicado como `uid=1000(node)` e iniciado após o healthcheck da API.
- Primeiro snapshot automático criado em `/app/data/backups/database-20260717T181443994Z.sqlite`.
- Snapshot público possui 114688 bytes, integridade `ok`, UID/GID 1000 e foi contabilizado na retenção.
- Worker confirmou intervalo de 86400000 ms e permaneceu ativo aguardando o próximo ciclo.
- API, Nginx, worker de tradução, worker de backup e tunnel permaneceram ativos; healthcheck público respondeu `200`.
- Backup pré-migration criado em `/app/data/database.pre-audit-20260717.sqlite`: 102400 bytes, 11 tabelas e integridade `ok`.
- Migration `202607170001_create_audit_logs.js` aplicada na base pública.
- Tabela e índices `audit_logs_actor_created_idx` e `audit_logs_action_created_idx` confirmados; tabela iniciou vazia como esperado.
- API e Nginx permaneceram saudáveis, worker iniciou sem exceções e healthcheck público respondeu `200`.
- Consulta pública de auditoria sem sessão respondeu `401`, conforme esperado.

### 2026-07-17 — Bloco 12 concluído e publicado

- [x] Adicionar busca instantânea de alunos por nome ou e-mail.
- [x] Adicionar busca instantânea de exercícios por nome ou descrição.
- [x] Exibir contagem e estado vazio acessíveis sem repetir chamadas à API.
- [x] Garantir funcionamento equivalente em desktop e mobile.
- [x] Testar e atualizar a versão dos assets.
- [x] Publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `feat/catalog-list-search`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/39

Resultados locais:

- Busca de alunos considera nome e e-mail; busca de exercícios considera nome e descrição.
- Normalização remove diferenças de maiúsculas, espaços e acentos, permitindo encontrar `Elevação` ao digitar `elevacao`.
- Filtro opera sobre cards já carregados e não dispara novas chamadas à API.
- Contadores anunciam `visíveis de total` e estados vazios específicos aparecem somente quando a consulta não encontra resultados.
- Campos usam `type=search`, nome acessível, foco visível e funcionamento equivalente nas duas interfaces.
- Versão comum dos assets atualizada para `20260717.4`.
- Frontend e infraestrutura: 22 de 22 testes aprovados.
- Backend: 84 de 84 testes aprovados em 10 suítes.
- API e Nginx permaneceram saudáveis e o healthcheck público respondeu `200`.
- HTML público desktop e mobile confirmou os quatro campos/estados acessíveis e assets `20260717.4`.
- JavaScript público confirmou normalização e filtros locais para alunos e exercícios.

### 2026-07-17 — Bloco 13 concluído e publicado

- [x] Representar a aba ativa na URL para personal e aluno.
- [x] Restaurar a aba correta após recarregar a página.
- [x] Fazer os botões Voltar/Avançar navegarem entre abas sem recarregar a interface.
- [x] Preservar a rota ao selecionar automaticamente desktop ou mobile.
- [x] Testar e atualizar a versão dos assets.
- [x] Publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `feat/dashboard-tab-history`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/40

Resultados locais:

- Rotas seguem `#/personal/{aba}` ou `#/student/{aba}` e aceitam somente abas conhecidas do papel autenticado.
- Cliques usam `history.pushState`; inicialização usa `replaceState`; Voltar/Avançar restaura via `popstate` sem recarregar a página.
- Recarregar uma rota válida abre diretamente a aba correspondente após validar a sessão.
- Rotas incompatíveis com o papel são ignoradas e substituídas pela aba inicial segura.
- O seletor de interface mantém o hash ao redirecionar para `desktop.html` ou `mobile.html`.
- Versão comum dos assets atualizada para `20260717.5`.
- Frontend e infraestrutura: 23 de 23 testes aprovados.
- Backend: 84 de 84 testes aprovados em 10 suítes.
- API, Nginx e worker permaneceram saudáveis; healthcheck público respondeu `200`.
- Página pública confirmou `router.js` `20260717.5` e preservação de `window.location.hash`.
- `app.js` público confirmou `pushState`, `replaceState`, restauração por papel e listener de `popstate`.

### 2026-07-17 — Bloco 14 concluído e publicado

- [x] Fixar por digest as imagens Node usadas na compilação e no runtime.
- [x] Fixar por digest as imagens Nginx e Cloudflare Tunnel.
- [x] Adicionar teste que impeça novas imagens externas flutuantes.
- [x] Reconstruir, publicar e validar.
- [x] Abrir pull request.

Branch de trabalho: `fix/pin-container-images`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/41

Resultados:

- Node `20.20.2` fixado em `sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0` nos dois estágios.
- Nginx `1.31.2` fixado em `sha256:54f2a904c251d5a34adf545a72d32515a15e08418dae0266e23be2e18c66fefa`.
- cloudflared `2026.7.2` fixado em `sha256:4f6655284ab3d252b7f28fedb19fe6c8fc82ee5b1295c20ac74d475e5398a52d`.
- Teste automatizado inspeciona todas as instruções `FROM` e todas as imagens do Compose e exige digest SHA-256.
- Compose validado, imagens reconstruídas e todos os containers recriados com sucesso.
- Inspeção dos containers confirmou que Nginx e tunnel executam exatamente os IDs configurados.
- Cloudflare registrou quatro conexões e concluiu os testes de DNS, UDP, TCP e API com ambiente saudável.
- API, Nginx, worker e tunnel permaneceram ativos; healthcheck público respondeu `200`.
- Frontend e infraestrutura: 24 de 24 testes aprovados.
- Backend: 84 de 84 testes aprovados em 10 suítes.

### 2026-07-17 — Bloco 16 concluído e publicado

- [x] Substituir o `prompt()` de redefinição de senha por modal acessível.
- [x] Exigir confirmação da nova senha e apresentar erros junto ao formulário.
- [x] Adicionar controles de visibilidade e estado de envio sem perder os campos em falhas da API.
- [x] Garantir comportamento equivalente em desktop e mobile.
- [x] Testar localmente e atualizar a versão dos assets.
- [x] Publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `feat/password-reset-modal`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/43

Resultados locais:

- Modal acessível incluído nas interfaces desktop e mobile, com retorno aos detalhes do aluno ao cancelar ou concluir.
- Nova senha e confirmação exigem entre 10 e 128 caracteres e possuem controles independentes de visibilidade.
- Divergências e falhas da API são anunciadas junto ao formulário; falhas remotas preservam os campos para correção ou nova tentativa.
- Envios duplicados são bloqueados e o botão informa visualmente o andamento.
- O fluxo não utiliza mais `prompt()`.
- Versão comum dos assets atualizada para `20260717.6`.
- Frontend e infraestrutura: 26 de 26 testes aprovados.
- Backend: 87 de 87 testes aprovados em 11 suítes.
- API, Nginx, workers e tunnel permaneceram ativos; API e Nginx estavam saudáveis e o healthcheck público respondeu `200`.
- HTML público confirmou o modal acessível e os assets `20260717.6`; JavaScript público confirmou o novo manipulador de envio e a ausência do fluxo antigo.
- CI do pull request aprovado nas verificações de frontend/infraestrutura e backend.

### 2026-07-17 — Bloco 21 concluído e publicado

- [x] Aplicar semântica de abas aos dashboards e ao modal de aluno.
- [x] Sincronizar `aria-selected`, foco e visibilidade dos painéis.
- [x] Permitir navegação por setas, Home e End.
- [x] Testar, publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `accessibility/semantic-tabs`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/48

Resultados:

- Autenticação, áreas do personal, áreas do aluno e detalhes do aluno possuem grupos `tablist` identificados.
- Cada aba recebe `role=tab`, `aria-controls`, `aria-selected` e ordem de foco coerentes; cada conteúdo recebe `role=tabpanel`, `aria-labelledby` e visibilidade sincronizada.
- Setas horizontais e verticais circulam entre abas; Home e End selecionam os extremos.
- A ativação por teclado reutiliza o fluxo existente, incluindo carregamento dos dados e atualização da rota.
- Versão comum dos assets atualizada para `20260717.11`.
- Frontend e infraestrutura: 29 de 29 testes aprovados.
- Backend: 87 de 87 testes aprovados em 11 suítes.
- Healthcheck público respondeu `200`; HTML e JavaScript públicos confirmaram grupos, sincronização e navegação por teclado.

### 2026-07-17 — Bloco 22 concluído e publicado

- [x] Associar programaticamente todos os controles visíveis aos seus rótulos.
- [x] Cobrir chats desktop/mobile e formulários dos modais mobile.
- [x] Adicionar teste preventivo para controles sem nome acessível.
- [x] Testar, publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `accessibility/form-control-labels`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/49

Resultados:

- A auditoria encontrou e corrigiu 19 controles sem associação programática: quatro chats e quinze campos de modais mobile.
- Chats receberam nomes contextuais para aluno e personal; os demais controles usam `label[for]` ligado ao `id`.
- Teste automatizado percorre todos os `input`, `select` e `textarea` visíveis de desktop e mobile e exige `id` e nome acessível.
- Frontend e infraestrutura: 30 de 30 testes aprovados.
- Backend: 87 de 87 testes aprovados em 11 suítes.
- Healthcheck público respondeu `200`; HTML público confirmou as associações nos chats e formulários mobile.

### 2026-07-17 — Bloco 23 concluído e publicado

- [x] Restringir imagens remotas ao host oficial do dataset.
- [x] Aplicar a mesma allowlist na API, renderização e CSP.
- [x] Preservar uploads raster embutidos e imagens locais.
- [x] Testar, publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `security/exercise-image-allowlist`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/50

Resultados:

- API rejeita URLs remotas fora de `raw.githubusercontent.com` e orienta usar upload.
- Renderização aceita somente mesma origem, imagens raster embutidas e o host oficial do dataset.
- CSP pública substituiu `img-src ... https:` por `img-src 'self' data: https://raw.githubusercontent.com`.
- Links aprovados continuam disponíveis; uploads GIF, PNG, JPEG e WebP permanecem suportados.
- Assets atualizados para `20260717.13`.
- Frontend e infraestrutura: 30 de 30 testes aprovados.
- Backend: 88 de 88 testes aprovados em 11 suítes.
- API reconstruída e saudável; Nginx recriado e resposta pública `200` confirmou a allowlist nas três camadas.

### 2026-07-17 — Bloco 24 concluído e publicado

- [x] Adicionar ordenação local de alunos por nome e mensagens não lidas.
- [x] Adicionar ordenação local de exercícios por nome.
- [x] Combinar ordenação e busca sem novas chamadas à API.
- [x] Garantir controles acessíveis em desktop e mobile.
- [x] Testar, publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `feat/catalog-list-sorting`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/51

Resultados:

- Alunos podem ser ordenados por nome A–Z, Z–A ou quantidade de mensagens não lidas.
- Exercícios podem ser ordenados por nome A–Z ou Z–A.
- Ordenação reorganiza os cards já renderizados, preserva a busca atual e não chama a API novamente.
- Comparação usa normalização sem acentos e `localeCompare` em português.
- Controles possuem nome acessível e a barra passa a quebrar linha em telas estreitas.
- Assets atualizados para `20260717.14`.
- Frontend e infraestrutura: 31 de 31 testes aprovados.
- Backend: 88 de 88 testes aprovados em 11 suítes.
- Healthcheck público respondeu `200`; HTML e JavaScript públicos confirmaram controles e ordenação local.

### 2026-07-17 — Bloco 25 concluído e publicado

- [x] Criar skeletons reutilizáveis e acessíveis para carregamentos em cards.
- [x] Aplicar em alunos, catálogo e treinos desktop/mobile.
- [x] Respeitar `prefers-reduced-motion`.
- [x] Testar, publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `feat/accessible-loading-skeletons`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/52

Resultados:

- Helper reutilizável cria skeletons com quantidade, variante e mensagem contextual configuráveis.
- Estados usam `role=status`, `aria-label` e `aria-busy`; elementos puramente visuais ficam ocultos de leitores de tela.
- Aplicado em lista de alunos, catálogo, treinos do aluno e treinos dentro do modal de acompanhamento.
- Erros e conclusões removem o estado de carregamento corretamente.
- Shimmer responsivo é desativado com `prefers-reduced-motion: reduce`.
- Assets atualizados para `20260717.15`.
- Frontend e infraestrutura: 32 de 32 testes aprovados.
- Backend: 88 de 88 testes aprovados em 11 suítes.
- Healthcheck público respondeu `200`; JavaScript e CSS públicos confirmaram skeletons, estados ARIA e movimento reduzido.

### 2026-07-17 — Bloco 26 concluído e publicado

- [x] Transformar estados vazios em ações diretas e contextuais.
- [x] Cobrir alunos, catálogo e treinos do personal/aluno.
- [x] Reutilizar fluxos existentes sem handlers inline.
- [x] Testar, publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `feat/actionable-empty-states`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/53

Resultados:

- Lista vazia de alunos oferece `Cadastrar primeiro aluno` e abre a aba correta.
- Catálogo vazio oferece `Criar primeiro exercício` e abre o formulário existente.
- Modal sem treinos oferece `Criar primeira ficha`; aluno sem ficha pode abrir diretamente o chat com o personal.
- Helper reutilizável cria botões via `SafeDOM`, sem HTML ou handlers inline.
- Assets atualizados para `20260717.16`.
- Frontend e infraestrutura: 33 de 33 testes aprovados.
- Backend: 88 de 88 testes aprovados em 11 suítes.
- Healthcheck público respondeu `200`; JavaScript público confirmou as quatro ações contextuais.

### 2026-07-17 — Bloco 27 concluído e publicado

- [x] Exibir total de alunos e mensagens não lidas no dashboard.
- [x] Garantir apresentação equivalente em desktop e mobile.
- [x] Atualizar indicadores sem chamadas adicionais à API.
- [x] Testar, publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `feat/dashboard-student-summary`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/54

Resultados:

- Desktop exibe cartões de total de alunos e mensagens não lidas no cabeçalho.
- Mobile ganhou resumo compacto equivalente acima da busca.
- Valores usam `aria-live=polite` e são derivados do retorno já carregado de alunos.
- Contagem de não lidas é calculada antes do estado vazio e permanece coerente com o badge de navegação.
- Assets atualizados para `20260717.17`.
- Frontend e infraestrutura: 34 de 34 testes aprovados.
- Backend: 88 de 88 testes aprovados em 11 suítes.
- Healthcheck público respondeu `200`; HTML e JavaScript públicos confirmaram os indicadores nas duas interfaces.

### 2026-07-17 — Bloco 28 concluído e publicado

- [x] Bloquear envios duplicados nos formulários internos de aluno, treino, exercício, medição e catálogo.
- [x] Exibir estado de processamento no botão de cada formulário em desktop e mobile.
- [x] Anunciar falhas junto ao formulário e limpar o erro quando o usuário voltar a editar.
- [x] Limpar o formulário do catálogo após uma criação concluída.
- [x] Adicionar teste preventivo para os cinco fluxos.
- [x] Executar testes locais de frontend, infraestrutura e backend.
- [x] Publicar e validar na base pública de testes.
- [x] Abrir pull request.
- [x] Aguardar a CI.

Branch de trabalho: `feat/internal-form-feedback`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/55

Resultados locais:

- Os cinco formulários ignoram novas submissões enquanto a primeira requisição está em andamento.
- Botões ficam desabilitados, recebem `aria-busy` no formulário e apresentam texto específico de carregamento.
- Erros de validação e da API são expostos em regiões `role=alert`, sem remover o aviso global já existente.
- Assets atualizados para `20260717.18`.
- Frontend e infraestrutura: 35 de 35 testes aprovados.
- Backend: 88 de 88 testes aprovados em 11 suítes.
- API e Nginx permaneceram saudáveis; o healthcheck público respondeu `200`.
- HTML e JavaScript públicos confirmaram os assets `20260717.18`, regiões de erro e bloqueio de submissões duplicadas.
- CI do pull request aprovada nas verificações de frontend/infraestrutura e backend.

### 2026-07-17 — Bloco 29 concluído e publicado

- [x] Manter acessível a ação de criar exercício durante a rolagem do catálogo mobile.
- [x] Fixar as ações de novo treino e novas medidas dentro do conteúdo rolável do aluno.
- [x] Evitar largura baseada em `100vw` nos modais mobile.
- [x] Adaptar a altura dos modais às barras dinâmicas do navegador e ao teclado virtual com `100dvh`.
- [x] Adicionar cobertura automatizada das regras visuais.
- [x] Executar testes locais de frontend, infraestrutura e backend.
- [x] Publicar e validar na base pública de testes.
- [x] Abrir pull request.
- [x] Aguardar a CI.

Branch de trabalho: `feat/mobile-sticky-actions`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/56

Resultados locais:

- Ações primárias usam posicionamento aderente somente dentro de suas respectivas áreas roláveis.
- O conteúdo continua reservando espaço normal para os botões, sem ficar oculto atrás deles.
- Modais usam `width: 100%`, `height: 100dvh` e `box-sizing: border-box` no celular.
- Assets atualizados para `20260717.19`.
- Frontend e infraestrutura: 36 de 36 testes aprovados.
- Backend: 88 de 88 testes aprovados em 11 suítes.
- API e Nginx permaneceram saudáveis; o healthcheck público respondeu `200`.
- HTML e CSS públicos confirmaram os assets `20260717.19`, ações aderentes e dimensões dinâmicas dos modais.
- CI do pull request aprovada nas verificações de frontend/infraestrutura e backend.

### 2026-07-17 — Bloco 30 concluído e publicado

- [x] Acrescentar resumo textual ao gráfico de evolução de peso.
- [x] Informar quantidade de registros, período, pesos inicial e final e variação em quilogramas.
- [x] Expor descrição equivalente como nome acessível do SVG.
- [x] Ajustar os cartões para que o resumo não seja cortado em desktop ou mobile.
- [x] Adicionar cobertura automatizada da descrição e da semântica do gráfico.
- [x] Executar testes locais de frontend, infraestrutura e backend.
- [x] Publicar e validar na base pública de testes.
- [x] Abrir pull request.
- [x] Aguardar a CI.

Branch de trabalho: `feat/accessible-weight-trends`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/57

Resultados locais:

- Gráficos com dados exibem um resumo em português, com unidade explícita e variação assinada.
- O SVG recebe `role=img` e `aria-label` com a mesma informação essencial apresentada visualmente.
- Um único registro é descrito sem sugerir tendência inexistente; ausência de registros mantém o estado vazio anterior.
- O SVG preserva sua área de desenho e o cartão cresce para acomodar o resumo, inclusive no modal mobile.
- Assets atualizados para `20260717.20`.
- Frontend e infraestrutura: 37 de 37 testes aprovados.
- Backend: 88 de 88 testes aprovados em 11 suítes.
- API e Nginx permaneceram saudáveis; o healthcheck público respondeu `200`.
- HTML, CSS e JavaScript públicos versionados confirmaram os assets `20260717.20` e o resumo acessível do gráfico.
- CI do pull request aprovada nas verificações de frontend/infraestrutura e backend.

### 2026-07-18 — Bloco 31 concluído e publicado

- [x] Corrigir o `<tbody>` de medições que estava fora de uma tabela no modal mobile.
- [x] Adicionar cabeçalhos com escopo às duas tabelas de histórico mobile.
- [x] Identificar os históricos com legendas acessíveis em desktop e mobile.
- [x] Preservar a leitura das sete colunas com rolagem horizontal controlada no celular.
- [x] Adicionar cobertura automatizada da estrutura HTML e das regras responsivas.
- [x] Executar testes locais de frontend, infraestrutura e backend.
- [x] Publicar e validar na base pública de testes.
- [x] Abrir pull request.
- [x] Aguardar a CI.

Branch de trabalho: `fix/measurement-table-semantics`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/58

Resultados locais:

- O navegador não precisa mais reparar implicitamente o histórico de medições do modal mobile.
- Os dois históricos mobile possuem tabela completa, legenda, cabeçalho e células de coluna com `scope=col`.
- Desktop recebeu legendas equivalentes, mantendo os cabeçalhos existentes.
- A largura mínima de 720 px é aplicada somente aos históricos mobile dentro do contêiner que já oferece rolagem horizontal.
- Assets atualizados para `20260718.1`.
- Frontend e infraestrutura: 38 de 38 testes aprovados.
- Backend: 88 de 88 testes aprovados em 11 suítes.
- API e Nginx permaneceram saudáveis; o healthcheck público respondeu `200`.
- HTML e CSS públicos confirmaram os assets `20260718.1`, as duas tabelas completas e a largura mínima responsiva.
- CI do pull request aprovada nas verificações de frontend/infraestrutura e backend.

### 2026-07-18 — Bloco 32 concluído e publicado

- [x] Impedir armazenamento de respostas da API em caches de navegador e intermediários.
- [x] Remover ETag das respostas potencialmente autenticadas.
- [x] Preservar a política `no-cache` específica do stream SSE do chat.
- [x] Adicionar testes automatizados para respostas comuns e para o stream.
- [x] Executar testes locais de frontend, infraestrutura e backend.
- [x] Reconstruir o backend e validar os cabeçalhos na base pública de testes.
- [x] Abrir pull request.
- [x] Aguardar a CI.

Branch de trabalho: `security/no-store-api-responses`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/59

Resultados locais:

- Respostas comuns recebem `Cache-Control: no-store` e `Pragma: no-cache` antes da autenticação e das rotas.
- O Express deixa de gerar ETag, evitando validadores reutilizáveis para respostas com dados privados.
- O controlador SSE continua sobrescrevendo a política com `Cache-Control: no-cache`, sem quebrar reconexões do EventSource.
- Frontend e infraestrutura: 38 de 38 testes aprovados.
- Backend: 89 de 89 testes aprovados em 11 suítes.
- Backend reconstruído e recriado sem substituir o volume persistente do banco.
- API e Nginx permaneceram saudáveis; o healthcheck público respondeu `200` com `Cache-Control: no-store` e `Pragma: no-cache`, sem ETag.
- CI do pull request aprovada nas verificações de frontend/infraestrutura e backend.

### 2026-07-18 — Bloco 33 concluído e publicado

- [x] Identificar cabeçalhos defensivos duplicados entre backend e Nginx.
- [x] Manter as proteções do backend para acesso direto na rede interna.
- [x] Fazer o Nginx ocultar somente as cópias sobrepostas do upstream.
- [x] Garantir uma política pública única para os cinco cabeçalhos afetados.
- [x] Adicionar cobertura automatizada e validar a sintaxe do Nginx.
- [x] Executar testes locais de frontend, infraestrutura e backend.
- [x] Recriar o Nginx e validar os cabeçalhos na base pública de testes.
- [x] Abrir pull request.
- [x] Aguardar a CI.

Branch de trabalho: `security/deduplicate-proxy-headers`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/60

Resultados locais:

- O Nginx oculta do upstream apenas `Cross-Origin-Opener-Policy`, `Permissions-Policy`, `Referrer-Policy`, `X-Content-Type-Options` e `X-Frame-Options`.
- Cada política continua sendo adicionada uma vez pelo Nginx para respostas estáticas e da API.
- Cabeçalhos exclusivos do Helmet, HSTS, CORS e a política de cache continuam preservados.
- Configuração do Nginx validada com sucesso.
- Frontend e infraestrutura: 39 de 39 testes aprovados.
- Backend: 89 de 89 testes aprovados em 11 suítes.
- Somente o serviço web foi recriado; API, banco, workers e tunnel permaneceram ativos.
- API e Nginx ficaram saudáveis; o healthcheck público respondeu `200` com uma ocorrência de cada política afetada e manteve `Cache-Control: no-store`.
- CI do pull request aprovada nas verificações de frontend/infraestrutura e backend.

### 2026-07-18 — Bloco 34 concluído e publicado

- [x] Reforçar o logout com limpeza explícita de cache e cookies da origem.
- [x] Preservar preferências e progresso local que não representam credenciais.
- [x] Remover a rota privada do histórico antes de voltar à tela de login.
- [x] Atualizar os assets de desktop e mobile.
- [x] Adicionar cobertura automatizada para backend e frontend.
- [x] Executar testes locais de frontend, infraestrutura e backend.
- [x] Reconstruir o backend e validar a publicação na base pública de testes.
- [x] Abrir pull request.
- [x] Aguardar a CI.

Branch de trabalho: `security/harden-logout-cleanup`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/61

Resultados locais:

- O endpoint de logout apaga os cookies de sessão e responde `Clear-Site-Data: "cache", "cookies"`.
- A diretiva não inclui `storage`, preservando tema e marcações locais de treino.
- O frontend substitui a entrada atual do histórico pela URL sem rota privada antes de exibir o login.
- Assets atualizados para `20260718.2`.
- Frontend e infraestrutura: 40 de 40 testes aprovados.
- Backend: 89 de 89 testes aprovados em 11 suítes.
- Backend reconstruído e recriado sem substituir o volume persistente do banco.
- API e Nginx permaneceram saudáveis; o healthcheck público respondeu `200`.
- HTML e JavaScript públicos confirmaram os assets `20260718.2` e a remoção da rota privada no logout.
- CI do pull request aprovada nas verificações de frontend/infraestrutura e backend.

### 2026-07-18 — Bloco 35 concluído e publicado

- [x] Adicionar expiração às chaves de cadastro de personal.
- [x] Definir validade de 7 dias para novas chaves.
- [x] Conceder 30 dias às chaves antigas ainda não utilizadas.
- [x] Revalidar a expiração dentro da transação que consome a chave.
- [x] Informar a validade no comando de geração e atualizar o README.
- [x] Adicionar testes de serviço, API e migração.
- [x] Executar testes locais de frontend, infraestrutura e backend.
- [x] Criar backup, aplicar a migração e validar a base pública de testes.
- [x] Abrir pull request.
- [x] Aguardar a CI.

Branch de trabalho: `security/expire-registration-keys`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/62

Resultados locais:

- Novas chaves recebem `expires_at` sete dias após a emissão e continuam armazenadas apenas como hash.
- Busca e consumo transacional exigem chave não utilizada e com validade futura.
- A migração atribui 30 dias de transição somente às chaves antigas ainda disponíveis; chaves usadas permanecem inalteradas.
- O comando de geração informa que a nova chave expira em 7 dias.
- Frontend e infraestrutura: 40 de 40 testes aprovados.
- Backend: 91 de 91 testes aprovados em 11 suítes.
- Backup consistente criado em `/app/data/database.sqlite.backup`, com integridade `ok`, antes da migração.
- Backend reconstruído; as sete migrações ficaram concluídas e sem pendências.
- Das quatro chaves geradas anteriormente, uma já havia sido utilizada e as três restantes receberam validade até `2026-08-17`, sem expor valores ou hashes durante a verificação.
- A verificação pelo módulo normal do banco completou 32 exercícios padrão ausentes do personal ID 4, conforme a rotina de inicialização existente.
- API e Nginx permaneceram saudáveis; o healthcheck público respondeu `200`.
- CI do pull request aprovada nas verificações de frontend/infraestrutura e backend.

### 2026-07-18 — Bloco 36 concluído e publicado

- [x] Auditar dependências de produção e desenvolvimento.
- [x] Desabilitar Swagger e o JSON OpenAPI por padrão em produção.
- [x] Preservar a documentação por padrão em desenvolvimento.
- [x] Permitir ativação explícita por `API_DOCS_ENABLED=true`.
- [x] Atualizar Compose, `.env.example` e README.
- [x] Adicionar testes automatizados da política de exposição.
- [x] Executar testes locais de frontend, infraestrutura e backend.
- [x] Reconstruir o backend e validar as rotas na base pública de testes.
- [x] Abrir pull request.
- [x] Aguardar a CI.

Branch de trabalho: `security/disable-production-api-docs`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/63

Resultados locais:

- Auditorias npm retornaram zero vulnerabilidades nas dependências de produção e também incluindo desenvolvimento.
- Em `production`, `/api/api-docs` e `/api/swagger.json` não são registrados sem ativação explícita.
- Em `development`, Swagger continua disponível quando a variável não é definida.
- A configuração do Compose permaneceu válida com os cinco serviços.
- Frontend e infraestrutura: 40 de 40 testes aprovados.
- Backend: 94 de 94 testes aprovados em 12 suítes.
- Backend reconstruído e recriado sem substituir o volume persistente do banco.
- API e Nginx permaneceram saudáveis; o healthcheck público respondeu `200`.
- `/api/api-docs/` e `/api/swagger.json` passaram a responder `404` publicamente.
- CI do pull request aprovada nas verificações de frontend/infraestrutura e backend.

### 2026-07-17 — Bloco 20 concluído e publicado

- [x] Dar nome acessível explícito a todos os botões compostos apenas por ícone.
- [x] Cobrir cabeçalhos, chat, catálogo, drawer e fechamentos de modal.
- [x] Corrigir componentes de botão criados dinamicamente.
- [x] Adicionar teste preventivo para desktop, mobile e JavaScript.
- [x] Testar localmente e atualizar a versão dos assets.
- [x] Publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `accessibility/icon-button-labels`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/47

Resultados locais:

- Menu, tema, logout, retorno do chat, criação de exercício e fechamento do drawer receberam nomes explícitos no mobile.
- Tema, logout, retorno do chat e todos os fechamentos de modal receberam nomes explícitos no desktop.
- Fechamentos de modal possuem descrições contextuais em vez do nome genérico aplicado após a inicialização do JavaScript.
- Botões dinâmicos de remover exercício, visualizar execução e excluir do catálogo incluem o nome do exercício no `aria-label`.
- O teste novo encontrou e impediu a permanência de um botão de logout desktop que dependia apenas de `title`.
- Versão comum dos assets atualizada para `20260717.10`.
- Frontend e infraestrutura: 28 de 28 testes aprovados.
- Backend: 87 de 87 testes aprovados em 11 suítes.
- API, Nginx, workers e tunnel permaneceram ativos; API e Nginx estavam saudáveis e o healthcheck público respondeu `200`.
- HTML público desktop e mobile confirmou os nomes acessíveis e assets `20260717.10`; JavaScript público confirmou os três rótulos dinâmicos contextuais.
- CI do pull request aprovado nas verificações de frontend/infraestrutura e backend.

### 2026-07-17 — Bloco 17 concluído e publicado

- [x] Substituir confirmações nativas de exclusão por modal acessível e contextual.
- [x] Manter o modal aberto e exibir erro quando a exclusão falhar.
- [x] Bloquear envios duplicados e informar o estado de processamento.
- [x] Garantir retorno correto ao contexto de aluno ou catálogo em desktop e mobile.
- [x] Testar localmente e atualizar a versão dos assets.
- [x] Publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `feat/accessible-delete-confirmation`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/44

Resultados locais:

- Exclusões de treino, exercício da ficha e exercício do catálogo usam um diálogo comum com título, descrição e botão específicos.
- Conteúdo dinâmico é inserido com `textContent`, sem interpolação de HTML.
- O diálogo permanece aberto em falhas da API, anuncia o erro e permite nova tentativa.
- Envios duplicados são bloqueados e o botão apresenta estado `Excluindo...`.
- Cancelamento, tecla Escape e conclusão restauram o contexto correto; a atualização da tela ocorre após fechar o diálogo.
- O frontend não utiliza mais `confirm()` nativo.
- Versão comum dos assets atualizada para `20260717.7`.
- Frontend e infraestrutura: 27 de 27 testes aprovados.
- Backend: 87 de 87 testes aprovados em 11 suítes.
- API, Nginx, workers e tunnel permaneceram ativos; API e Nginx estavam saudáveis e o healthcheck público respondeu `200`.
- HTML público desktop e mobile confirmou o diálogo e os assets `20260717.7`; JavaScript público confirmou as três ações contextuais e a ausência de `confirm()`.
- CI do pull request aprovado nas verificações de frontend/infraestrutura e backend.

### 2026-07-17 — Bloco 18 concluído e publicado

- [x] Remover estilos inline estáticos das interfaces desktop e mobile.
- [x] Substituir estilos criados por JavaScript por classes CSS.
- [x] Impedir que o helper de DOM volte a criar atributos `style`.
- [x] Remover `'unsafe-inline'` de `style-src` na CSP.
- [x] Testar, reconstruir e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `fix/remove-inline-styles`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/45

Resultados:

- Todos os atributos `style` foram removidos dos HTMLs desktop e mobile e substituídos por classes reutilizáveis.
- Renderizações dinâmicas de alunos, treinos, medidas, chat, catálogo e mídia deixaram de criar estilos inline.
- O helper `SafeDOM.el` não aceita mais a opção `style`, prevenindo reintrodução acidental.
- A CSP publicada removeu `'unsafe-inline'` de `style-src`, mantendo somente CSS local e Google Fonts explicitamente autorizado.
- Teste automatizado falha se HTML ou JavaScript voltar a criar estilos inline ou se a CSP voltar a permitir `'unsafe-inline'`.
- Versão comum dos assets atualizada para `20260717.8`.
- Frontend e infraestrutura: 27 de 27 testes aprovados.
- Backend: 87 de 87 testes aprovados em 11 suítes.
- Configuração do Nginx validada com sucesso antes da recriação do container.
- API, Nginx, workers e tunnel permaneceram ativos; API e Nginx estavam saudáveis e o healthcheck público respondeu `200`.
- Cabeçalho público confirmou a CSP sem estilos inline e HTML público confirmou assets `20260717.8` sem atributos `style`.
- Captura pública mobile em escala equivalente a 390 px confirmou o formulário completo, alinhado e sem regressão visual.

### 2026-07-17 — Bloco 19 concluído e publicado

- [x] Remover conexões não utilizadas com Google Fonts.
- [x] Mover o último bloco de CSS inline do roteador para a folha local.
- [x] Restringir `style-src` e `font-src` da CSP somente à própria origem.
- [x] Ampliar o teste preventivo para todas as páginas HTML.
- [x] Testar, publicar e validar na base pública de testes.
- [x] Abrir pull request.

Branch de trabalho: `security/self-hosted-styles-only`.
Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/46

Resultados:

- As interfaces já utilizavam a pilha de fontes do sistema; três conexões remotas sem efeito visual foram removidas de cada dashboard.
- `index.html` passou a carregar a folha versionada e usa a classe local `router-loading-page`, eliminando o último bloco `<style>`.
- CSP pública restringe `style-src 'self'` e `font-src 'self'`, sem autorizações a Google Fonts.
- Teste automatizado cobre index, desktop e mobile contra blocos, atributos de estilo e hosts remotos de fontes.
- Versão comum dos assets atualizada para `20260717.9`.
- Frontend e infraestrutura: 27 de 27 testes aprovados.
- Backend: 87 de 87 testes aprovados em 11 suítes.
- Configuração do Nginx validada antes da publicação; API, workers e tunnel permaneceram ativos durante a recriação do frontend.
- Resposta pública confirmou healthcheck `200`, assets `20260717.9` e a CSP restrita à própria origem.
- CI do pull request aprovado nas verificações de frontend/infraestrutura e backend.
