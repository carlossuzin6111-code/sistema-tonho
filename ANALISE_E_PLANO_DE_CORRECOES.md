
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
