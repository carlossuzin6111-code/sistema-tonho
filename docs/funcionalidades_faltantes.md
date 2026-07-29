# Inventário Técnico Detalhado e Especificações de Lacunas (FitLife Sync)

Este documento atua como o inventário de engenharia contendo especificações de banco de dados, rotas de API, regras lógicas e de segurança para todas as lacunas identificadas e novos itens obrigatórios.

**Convenção:** o estado de execução pertence ao dashboard `checklist_prioridades.md`; este arquivo descreve o estado-alvo. Quando já existe implementação parcial, a especificação abaixo representa somente o delta necessário para concluir o requisito.

---

## 1. Segurança e Controle de Acesso (Grupo SEC)

### [SEC-01] Proteção contra IDOR (Verificação de Vínculo de Aluno)
*   **Especificação**: Middleware `validateStudentOwnership` no Express. Para rotas parametrizadas por `:studentId`, consulta a tabela `student_profiles` cruzando o `student_id` com o `personal_id` extraído do payload JWT decodificado.
*   **Endpoint**: Aplicado como interceptor em `/api/workouts/*`, `/api/measurements/*`, e `/api/chat/*`.
*   **Regra**: Bloquear com `403 Forbidden` se não houver relacionamento ativo de treinamento ou se o status do vínculo for `blocked`.

### [SEC-02] Onboarding Compulsório (`must_change_password`)
*   **Implementação atual**: A migration `202607290001_add_must_change_password.js` adiciona `users.must_change_password` (BOOLEAN, `NOT NULL`, default `FALSE`). Contas pessoais nascem liberadas; contas de aluno criadas pelo Personal recebem `TRUE` porque começam com senha temporária.
*   **Regra**: No login e em `GET /api/auth/me`, a API expõe `mustChangePassword`. Enquanto o sinal estiver ativo, o middleware responde `428 PASSWORD_CHANGE_REQUIRED` para rotas protegidas, mantendo apenas `GET /api/auth/me`, logout e `PUT /api/profile/password` acessíveis.
*   **Conclusão do fluxo**: O frontend abre o modal de troca obrigatória, esconde o fechamento e as abas de edição, e só libera a aplicação após senha válida (mínimo de 10 caracteres). A alteração incrementa a versão de sessão, revoga tokens anteriores e limpa o sinal.
*   **Reset administrativo**: Quando o Personal redefine a senha de um aluno, o sinal volta para `TRUE`, obrigando nova troca no próximo acesso. O reset autônomo por e-mail também limpa o sinal ao concluir.
*   **Evidência**: `backend/src/tests/onboarding.test.js`, `api.test.js`, `passwordReset.test.js` e `migrations.test.js` cobrem migration, bloqueio, troca, revogação e desbloqueio.

### [SEC-03] Sistema de Convites de Aluno com Expiração
*   **Implementação atual**: `POST /api/personal/students/invite` cria convite transacional para o Personal autenticado. O token bruto só é retornado fora de produção para integração/testes; o banco armazena exclusivamente SHA-256.
*   **Expiração e replay**: validade de 72 horas, substituição de convite aberto para o mesmo e-mail/Personal e rejeição de e-mail já cadastrado. A migration adiciona FK para `users`, unicidade por e-mail/Personal e `claimed_at` para uso único.
*   **Especificação**: Tabela `student_invitations`:
    ```text
    - id (INTEGER, PK)
    - email (VARCHAR, UNIQUE)
    - personal_id (INTEGER, FK -> users)
    - onboarding_token (VARCHAR, UNIQUE)
    - expires_at (TIMESTAMP)
    - claimed_at (TIMESTAMP, NULLABLE)
    ```
