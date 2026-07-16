
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
