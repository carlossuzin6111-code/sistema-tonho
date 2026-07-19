# Dashboard Executivo e Matriz de Priorização (FitLife Sync)

Este documento atua como o painel executivo para controle de progresso e roadmap de desenvolvimento, organizando todas as lacunas identificadas por identificadores estáveis e dependências lógicas.

**Data-base da validação:** 19/07/2026. Os estados refletem inspeção do `HEAD` do repositório e devem ser revistos quando código ou infraestrutura mudarem.

**Legenda de estado:** **Implementado** = código e evidência automatizada compatíveis com o escopo atual; **Parcial** = existe implementação útil, mas falta parte do requisito ou cobertura; **Não Iniciado** = não foi encontrada implementação verificável. As horas são estimativas iniciais, não compromissos, e devem ser recalibradas após refinamento técnico.

---

## 1. Tabela de Status Executivo

| ID | Requisito | Prioridade | Estado | Esforço (h) | Risco | Responsável |
|---|---|---|---|---|---|---|
| **SEC-01** | Proteção contra IDOR | 10/10 | **Parcial** | 8h | Alto | Backend |
| **SEC-02** | Onboarding (`must_change_password`) | 9/10 | **Não Iniciado** | 12h | Médio | Fullstack |
| **SEC-03** | Convites de Aluno com Expiração | 9/10 | **Não Iniciado** | 16h | Médio | Fullstack |
| **SEC-04** | Reset de Senha do Personal | 8/10 | **Não Iniciado** | 12h | Médio | Backend |
| **SEC-05** | Verificação de E-mail | 7/10 | **Não Iniciado** | 8h | Baixo | Backend |
| **SEC-06** | CSRF Segregado | 9/10 | **Parcial** | 6h | Médio | Backend |
| **SEC-07** | Rate Limit IP + Conta | 8/10 | **Parcial** | 4h | Médio | Backend |
| **SEC-08** | PAR-Q e Assinatura Eletrônica | 8/10 | **Não Iniciado** | 16h | Médio | Fullstack |
| **SEC-09** | Validação/Rotação de Segredos na CI | 10/10 | **Não Iniciado** | 8h | Alto | DevOps |
| **DB-01** | Persistência (Docker Volumes) | 10/10 | **Parcial** | 4h | Alto | DevOps |
| **DB-02** | Concorrência SQLite (WAL) | 9/10 | **Implementado** | 4h | Médio | Backend |
| **DB-03** | Foreign Keys sqlite (`foreign_keys=ON`) | 10/10 | **Parcial** | 4h | Alto | Backend |
| **DB-04** | Backup Seguro (`VACUUM INTO`) | 9/10 | **Implementado** | 8h | Médio | Backend |
| **DB-05** | Backup Off-Site e Restore | 10/10 | **Não Iniciado** | 16h | Alto | DevOps |
| **DB-06** | Deploy expand/contract | 10/10 | **Não Iniciado** | 12h | Alto | DevOps |
| **DB-07** | Constraints e Índices | 9/10 | **Parcial** | 6h | Médio | Backend |
| **DB-08** | transação em Cadastros Compostos | 10/10 | **Não Iniciado** | 8h | Alto | Backend |
| **DB-09** | Precisão e Restrições de Domínio | 8/10 | **Não Iniciado** | 12h | Médio | Backend |
| **UX-01** | Paginação por Cursor no Chat | 8/10 | **Não Iniciado** | 12h | Médio | Fullstack |
| **UX-02** | Virtual Scrolling no Catálogo | 8/10 | **Não Iniciado** | 16h | Alto | Frontend |
| **UX-03** | Fuso Horário Local (UTC) | 9/10 | **Não Iniciado** | 10h | Médio | Fullstack |
| **UX-04** | Bloqueio Base64 e `fs.unlink` | 8/10 | **Parcial** | 8h | Baixo | Backend |
| **UX-05** | Cache Nginx e Cache-Busting | 7/10 | **Parcial** | 8h | Baixo | DevOps |
| **UX-06** | Concorrência (Optimistic Locking) | 7/10 | **Não Iniciado** | 12h | Médio | Backend |
| **UX-07** | Acessibilidade WCAG 2.2 AA | 8/10 | **Parcial** | 20h | Médio | Frontend |
| **UX-08** | Hardening de Uploads / Cotas | 8/10 | **Parcial** | 8h | Alto | Backend |
| **BUS-01** | Execução Real de Treino (Sessions) | 10/10 | **Não Iniciado** | 24h | Alto | Fullstack |
| **BUS-02** | Status da Ficha (Draft/Published) | 9/10 | **Não Iniciado** | 12h | Baixo | Fullstack |
| **BUS-03** | Ciclo de Vida do Aluno/Vínculo | 9/10 | **Não Iniciado** | 16h | Médio | Fullstack |
| **BUS-04** | Anamnese Clínica (`Assessments`) | 9/10 | **Não Iniciado** | 16h | Baixo | Fullstack |
| **BUS-05** | Aderência Semanal Analítica | 8/10 | **Não Iniciado** | 12h | Médio | Backend |
| **BUS-06** | Progressão de Carga e 1-RM | 7/10 | **Não Iniciado** | 16h | Médio | Fullstack |
| **BUS-07** | Temporizador e Sessão Ativa | 7/10 | **Não Iniciado** | 14h | Baixo | Frontend |
| **BUS-08** | Fila IndexedDB e Idempotency | 8/10 | **Não Iniciado** | 20h | Alto | Frontend |
| **BUS-09** | Chaves de Cadastro via CLI | 10/10 | **Parcial** | 8h | Baixo | Backend |
| **BUS-10** | Edição/Exclusão/Leitura de Chat | 8/10 | **Não Iniciado** | 12h | Médio | Fullstack |
| **BUS-11** | Indicador "Digitando..." via SSE | 5/10 | **Não Iniciado** | 8h | Baixo | Fullstack |
| **BUS-12** | Inativação e Abas de Alunos | 8/10 | **Não Iniciado** | 8h | Baixo | Fullstack |
| **BUS-13** | Periodização Biomecânica | 6/10 | **Não Iniciado** | 20h | Alto | Backend |
| **BUS-14** | Governança do Catálogo | 7/10 | **Não Iniciado** | 16h | Médio | Backend |
| **OPS-01** | Subscriptions e Bloqueio 402 | 7/10 | **Não Iniciado** | 16h | Alto | Backend |
| **OPS-02** | Gestão de Equipe (Head/Junior) | 6/10 | **Não Iniciado** | 30h | Alto | Backend |
| **OPS-03** | Acesso Multiprofissional | 5/10 | **Não Iniciado** | 24h | Médio | Fullstack |
| **OPS-04** | Integração com Wearables | 4/10 | **Não Iniciado** | 40h | Alto | Fullstack |
| **OPS-05** | Alertas CRM de Churn e NPS | 5/10 | **Não Iniciado** | 16h | Baixo | Backend |
| **OPS-06** | Check-ins por Geofencing | 4/10 | **Não Iniciado** | 30h | Alto | Fullstack |
| **OPS-07** | Check-in de Prontidão (Readiness) | 5/10 | **Não Iniciado** | 12h | Baixo | Fullstack |
| **OPS-08** | Central de Notificações | 5/10 | **Não Iniciado** | 16h | Baixo | Fullstack |
| **OPS-09** | Exportação e Anonimização LGPD | 9/10 | **Não Iniciado** | 14h | Alto | Backend |
| **OPS-10** | Health Checks Liveness/Readiness | 8/10 | **Parcial** | 8h | Baixo | DevOps |
| **OPS-11** | Sessões por Dispositivo | 6/10 | **Não Iniciado** | 18h | Médio | Backend |
| **OPS-12** | Impersonation Auditável | 6/10 | **Não Iniciado** | 14h | Alto | Backend |
| **OPS-13** | Logs JSON, Redaction e Métricas | 8/10 | **Não Iniciado** | 16h | Médio | DevOps |
| **OPS-14** | CI/CD Obrigatória | 9/10 | **Não Iniciado** | 24h | Alto | DevOps |
| **MOB-01** | Wrapper Híbrido (Capacitor) | 7/10 | **Não Iniciado** | 20h | Alto | Mobile |
| **MOB-02** | Resolução Dinâmica Base URL | 8/10 | **Não Iniciado** | 6h | Baixo | Mobile |
| **MOB-03** | CORS para WebViews | 8/10 | **Não Iniciado** | 6h | Baixo | Backend |
| **MOB-04** | Secure Storage | 7/10 | **Não Iniciado** | 10h | Alto | Mobile |