*   **Endpoint pendente**: integração de entrega via Resend/Nodemailer e endpoint de aceite que valide o token, crie a conta com senha temporária e marque `claimed_at` na mesma transação.
*   **Registro da entrega atual**: PR #90 (`security/sec-03-student-invitations`), commit `05efe29`, testes focados `studentInvitations.test.js` + `migrations.test.js` (8/8). O item permanece **Parcial** até a entrega e o aceite serem implementados.
*   **Aceite implementado em seguida**: `POST /api/auth/student-invitations/claim` valida expiração e uso único, cria `users` + `student_profiles` na mesma transação e bloqueia replay. Testes adicionais: 5/5. Continua pendente somente a entrega por e-mail.
*   **Entrega de e-mail implementada**: `emailDeliveryService.js` usa Resend quando `RESEND_API_KEY` e `EMAIL_FROM` estão configurados, com `APP_BASE_URL` para o link. Em ambientes sem configuração retorna estado explícito `not_configured`, sem incluir o token na resposta de produção. A pendência restante é operacional (segredos/domínio/remetente).

### [SEC-04] Reset de Senha Autônomo para Personais
*   **Especificação**: Tabela `password_reset_tokens`:
    ```text
    - id (INTEGER, PK)
    - user_id (INTEGER, FK -> users)
    - token_hash (VARCHAR, UNIQUE)
    - expires_at (TIMESTAMP)
    ```
*   **Endpoint**: `POST /api/auth/forgot-password` (envia e-mail com link) e `POST /api/auth/reset-password` (valida o hash e atualiza `users.password`).

### [SEC-05] Verificação de E-mail
*   **Implementação atual**: Migration `202607290003_add_email_verification.js` adiciona `users.email_verified_at` e tabela de tokens com hash, validade de 24 horas, uso único e FK para `users`. O cadastro pessoal emite token e usa o adaptador Resend quando configurado.
*   **Endpoint**: `POST /api/auth/verify-email` confirma o token de forma transacional, marca o e-mail e rejeita replay/expiração.
*   **Contrato de sessão**: login e `GET /api/auth/me` expõem `emailVerified` sem revelar tokens.
*   **Regra**: Contas novas recebem e-mail de ativação. Bloquear redefinição de senha e onboarding para contas cujo e-mail não esteja verificado.
*   **Pendências**: aplicar bloqueios de política no reset/onboarding e criar a tela frontend de confirmação.
*   **Política adicionada**: `forgot-password` mantém resposta genérica e não cria token para contas sem `email_verified_at`; o frontend sinaliza a necessidade de confirmação. O bloqueio específico de onboarding/login e uma tela dedicada continuam como próximos passos.
*   **Confirmação frontend**: URLs com `?token=...` são processadas no carregamento da aplicação, chamam o endpoint de confirmação e anunciam sucesso/erro por toast acessível.

### [SEC-06] Proteção contra CSRF Segregada
*   **Especificação**:
    *   **Web**: Cookies `HttpOnly` com `SameSite=Strict` mais cabeçalho `Origin` / `Referer`.
    *   **API/Mobile**: Uso de tokens CSRF baseados em *Double Submit Cookie* para requisições que não utilizem cabeçalhos de autorização nativos (Bearer).
*   **Estado atual relevante**: o fluxo web por cookie já usa double-submit (`X-CSRF-Token` + cookie + claim da sessão). O delta é definir/testar autenticação Bearer e refresh token rotacionado para o aplicativo híbrido.
*   **Entrega atual**: mutações via cookie agora validam `Origin`/`Referer` contra `APP_ORIGIN` (ou host da requisição) além do double-submit, com rejeição `403` para origem não confiável. Requisições Bearer não recebem CSRF de cookie. Falta implementar refresh token rotacionado.

### [SEC-07] Rate Limit Combinado (IP + Conta)
*   **Especificação**: Middleware Express Rate Limit com armazenamento Redis/memory associando o IP da requisição com o e-mail submetido no payload para evitar brute force distribuído.
*   **Estado atual relevante**: existe rate limit por IP e tipo de operação, com tentativas bem-sucedidas ignoradas; não foi encontrada chave combinada por conta/e-mail. Em múltiplas réplicas, o armazenamento deve ser compartilhado.
*   **Entrega atual**: o rate limit agora usa chave composta por IP normalizado + e-mail, evitando que ataques contra uma única conta compartilhem apenas o orçamento global de IP. A memória local continua sendo a limitação para múltiplas réplicas; Redis permanece pendente.

