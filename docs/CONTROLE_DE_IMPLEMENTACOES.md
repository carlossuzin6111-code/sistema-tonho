# Controle de implementações

Este documento registra o planejamento, a execução, os testes e a entrega de cada bloco de evolução. Ele deve ser atualizado em toda modificação relevante antes do commit e do pull request.

## Fluxo obrigatório

1. Confirmar o estado da `main` e delimitar um bloco pequeno.
2. Registrar diagnóstico, escopo, riscos e critérios de aceite.
3. Criar uma branch exclusiva.
4. Implementar somente o escopo registrado.
5. Executar testes, auditorias e validações proporcionais ao risco.
6. Registrar evidências, limitações e ações externas pendentes.
7. Fazer commit, push e abrir pull request.

## SEC-09 — Proteção e rotação de segredos

- Estado: concluído e mergeado
- Branch: `security/sec-09-secret-hardening`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/79
- Início: 20/07/2026
- Prioridade: 10/10

### Diagnóstico

- O `.env` estava simultaneamente ignorado e rastreado pelo Git.
- A API já rejeitava `JWT_SECRET` ausente ou menor que 32 bytes.
- A CI executava testes, mas não possuía scanner de segredos.
- A remoção de segredos do histórico e a rotação dos valores utilizados são ações externas e coordenadas; não fazem parte deste PR.

### Plano aprovado

- [x] Auditar os arquivos de ambiente, inicialização e CI sem publicar valores.
- [x] Criar branch exclusiva.
- [x] Remover `.env` do índice Git, mantendo-o ignorado localmente.
- [x] Criar `.env.example` sem credenciais reais.
- [x] Rejeitar placeholders e segredos previsíveis em produção.
- [x] Adicionar Gitleaks à CI para examinar o conteúdo atual do repositório.
- [x] Adicionar ou atualizar testes automatizados.
- [x] Executar testes e auditorias locais.
- [x] Abrir PR.
- [x] Acompanhar e registrar o resultado final da CI.

### Critérios de aceite

- `.env` não aparece em `git ls-files`.
- `.env.example` documenta apenas valores seguros ou placeholders explícitos.
- Produção falha antes de iniciar quando o JWT usa placeholder conhecido ou valor previsível.
- A CI falha ao detectar novo segredo no conteúdo versionado.
- Testes do frontend e backend continuam aprovados.

### Evidências

- Frontend: 50/50 testes aprovados.
- Backend: 109/109 testes aprovados após adicionar dois cenários de configuração insegura.
- `npm audit` na raiz: 0 vulnerabilidades.
- `npm audit --omit=dev` no backend: 0 vulnerabilidades.
- Gitleaks 8.30.1 no conteúdo preparado para commit: nenhuma ocorrência.
- Imagem da CI fixada por tag e digest SHA-256 imutável.
- O `.env` local foi preservado, mas deixou de fazer parte do índice Git.
- CI do PR #79: backend, frontend/infraestrutura e secret scan aprovados.

### Pendências externas

- Rotacionar `JWT_SECRET` e `TUNNEL_TOKEN` caso algum valor versionado tenha sido utilizado.
- Avaliar, em manutenção separada e coordenada, a limpeza do histórico Git.

## DB-02 — Concorrência SQLite com WAL e busy timeout

- Estado: concluído e mergeado
- Branch: `db/db-02-sqlite-wal-timeout`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/80
- Início: 20/07/2026
- Prioridade: 9/10

### Diagnóstico

- As configurações `development`, `test` e `production` do Knex não possuem hook de inicialização do pool.
- Nenhuma conexão aplica explicitamente `PRAGMA journal_mode = WAL` ou `PRAGMA busy_timeout = 5000`.
- O estado “Implementado” do checklist não corresponde ao código encontrado na `main`.
- O banco de testes padrão usa `:memory:`; esse modo não permite comprovar WAL, portanto o teste específico deve usar arquivo SQLite temporário.