---

## 2. Dependências entre Tarefas (Ordem Lógica)

As tarefas devem respeitar as seguintes dependências técnicas para evitar retrabalho de arquitetura:

```mermaid
graph TD
    DB-01(Docker Volumes) --> DB-05(Backup Off-site)
    DB-02(Locks SQLite) --> BUS-01(Sessões Reais)
    DB-03(Foreign Keys) --> BUS-01
    SEC-01(IDOR Ownership) --> BUS-01
    BUS-01(Execução Real/Sessões) --> BUS-05(Aderência Semanal)
    BUS-01 --> BUS-06(Progressão e 1-RM)
    BUS-01 --> OPS-05(CRM Churn)
    BUS-01 --> OPS-07(Check-in de Prontidão)
    SEC-02(must_change_password) --> SEC-03(Convites)
    MOB-01(Capacitor APK) --> MOB-02(URL Resolver)
    MOB-01 --> MOB-04(Secure Storage)
```

---

## 3. Matriz de Mapeamento Técnico de Código

Esta matriz correlaciona cada ID de requisito aos arquivos de implementação e testes do repositório:

| ID | Arquivo Atual | Teste Atual | Teste Faltante |
|---|---|---|---|
| **SEC-01** | `../backend/src/controllers/studentController.js`, `workoutController.js`, `chatController.js` | `../backend/src/tests/api.test.js`, `chatController.test.js` | `Matriz IDOR negativa cobrindo toda rota com recurso de aluno` |
| **SEC-06** | `../backend/src/middleware/auth.js`, `httpSecurity.js` | `../backend/src/tests/httpSecurity.test.js`, `api.test.js` | `Fluxo mobile/Bearer e teste E2E em origem pública` |
| **SEC-07** | `../backend/src/middleware/httpSecurity.js` | `../backend/src/tests/httpSecurity.test.js` | `Chave combinada por IP + e-mail, inclusive múltiplos IPs` |
| **DB-01** | `../docker-compose.yml` | - | `Checagem física de persistência pós container restart` |
| **DB-02** | `../backend/knexfile.js` | `../backend/src/tests/auth-config.test.js` | `Teste de contenção com escritas paralelas` |
| **DB-03** | `../backend/knexfile.js` | `../backend/src/tests/migrations.test.js` | `Confirmar pragma em cada conexão e rejeitar registro órfão` |
| **DB-04** | `../backend/src/scripts/backupDatabase.js`, `workers/backupWorker.js` | `../backend/src/tests/backupDatabase.test.js`, `backupWorker.test.js` | `Restore periódico em ambiente isolado` |
| **DB-07** | `../backend/src/db/migrations/202607140002_add_query_indexes.js` | `../backend/src/tests/indexes.test.js` | `Constraints de domínio e planos das consultas futuras` |
| **UX-07** | `../frontend/desktop.html`, `mobile.html`, `css/` | `../frontend/tests/strict-csp.test.js`, `safe-dom.test.js` | `Auditoria WCAG 2.2 AA automatizada e manual` |
| **UX-08** | `../backend/src/services/avatarService.js`, `../nginx.conf` | `../backend/src/tests/api.test.js` | `Quota por usuário/tenant e persistência/reconciliação de arquivos` |
| **OPS-10** | `../backend/src/index.js` | `../backend/src/tests/api.test.js` | `Separar liveness de readiness verificando migrations` |