### [SEC-08] PAR-Q e Assinatura Eletrônica de Termos (Waivers)
*   **Entrega atual**: tabela `signed_waivers` com FK, versão dos termos, JSON do PAR-Q, IP, data e unicidade por usuário/versão; `POST /api/profile/waivers` registra a assinatura e retorna o registro existente em reenvio idempotente.
*   **Especificação**: Tabela `signed_waivers`:
    ```text
    - id (INTEGER, PK)
    - user_id (INTEGER, FK -> users)
    - terms_version (VARCHAR)
    - parq_answers (JSON)
    - ip_address (VARCHAR)
    - signed_at (TIMESTAMP)
    ```
*   **Regra**: Bloquear acessos do aluno no app caso não possua registro de aceite ativo para a versão vigente de termos.

### [SEC-09] Validação e Rotação de Segredos na CI
*   **Especificação**: Bloquear carregamento da API Express se chaves criptográficas (`JWT_SECRET`, etc.) usarem valores padrões ou inseguros. Scanner de segredos (ex: Gitleaks) ativado na esteira do GitHub Actions.

---

## 2. Infraestrutura, Banco de Dados e Persistência (Grupo DB)

### [DB-01] Persistência Física (Docker Named Volumes)
*   **Especificação**: Manter o volume nomeado já existente para SQLite (`db-data:/app/data`) e garantir que `AVATAR_DIR`/demais uploads apontem para armazenamento persistente, com backup, quota e permissões documentadas. Não criar dois mounts divergentes para o mesmo diretório lógico.

### [DB-02] Contenção de Escrita SQLite (WAL e Timeout)
*   **Especificação**: Inicialização do Knex em `backend/knexfile.js` executando pragmas de concorrência (`WAL`, `busy_timeout = 5000`).

### [DB-03] Ativação e Testes de Foreign Keys
*   **Especificação**: Garantir execução de `PRAGMA foreign_keys = ON;` no pool SQLite e cobertura de testes garantindo rejeição de deleções físicas que rompam chaves estrangeiras sem cascade explícito.

### [DB-04] Backup Seguro (VACUUM INTO)
*   **Especificação**: Manter o script existente com `VACUUM INTO`, `PRAGMA integrity_check`, retenção e worker; complementar com restore automatizado periódico e envio off-site em **DB-05**.

### [DB-05] Backup Off-Site com RPO/RTO
*   **Especificação**: Integração com Cloudflare R2 ou Amazon S3 para upload seguro do arquivo de backup encriptado, com retenção programada (7 diários, 4 semanais, 1 mensal) e runbook documentado de restore.

### [DB-06] Governança de Migrations e Deploy Expand/Contract
*   **Especificação**: Scripts de migrations devem ser transacionais e retrocompatíveis. O deployment de novos esquemas deve ser feito em duas fases (Phase 1: Add new table/column nullable; Phase 2: Deploy code using it and drop old fields in future release).

### [DB-07] Constraints de Domínio e Índices Relacionais
*   **Especificação**: Migrations criando índices de cobertura em `chat_messages(sender_id, receiver_id)`, `workouts(student_id)` e constraints `UNIQUE` de tabelas pivô de exercícios.

### [DB-08] Atomicidade de Escrita em Cadastros Compostos
*   **Especificação**: No controller de criação de fichas (`createWorkout`), envolver a inserção da ficha (`workouts`) e exercícios vinculados (`workout_exercises`) dentro de uma transação Knex (`knex.transaction`), garantindo rollback total sob falha parcial.

### [DB-09] Restrições de Domínio de Unidades (Evitar Floats)
*   **Entrega atual**: migration `202607290005_add_domain_constraints.js` adiciona triggers de banco para peso positivo, medidas não negativas e séries positivas, protegendo gravações que contornem a API. Testes `domainConstraints.test.js` cobrem rejeição direta no SQLite.
*   **Especificação**: Armazenar pesos e medidas em inteiros (ex: gramas para pesos, milímetros para perímetros biológicos) ou decimal de precisão fixa, prevenindo inconsistências de ponto flutuante em comparadores matemáticos.