### Plano aprovado

- [x] Confirmar o merge do SEC-09 e atualizar a `main`.
- [x] Auditar a configuração Knex e os testes de banco existentes.
- [x] Criar branch exclusiva.
- [x] Centralizar os pragmas de concorrência em um `pool.afterCreate` reutilizado por todos os ambientes.
- [x] Aplicar WAL antes de liberar cada conexão ao pool.
- [x] Aplicar `busy_timeout = 5000` em cada conexão.
- [x] Testar os pragmas em banco temporário baseado em arquivo.
- [x] Testar contenção entre duas conexões, garantindo espera em vez de falha imediata com `SQLITE_BUSY`.
- [x] Executar testes e auditorias locais.
- [x] Abrir PR.
- [x] Acompanhar e registrar o resultado final da CI.

### Critérios de aceite

- Todas as configurações SQLite compartilham o mesmo hook de inicialização.
- Banco em arquivo retorna `journal_mode=wal` e `busy_timeout=5000`.
- Uma segunda escrita aguarda a liberação de um lock curto e conclui sem erro.
- Falha ao aplicar qualquer pragma impede que a conexão defeituosa seja entregue ao pool.
- Suítes existentes continuam aprovadas.

### Evidências

- Teste específico `sqliteConcurrency.test.js`: 4/4 aprovado.
- Banco temporário confirmou `journal_mode=wal` e `busy_timeout=5000`.
- Duas instâncias Knex concorrentes concluíram ambas as escritas após um lock curto.
- Erro simulado na inicialização dos pragmas não libera a conexão ao pool.
- Frontend: 50/50 testes aprovados.
- Backend: 113/113 testes aprovados em 13 suítes.
- `npm audit` na raiz: 0 vulnerabilidades.
- `npm audit --omit=dev` no backend: 0 vulnerabilidades.
- Sintaxe dos arquivos JavaScript, integridade do diff e estrutura do Compose aprovadas.
- CI do PR #80: backend, frontend/infraestrutura e secret scan aprovados.

### Fora do escopo

- `PRAGMA foreign_keys = ON`, tratado separadamente no DB-03.
- Migração para PostgreSQL ou múltiplas réplicas da aplicação.

## DB-03 — Habilitação de Foreign Keys por conexão e testes de integridade

- Estado: concluído e mergeado
- Branch: `db/db-03-sqlite-foreign-keys`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/81
- Início: 20/07/2026
- Prioridade: 8/10

### Diagnóstico

- O SQLite exige `PRAGMA foreign_keys = ON` individualmente por cada conexão estabelecida.
- O hook de pool em `backend/knexfile.js` executa WAL e busy_timeout, mas não habilita `foreign_keys`.
- Sem este pragma habilitado por conexão, constraints de chave estrangeira (`ON DELETE CASCADE`, `ON DELETE SET NULL`, bloqueio de FK órfã) declaradas nas migrations Knex não são validadas pelo SQLite em runtime.

### Plano aprovado

- [x] Confirmar o merge do DB-02 e sincronizar a `main`.
- [x] Criar a branch exclusiva `db/db-03-sqlite-foreign-keys`.
- [x] Registrar o plano e diagnóstico em `docs/CONTROLE_DE_IMPLEMENTACOES.md`.
- [x] Atualizar `sqlitePool.afterCreate` em `backend/knexfile.js` para incluir `PRAGMA foreign_keys = ON;`.
- [x] Criar suíte de testes automatizados `backend/src/tests/sqliteForeignKeys.test.js`.
- [x] Validar bloqueio de inserção de registros órfãos (ex: treino sem usuário, exercício de treino sem treino).
- [x] Validar comportamento de deleção em cascata (`ON DELETE CASCADE`) ao excluir pai.
- [x] Validar comportamento `ON DELETE SET NULL` (ex: exclusão de exercício definindo `exercise_id` nulo).
- [x] Executar suíte completa backend, frontend e auditorias de segurança.
- [x] Abrir PR e registrar link no arquivo de controle.
- [x] Acompanhar CI.