---

## 4. Critérios de Aceite para Requisitos P0 (Prioridades 9 e 10)

### [SEC-01] Proteção contra IDOR
*   *Critério 1*: Toda rota que receba ou derive `studentId`, `workoutId`, `exerciseId`, `messageId` ou `userId` deve resolver o proprietário no servidor e retornar `403 Forbidden` para acesso cruzado autenticado, sem revelar se o recurso existe.
*   *Critério 2*: Uma matriz automatizada deve executar Personal A contra recursos do Personal B em detalhes, medidas, treinos, exercícios, chat, avatar e futuras avaliações. Eventos de segurança devem ser auditados com minimização e rate limit, sem registrar conteúdo sensível.

### [SEC-02] Onboarding compulsório
*   *Critério 1*: Login de conta com `must_change_password = true` deve redirecionar a interface SPA para a tela de alteração e travar rotas alternativas.
*   *Critério 2*: A nova senha deve ter tamanho igual ou superior a 10 caracteres.

### [DB-03] Enforce de Foreign Keys
*   *Critério 1*: A inicialização do banco SQLite deve invocar `PRAGMA foreign_keys = ON;` para cada conexão do pool.
*   *Critério 2*: Inserções/atualizações órfãs devem falhar; deleções devem seguir explicitamente a política `CASCADE`, `RESTRICT` ou `SET NULL` definida para cada relação e ser cobertas por teste.

### [DB-08] Transação de Cadastros Compostos
*   *Critério 1*: Falhas em inserções na tabela pivot `workout_exercises` devem restaurar o estado revertendo a criação da ficha principal na tabela `workouts` de forma atômica.

### [BUS-01] Execução Real de Treino
*   *Critério 1*: Logs de exercícios devem armazenar valores de peso, repetições e séries reais executadas pelo aluno no ginásio.
*   *Critério 2*: Sessões de treino devem expor status `started`, `completed` e `abandoned` indexados na tabela `workout_sessions`.