---

## 3. Desempenho, UX e UI (Grupo UX)

### [UX-01] Paginação de Chat Baseada em Cursor
*   **Implementado no backend**: Endpoint `/api/chat/:userId?before=<msgId>&limit=<1..50>` executa consulta limitada por ID, ordena por data/ID de forma determinística e devolve `{ messages, nextCursor }`. Sem parâmetros, mantém a resposta em array para compatibilidade com os clientes atuais.
*   **Pendente**: integrar carregamento incremental no frontend (scroll/botão), preservando mensagens recebidas pelo SSE.

### [UX-02] Virtual Scrolling no Catálogo
*   **Implementado**: O catálogo mantém busca e ordenação em memória, mas monta somente uma janela de até 15 cartões por vez, com overscan de duas posições e spacers fixos para preservar a rolagem. O viewport possui rolagem própria e uma coluna no mobile.
*   **Pendente**: QA visual com milhares de exercícios para calibrar a altura média do cartão e confirmar a experiência em diferentes larguras.

### [UX-03] Conversão e Tratamento de Timezones
*   **Implementado no frontend**: `AppDateTime` interpreta valores SQLite sem sufixo como UTC e usa exclusivamente `Intl.DateTimeFormat` para converter datas, horas e gráficos ao fuso local do navegador. As páginas carregam o utilitário com a mesma versão de cache-busting.
*   **Pendente no backend**: normalizar serialização das colunas temporais legadas para ISO 8601 com `Z` e auditar endpoints administrativos restantes.

### [UX-04] Bloqueio de Base64 e Remoção de Mídias Órfãs
*   **Implementado**: O avatar é validado por assinatura e `sharp`, convertido para WebP via arquivo temporário/rename, limitado a 2 MiB por usuário e reconciliado após troca ou remoção. Falha de transação remove o novo arquivo para evitar órfãos; falha de limpeza posterior é registrada sem apagar o arquivo referenciado pelo banco.
*   **Pendente**: tarefa periódica de reconciliação global, persistência explícita de quota por tenant e migração dos novos uploads para binário/multipart em vez de Base64.

### [UX-05] Controle de Cache no Nginx e Cache-Busting
*   **Implementado**: Nginx revalida HTML com `no-cache, must-revalidate` e serve CSS/JS versionados com `max-age=31536000, immutable`; a suíte verifica que todos os assets locais compartilham a versão e que as diretivas existem.
*   **Pendente**: substituir a versão manual por hashing automatizado no build e validar que nenhum HTML publicado referencia assets removidos.

### [UX-06] Controle de Concorrência (Optimistic Locking)
*   **Implementado parcialmente**: Migration adiciona `version` inteiro aos registros de usuários, fichas, itens de ficha e exercícios. Atualização de nome de perfil e favoritos de exercício verificam `If-Match`, incrementam a versão atomicamente e retornam `409 Conflict` em divergência; sem cabeçalho, a compatibilidade legada é mantida.
*   **Pendente**: aplicar o mesmo contrato a todas as mutações editáveis e fazer o frontend enviar/atualizar automaticamente o cabeçalho `If-Match`.

### [UX-07] Acessibilidade WCAG 2.2 AA
*   **Implementado parcialmente**: além do Focus Trap, `aria-live` e `prefers-reduced-motion` já existentes, a folha global garante indicador de foco de 3px para controles navegáveis, inclusive componentes sem regra específica.
*   **Pendente**: auditoria manual com leitor de tela, medição formal de contraste e validação de todos os fluxos apenas por teclado.