### Critérios de aceite

- `PRAGMA foreign_keys` retorna `1` em toda conexão criada pelo Knex.
- Tentativa de inserir registro com FK inexistente lança exceção de violação de FK.
- Exclusão de usuário remove registros associados (`student_profiles`, `workouts`, `workout_exercises`, `measurements`, `chat_messages`) por cascata.
- Exclusão de exercício ajusta `exercise_id` em `workout_exercises` para `NULL`.
- Todos os 113+ testes existentes continuam passando sem regressão.

### Evidências

- Teste específico `sqliteForeignKeys.test.js`: 5/5 aprovado.
- `PRAGMA foreign_keys` verificado como `1` em conexões ativas da aplicação.
- Rejeição de registros órfãos comprovada em `workouts`, `student_profiles` e `workout_exercises`.
- Cascata `ON DELETE CASCADE` validada ao excluir usuário (removeu profile, treinos, exercícios do treino, medições e chat).
- `ON DELETE SET NULL` validado ao excluir exercício customizado (preservou o item de treino definindo `exercise_id` nulo).
- Frontend: 50/50 testes aprovados em 5 suítes.
- Backend: 118/118 testes aprovados em 14 suítes.
- `npm audit` na raiz: 0 vulnerabilidades.
- `npm audit --omit=dev` no backend: 0 vulnerabilidades.
- CI do PR #81: Backend Tests, Frontend & Infrastructure e Secret Scan totalmente aprovados.

## DB-08 — Transações em Cadastros Compostos

- Estado: concluído e mergeado
- Branch: `db/db-08-composite-transactions`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/82
- Início: 20/07/2026
- Prioridade: 7/10

### Diagnóstico

- `createStudent` em `backend/src/controllers/studentController.js` insere primeiro um `user` (função 'student') e em seguida insere em `student_profiles`. Sem transação, se a inserção do perfil falhar, um usuário sem vínculo com personal trainer permanece cadastrado (registro órfão).
- `createWorkout` em `backend/src/controllers/workoutController.js` insere uma ficha em `workouts` e logo após insere os exercícios em `workout_exercises` via loop. Se a gravação de qualquer exercício falhar, o treino fica incompleto no banco.
- Ambos os fluxos compostos devem utilizar `db.transaction(async trx => ...)` para garantir a atomicidade total e rollback automático em caso de erro intermediário.

### Plano aprovado

- [x] Confirmar o merge do DB-03 e sincronizar a `main`.
- [x] Criar a branch exclusiva `db/db-08-composite-transactions`.
- [x] Registrar o plano e diagnóstico em `docs/CONTROLE_DE_IMPLEMENTACOES.md`.
- [x] Refatorar `createStudent` em `backend/src/controllers/studentController.js` para usar `db.transaction`.
- [x] Refatorar `createWorkout` em `backend/src/controllers/workoutController.js` para usar `db.transaction`.
- [x] Criar suíte de testes em `backend/src/tests/transactions.test.js` cobrindo sucesso e rollback automático em falhas simuladas de cadastros compostos.
- [x] Executar suítes de testes do backend, frontend e auditoria de segurança.
- [x] Abrir PR e registrar link no arquivo de controle.
- [x] Acompanhar CI.

### Critérios de aceite

- Criação de aluno e perfil roda em transação única. Falha no perfil desfaz a criação do usuário.
- Criação de treino e lista de exercícios roda em transação única. Falha em qualquer exercício desfaz a criação do treino.
- Suítes de testes automatizados comprovam o comportamento transacional e ausência de resíduos no banco.
- Nenhuma regressão nos testes existentes de estudantes, treinos e autenticação.

### Evidências