### [UX-08] Hardening de Uploads e Cotas de Mídia
*   **Implementado parcialmente**: validação de assinaturas/MIME, nomes aleatórios fora da área pública, limite Nginx de `600K`, quota configurável de avatar por usuário e quota agregada de 20 MiB para imagens Base64 do catálogo. Excesso retorna `413` e não grava o registro.
*   **Pendente**: preferir multipart/binário para novos uploads e executar reconciliação global periódica de arquivos/linhas órfãs.

---

## 4. Lógica de Negócio e Operações (Grupo BUS)

### [BUS-01] Execução Real de Treino (Histórico de Sessões)
*   **Especificação**: Persistência do treino realizado pelo aluno.
*   **Tabelas**:
    *   `workout_sessions` (IDs de vínculos, data de início, término, status `started` / `completed` / `abandoned`).
    *   `exercise_logs` (séries concluídas, repetições reais, carga levantada, RPE percebido de 1 a 10).

### [BUS-02] Estados de Publicação da Ficha de Treino
*   **Implementado parcialmente**: Fichas possuem campo `status` (`'draft'`, `'published'`, `'archived'`), protegido por triggers SQLite. O aluno só visualiza treinos publicados; ao publicar uma ficha, as anteriores do mesmo aluno/personal são arquivadas em uma transação.
*   **Pendente**: integrar seletor/indicador de publicação no frontend e registrar auditoria específica das transições.

### [BUS-03] Ciclo de Vida do Aluno e do Vínculo
*   **Implementado parcialmente**: usuários possuem `account_status` (`active`, `suspended`, `archived`) e vínculos possuem `relationship_status` (`invited`, `active`, `paused`, `blocked`), ambos protegidos no SQLite. Personal pode atualizar o aluno vinculado pelo endpoint de lifecycle.
*   **Pendente**: bloquear autenticação/execução conforme status e integrar abas/filtros de ativos, pausados e arquivados no frontend.
*   **Especificação original**:
    *   **Status da Conta**: `active`, `suspended`, `archived` (soft-deleted).
    *   **Status do Vínculo**: `invited`, `active`, `paused`, `blocked`.
    *   **Regra**: Alunos pausados retêm acesso read-only ao histórico, mas perdem chat e execução de treinos ativos.

### [BUS-04] Anamnese Clínica (Assessments)
*   **Implementado parcialmente**: Tabela `student_assessments` registra nível de experiência, limitações anatômicas e lesões clínicas, separando `personal_notes` (privado) de `student_notes` (compartilhado). Endpoints autenticados validam o vínculo e nunca expõem as notas privadas ao aluno.
*   **Pendente**: tela de anamnese, edição/versionamento e auditoria clínica.

### [BUS-05] Aderência Semanal e Ordenação no Dashboard
*   **Especificação**: Cálculo matemático: `aderência = treinos concluídos / treinos previstos`. Ordenações no painel do Personal por alunos com menor frequência ou maior tempo sem treinar.

### [BUS-06] Progressão de Carga e Recordes Pessoais
*   **Implementado parcialmente**: Endpoint calcula volume acumulado (`séries × repetições × carga`) a partir de sessões concluídas, recorde de volume e última carga/repetições por exercício.
*   **Pendente**: cálculo de 1-RM com fórmula explícita, sugestões integradas na tela de execução e visualização histórica.

### [BUS-07] Temporizador de Descanso e Sessão Ativa
*   **Implementado parcialmente**: Sessões possuem `last_activity_at`, atualizado ao iniciar e registrar progresso; endpoint heartbeat autenticado mantém a sessão ativa e respeita ownership.
*   **Pendente**: temporizador visual, polling/heartbeat automático e recuperação da sessão no frontend.

### [BUS-08] Fila Local (IndexedDB) e Chave de Idempotência
*   **Especificação**:
    *   Fila local no cliente (`IndexedDB`) guardando logs quando desconectado.
    *   Envio das rotas com o cabeçalho `Idempotency-Key: <UUID>` para prevenir que reenvios causados por oscilações gerem duplicidade de treinos/pesos.
*   **Progresso em 29/07/2026**: `frontend/js/api.js` implementa armazenamento FIFO, reenvio automático no evento `online` e chaves únicas nas mutações de sessões. A migration `202607290011_create_idempotency_keys.js` e o middleware autenticado persistem respostas 2xx para que reenvios retornem o mesmo resultado sem duplicar a operação.
*   **Pendente**: aplicar a fila a outros fluxos mutáveis, definir retenção/limpeza e expor telemetria de itens pendentes para suporte operacional.

### [BUS-09] Chaves de Cadastro de Personais via CLI
*   **Especificação**: Script administrativo CLI no node para emitir, auditar vigência e invalidar as chaves de acesso exigidas no cadastro de novos instrutores.
*   **Progresso em 29/07/2026**: `node src/scripts/createAccessKey.js create` emite a chave uma única vez; `list` audita ID, datas e uso sem expor hashes; `revoke <id>` invalida chaves não utilizadas. O serviço mantém expiração de sete dias e hash SHA-256.
*   **Pendente operacional**: executar a CLI em ambiente controlado e integrar armazenamento/rotação de segredos do operador.

### [BUS-10] Edição e Exclusão de Mensagens no Chat
*   **Especificação**: Endpoints `PUT /api/chat/:messageId` e `DELETE /api/chat/:messageId` atualizando as streams SSE ativas dos envolvidos.
* **Progresso em 29/07/2026**: Migration `202607290013_add_chat_message_lifecycle.js` adiciona `edited_at`/`deleted_at`; somente o remetente pode alterar a mensagem. A exclusão é soft-delete, o histórico retorna `message: null` e os eventos SSE `message.updated`/`message.deleted` são enviados ao remetente e destinatário.
* **Pendente**: controles de edição/exclusão no frontend e renderização dos eventos SSE com indicação acessível de mensagem alterada/removida.

### [BUS-11] Indicador de "Digitando..." via SSE
*   **Especificação**: Evento leve `event: typing` enviado pelo Express a partir de chamadas rápidas `POST /api/chat/typing` com de-bounce.
* **Progresso em 29/07/2026**: `POST /api/chat/typing` autoriza somente parceiros vinculados e publica evento transitório sem gravar texto. O frontend usa debounce de 350 ms, mantém uma única expiração visual de 3 s e anuncia o estado com `role=status`/`aria-live` em desktop e mobile.
* **Pendente**: QA visual, tratamento explícito quando offline e calibração do debounce conforme uso real.

### [BUS-12] Inativação e Abas de Filtragem de Alunos
*   **Especificação**: Possibilidade de inativar alunos antigos sem deletar seu prontuário físico e separação por abas "Ativos" / "Inativos" na listagem.
*   **Progresso em 29/07/2026**: o dashboard separa Ativos, Inativos e Todos usando os status de conta/vínculo já persistidos; a filtragem não remove histórico nem registros clínicos.
*   **Pendente**: filtro no endpoint, confirmação acessível para transições e auditoria específica de inativação.

### [BUS-13] Periodização Biomecânica Ondulatória
*   **Especificação**: Suporte a templates e variações de carga/volume estruturadas em microciclos na ficha do aluno, fugindo de fichas estáticas lineares de musculação.
*   **Progresso em 29/07/2026**: migration `workout_microcycles` e endpoints autenticados `PUT/GET /api/workouts/:id/periodization` permitem até 52 semanas sequenciais, intensidade percentual, multiplicador de volume e notas; a gravação substitui o plano em uma transação e valida ownership.
*   **Pendente**: editor visual, regras biomecânicas específicas por exercício e versionamento/auditoria das alterações clínicas.

### [BUS-14] Governança do Catálogo de Exercícios
*   **Especificação**: Deduplicação do catálogo e separação em exercícios base globais compartilhados vs customizados criados pelos treinadores.

---

## 5. Observabilidade, Governança e Negócio (Grupo OPS)

### [OPS-01] Isolamento de Tenant (Subscriptions)
*   **Especificação**: Tabela `subscriptions` vinculada à conta do Personal. Middleware bloqueia acessos retornando `402 Payment Required` em caso de mensalidade da licença expirada.