- Teste específico `transactions.test.js`: 4/4 aprovados.
- Criação atômica de usuário e perfil de estudante validada; falha no perfil comprovadamente reverte a criação do usuário sem deixar registro órfão.
- Criação atômica de ficha e exercícios de treino validada; falha em exercício individual reverte a criação do treino e de todos os exercícios da lista.
- Frontend: 50/50 testes aprovados em 5 suítes.
- Backend: 122/122 testes aprovados em 15 suítes.
- `npm audit` na raiz: 0 vulnerabilidades.
- `npm audit --omit=dev` no backend: 0 vulnerabilidades.
- CI do PR #82: Backend Tests, Frontend & Infrastructure e Secret Scan totalmente aprovados.

## SEC-01 — Matriz de Testes contra IDOR (Insecure Direct Object Reference)

- Estado: em andamento
- Branch: `security/sec-01-idor-test-matrix`
- Pull request: pendente
- Início: 20/07/2026
- Prioridade: 6/10

### Diagnóstico

- O sistema gerencia recursos sensíveis de múltiplos locatários (Personal Trainers e Alunos vinculados).
- Tentativas de acesso direto a IDs de recursos (perfis de alunos, treinos, exercícios de treino, medições, histórico de chat, avatares e exercícios do catálogo) pertencentes a outro Personal Trainer ou Aluno devem ser negadas de forma consistente com HTTP 403 ou 404.
- É necessário construir uma matriz completa de testes automatizados de controle de acesso cruzado (cross-tenant IDOR matrix) envolvendo 4 identidades distintas: Personal Trainer A, Aluno A1 (vinculado a A), Personal Trainer B e Aluno B1 (vinculado a B).

### Plano aprovado

- [x] Confirmar o merge do DB-08 e sincronizar a `main`.
- [x] Criar a branch exclusiva `security/sec-01-idor-test-matrix`.
- [x] Registrar o plano e diagnóstico em `docs/CONTROLE_DE_IMPLEMENTACOES.md`.
- [x] Criar suíte de testes dedicada `backend/src/tests/idorMatrix.test.js` cobrindo a matriz completa de 4 usuários e todos os recursos expostos pela API.
- [x] Testar tentativa de acesso de Personal A a dados de Aluno B1 (detalhes, treinos, medições, redefinição de senha, chat, avatar).
- [x] Testar tentativa de acesso de Aluno A1 a dados de Aluno B1 (detalhes, medições, treinos, chat, avatar).
- [x] Testar tentativa de manipulação cruzada de treinos/exercícios por Personal B em recursos pertencentes a Personal A.
- [x] Executar suítes de testes do backend, frontend e auditorias de segurança.
- [ ] Abrir PR e registrar link no arquivo de controle.
- [ ] Acompanhar CI.

### Critérios de aceite

- A suíte de testes cobre acessos legítimos e não autorizados para todos os endpoints com ID de recurso.
- Qualquer tentativa de IDOR resulta em HTTP 403 Forbidden ou 404 Not Found conforme a especificação do endpoint.
- Nenhuma vazamento de dados de outros tenants é permitido sob nenhuma combinação de papéis.
- Todos os testes existentes do sistema permanecem aprovados.

### Evidências

- Teste específico `idorMatrix.test.js`: 20/20 aprovados.
- Matriz de testes de controle de acesso cruzado (4 identidades: Personal A, Aluno A1, Personal B, Aluno B1) comprovando bloqueio rígido a acessos diretos não autorizados (IDOR).
- Bloqueio de acesso cruzado verificado nos endpoints de perfil de aluno, redefinição de senha, histórico de medições, criação/deleção/alteração de treinos e exercícios, chat em tempo real e visualização de avatares.
- Frontend: 50/50 testes aprovados em 5 suítes.
- Backend: 142/142 testes aprovados em 16 suítes.
- `npm audit` na raiz: 0 vulnerabilidades.
- `npm audit --omit=dev` no backend: 0 vulnerabilidades.