### [OPS-02] Gestão de Equipe (Head/Junior) e Split de Receitas
*   **Especificação**: Papéis corporativos com coordenação de equipes de personais juniores associados, bibliotecas compartilhadas e migrações em lote sob desligamento de instrutores.

### [OPS-03] Acesso Multiprofissional (Parceiros Clínicos)
*   **Especificação**: Contas do tipo parceiro read-only (Nutricionistas, Fisioterapeutas). Mediante consentimento explícito do aluno, eles acessam logs de treino e realizam upload de exames.

### [OPS-04] Integração com Wearables
*   **Especificação**: Conectores e adaptadores assíncronos para Apple HealthKit, Google Fit/Health Connect e Garmin. Ingestão passiva de sono e HRV para sugerir autorregulação.

### [OPS-05] Alertas CRM de Churn e NPS
*   **Especificação**: Tarefas diárias no node-cron alertando personais sobre alunos inativos há mais de 5 dias consecutivos e envio automatizado de pesquisas NPS.

### [OPS-06] Check-ins por Geofencing e Agendamentos
*   **Especificação**: Validação de presença presencial baseada em coordenadas GPS de geocercas ou conexão Wi-Fi da academia. Sincronização ICS.

### [OPS-07] Check-in de Prontidão Física Diária (Readiness)
*   **Especificação**: Escalas de 1 a 5 para DOMS, sono, fadiga e humor respondidos pelo aluno antes de abrir a ficha de treino do dia.

### [OPS-08] Centro de Preferências de Notificações
*   **Especificação**: Mapeamento de canais de recebimento (WhatsApp, E-mail, Push) para cada tipo de evento nas configurações de conta do usuário.

### [OPS-09] Exportação e Anonimização de Dados (LGPD)
*   **Especificação**: Endpoints `/api/compliance/export` e `/api/compliance/delete` (anonimizando informações identificáveis na exclusão permanente).

### [OPS-10] Health Checks Liveness/Readiness
*   **Especificação**: Endpoint `/health/live` (status do runtime) e `/health/ready` (valida conexão com SQLite e se há migrations pendentes no Knex).

### [OPS-11] Sessões por Dispositivo (`user_sessions`)
*   **Especificação**: Tabela `user_sessions` para listar e revogar tokens de dispositivos individuais sem invalidar a chave JWT global da conta.

### [OPS-12] Backoffice de Suporte com Impersonation Seguro
*   **Especificação**: Função de impersonação de conta pelo administrador com geração de log de auditoria associado a tickets e justificativa.

### [OPS-13] Logs Estruturados, Métricas e Alertas
*   **Especificação**: Logs em formato JSON na API, redação automática de CPFs/Senhas nos payloads, métricas RED de latência e alertas sob erros `SQLITE_BUSY`.

### [OPS-14] CI/CD Obrigatória
*   **Especificação**: Pipelines no GitHub Actions exigindo testes unitários/integrados, auditoria npm, scanner de segredos e checagem de migrations antes de aprovar pull requests.

---

## 6. Empacotamento Híbrido Mobile APK (Grupo MOB)

### [MOB-01] Wrapper Híbrido com Capacitor
*   **Especificação**: Configuração de Capacitor CLI apontando para a pasta frontend estática (`--web-dir=frontend`) e compilação do APK Android.

### [MOB-02] Resolução Dinâmica de Base URL da API
*   **Especificação**: Código frontend JavaScript detectando a existência de `window.Capacitor` para injetar a URL base de produção nos requests à API de forma condicional.

### [MOB-03] CORS para WebViews Locais
*   **Especificação**: Whitelist do backend Express aceitando requisições oriundas de `http://localhost` (WebView Android) e `capacitor://localhost` (WebView iOS).

### [MOB-04] Armazenamento Seguro de Chaves (Secure Storage)
*   **Especificação**: Em ambiente híbrido móvel, armazenar JWT localmente via plugin `@capacitor-community/secure-storage` integrado ao Keystore/Keychain nativo do celular.
