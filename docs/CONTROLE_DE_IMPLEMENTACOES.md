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
+
## Reconciliação da baseline — PRs #88 a #186

- Estado: concluído e mergeado; proteção da `main` aguarda ação administrativa
- Branch: `docs/reconcile-roadmap-pr186`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/188
- Baseline auditada: `5274051` (merge do PR #186)
- Data da reconciliação: 05/08/2026
- Alterações locais anteriores preservadas em: `stash@{1}` — `backup-pre-reconciliation-2026-08-05`

### Diagnóstico

- A cópia local estava 257 commits atrás da `main` e foi atualizada por fast-forward.
- O controle terminava no PR #87, enquanto o repositório já continha trabalho até o PR #186.
- Dos 99 PRs do intervalo, 75 foram mergeados e 24 foram fechados sem merge; os fechados foram substituídos, rebased ou consolidados posteriormente.
- A baseline contém 36 migrations, 40 arquivos de teste backend e 17 arquivos de teste frontend.
- A CI do commit `5274051` aprovou Backend, Frontend and infrastructure, Secret scan, Migration policy e CI policy.
- Na data da reconciliação não havia PR aberto.

### Plano de reconciliação

- [x] Preservar as três alterações locais pendentes.
- [x] Sincronizar a `main` com `origin/main`.
- [x] Criar branch documental exclusiva.
- [x] Inventariar os PRs #88–#186 usando a API do GitHub.
- [x] Consolidar o checklist sem IDs duplicados e com estados baseados em evidências.
- [x] Executar testes e auditorias na baseline sincronizada.
- [ ] Ativar proteção da branch `main` — bloqueado por permissão administrativa do repositório.
- [x] Abrir PR documental.
- [x] Acompanhar a CI.
- [x] PR #187 e PR #188 mergeados pelo mantenedor.

### Evidências da reconciliação

- Frontend: 69/69 testes aprovados.
- Backend: 237/237 testes aprovados em 40 suítes após reinstalação conforme os lockfiles.
- Novos advisories corrigidos no PR #187; os cinco checks foram aprovados e o PR aguarda merge do mantenedor.
- `npm audit`: 0 vulnerabilidades após a correção dos lockfiles.
- `npm audit --omit=dev`: 0 vulnerabilidades após a correção dos lockfiles.
- A tentativa de configurar branch protection retornou HTTP 404 porque `DiogoCrespi` possui somente permissão `pull`; `admin`, `maintain` e `push` são falsos.
- Política administrativa reproduzível registrada em `docs/runbooks/main-branch-protection.md`.
- CI do PR #188: Backend, Frontend and infrastructure, Secret scan, Migration policy e CI policy aprovados.
- Baseline reconciliada final: `43fdb3b` (merge do PR #188).
- Fechamento do controle: https://github.com/carlossuzin6111-code/sistema-tonho/pull/189

### Inventário dos PRs

| PR | Resultado | Grupo | Título | Branch de origem |
|---|---|---|---|---|
| [#88](https://github.com/carlossuzin6111-code/sistema-tonho/pull/88) | Mergeado | Segurança/DB | feat: enforce mandatory student password onboarding | `security/sec-02-onboarding` |
| [#89](https://github.com/carlossuzin6111-code/sistema-tonho/pull/89) | Mergeado | Segurança/DB | chore: refresh backend audited dependencies | `chore/fix-backend-audit` |
| [#90](https://github.com/carlossuzin6111-code/sistema-tonho/pull/90) | Mergeado | Segurança/DB | feat: add expiring student invitations | `security/sec-03-student-invitations` |
| [#91](https://github.com/carlossuzin6111-code/sistema-tonho/pull/91) | Mergeado | Segurança/DB | feat: allow students to claim invitations | `security/sec-03-invitation-claim` |
| [#92](https://github.com/carlossuzin6111-code/sistema-tonho/pull/92) | Mergeado | Segurança/DB | feat: add email verification tokens | `security/sec-05-email-verification` |
| [#93](https://github.com/carlossuzin6111-code/sistema-tonho/pull/93) | Mergeado | Segurança/DB | feat: enforce unverified email recovery policy | `security/sec-05-email-verification` |
| [#94](https://github.com/carlossuzin6111-code/sistema-tonho/pull/94) | Mergeado | Segurança/DB | feat: validate cookie request origins for CSRF | `security/sec-06-csrf-segregation` |
| [#95](https://github.com/carlossuzin6111-code/sistema-tonho/pull/95) | Mergeado | Segurança/DB | feat: rate limit authentication by account and IP | `security/sec-07-account-rate-limit` |
| [#96](https://github.com/carlossuzin6111-code/sistema-tonho/pull/96) | Mergeado | Segurança/DB | feat: add PAR-Q waiver signatures | `security/sec-08-waivers` |
| [#97](https://github.com/carlossuzin6111-code/sistema-tonho/pull/97) | Mergeado | Segurança/DB | feat: enforce database domain constraints | `db/db-09-domain-constraints` |
| [#98](https://github.com/carlossuzin6111-code/sistema-tonho/pull/98) | Mergeado | UX | feat: add cursor pagination to chat history | `ux/ux-01-chat-cursor` |
| [#99](https://github.com/carlossuzin6111-code/sistema-tonho/pull/99) | Mergeado | UX | feat: virtualize exercise catalog rendering | `ux/ux-02-catalog-virtual-scroll` |
| [#100](https://github.com/carlossuzin6111-code/sistema-tonho/pull/100) | Mergeado | UX | feat: format API timestamps in local timezone | `ux/ux-03-local-timezone` |
| [#101](https://github.com/carlossuzin6111-code/sistema-tonho/pull/101) | Mergeado | UX | feat: harden avatar storage and orphan cleanup | `ux/ux-04-upload-hardening` |
| [#102](https://github.com/carlossuzin6111-code/sistema-tonho/pull/102) | Mergeado | UX | feat: add immutable asset cache policy | `ux/ux-05-cache-policy` |
| [#103](https://github.com/carlossuzin6111-code/sistema-tonho/pull/103) | Mergeado | UX | feat: add optimistic version checks | `ux/ux-06-optimistic-locking` |
| [#104](https://github.com/carlossuzin6111-code/sistema-tonho/pull/104) | Mergeado | UX | feat: strengthen keyboard focus accessibility | `ux/ux-07-focus-accessibility` |
| [#105](https://github.com/carlossuzin6111-code/sistema-tonho/pull/105) | Mergeado | UX | feat: enforce exercise media quotas | `ux/ux-08-upload-quotas` |
| [#106](https://github.com/carlossuzin6111-code/sistema-tonho/pull/106) | Mergeado | Negócio | feat: add workout draft and publication lifecycle | `bus/bus-02-workout-status` |
| [#107](https://github.com/carlossuzin6111-code/sistema-tonho/pull/107) | Mergeado | Negócio | feat: add student lifecycle statuses | `bus/bus-03-student-lifecycle` |
| [#108](https://github.com/carlossuzin6111-code/sistema-tonho/pull/108) | Mergeado | Negócio | feat: add private student assessments | `bus/bus-04-assessments` |
| [#109](https://github.com/carlossuzin6111-code/sistema-tonho/pull/109) | Fechado sem merge | Negócio | feat: add weekly workout adherence analytics | `bus/bus-05-adherence` |
| [#110](https://github.com/carlossuzin6111-code/sistema-tonho/pull/110) | Mergeado | Negócio | feat: add workout progression analytics | `bus/bus-06-progression` |
| [#111](https://github.com/carlossuzin6111-code/sistema-tonho/pull/111) | Mergeado | Negócio | feat: keep active workout sessions alive | `bus/bus-07-active-session` |
| [#112](https://github.com/carlossuzin6111-code/sistema-tonho/pull/112) | Mergeado | Negócio | feat: add offline session queue and idempotency | `bus/bus-08-offline-idempotency` |
| [#113](https://github.com/carlossuzin6111-code/sistema-tonho/pull/113) | Mergeado | Negócio | feat: add weekly workout adherence analytics (rebased) | `bus/bus-05-adherence-rebased` |
| [#114](https://github.com/carlossuzin6111-code/sistema-tonho/pull/114) | Mergeado | Negócio | feat: complete access key administration CLI | `bus/bus-09-access-key-cli` |
| [#115](https://github.com/carlossuzin6111-code/sistema-tonho/pull/115) | Fechado sem merge | Negócio | feat: support chat message editing and deletion | `bus/bus-10-chat-edits` |
| [#116](https://github.com/carlossuzin6111-code/sistema-tonho/pull/116) | Mergeado | Negócio | feat: add chat typing indicators over SSE | `bus/bus-11-chat-typing` |
| [#117](https://github.com/carlossuzin6111-code/sistema-tonho/pull/117) | Mergeado | Negócio | feat: add active and inactive student tabs | `bus/bus-12-student-tabs` |
| [#118](https://github.com/carlossuzin6111-code/sistema-tonho/pull/118) | Mergeado | Negócio | feat: add workout microcycle periodization | `bus/bus-13-periodization` |
| [#119](https://github.com/carlossuzin6111-code/sistema-tonho/pull/119) | Fechado sem merge | Negócio | feat: add exercise catalog governance | `bus/bus-14-catalog-governance` |
| [#120](https://github.com/carlossuzin6111-code/sistema-tonho/pull/120) | Fechado sem merge | Operações | feat: add subscription tenant gate | `ops/ops-01-subscriptions` |
| [#121](https://github.com/carlossuzin6111-code/sistema-tonho/pull/121) | Fechado sem merge | Operações | feat: add Head/Junior team management | `ops/ops-02-team-management` |
| [#122](https://github.com/carlossuzin6111-code/sistema-tonho/pull/122) | Fechado sem merge | Operações | feat: consented multiprofessional partner access | `ops/ops-03-partner-access` |
| [#123](https://github.com/carlossuzin6111-code/sistema-tonho/pull/123) | Mergeado | Operações | feat: split liveness and readiness health checks | `ops/ops-10-health-checks` |
| [#124](https://github.com/carlossuzin6111-code/sistema-tonho/pull/124) | Fechado sem merge | Operações | feat: add wearable metric ingestion foundation | `ops/ops-04-wearables` |
| [#125](https://github.com/carlossuzin6111-code/sistema-tonho/pull/125) | Fechado sem merge | Operações | feat: add CRM churn alerts and NPS workflow | `ops/ops-05-crm-alerts` |
| [#126](https://github.com/carlossuzin6111-code/sistema-tonho/pull/126) | Fechado sem merge | Operações | feat: add geofenced student check-ins | `ops/ops-06-geofence-checkins` |
| [#127](https://github.com/carlossuzin6111-code/sistema-tonho/pull/127) | Fechado sem merge | Operações | feat: add daily readiness check-ins | `ops/ops-07-readiness-checkin` |
| [#128](https://github.com/carlossuzin6111-code/sistema-tonho/pull/128) | Fechado sem merge | Operações | feat: add notification preferences center | `ops/ops-08-notification-center` |
| [#129](https://github.com/carlossuzin6111-code/sistema-tonho/pull/129) | Fechado sem merge | Operações | feat: add LGPD export and anonymization | `ops/ops-09-lgpd-compliance` |
| [#130](https://github.com/carlossuzin6111-code/sistema-tonho/pull/130) | Fechado sem merge | Operações | feat: add per-device session management | `ops/ops-11-device-sessions` |
| [#131](https://github.com/carlossuzin6111-code/sistema-tonho/pull/131) | Fechado sem merge | Operações | feat: add auditable support impersonation | `ops/ops-12-impersonation-audit` |
| [#132](https://github.com/carlossuzin6111-code/sistema-tonho/pull/132) | Fechado sem merge | Operações | feat: add structured logs and protected metrics | `ops/ops-13-observability` |
| [#133](https://github.com/carlossuzin6111-code/sistema-tonho/pull/133) | Mergeado | Operações | ci: enforce mandatory pipeline policy | `ops/ops-14-ci-cd-policy` |
| [#134](https://github.com/carlossuzin6111-code/sistema-tonho/pull/134) | Mergeado | Mobile | feat: add Capacitor hybrid mobile wrapper | `mob/mob-01-capacitor-wrapper` |
| [#135](https://github.com/carlossuzin6111-code/sistema-tonho/pull/135) | Mergeado | Mobile | feat: resolve API base URL for Capacitor | `mob/mob-02-api-base-url` |
| [#136](https://github.com/carlossuzin6111-code/sistema-tonho/pull/136) | Mergeado | Mobile | feat: allow secure Capacitor WebView origins | `mob/mob-03-webview-cors` |
| [#137](https://github.com/carlossuzin6111-code/sistema-tonho/pull/137) | Mergeado | Mobile | feat: add secure storage bridge for native apps | `mob/mob-04-secure-storage` |
| [#138](https://github.com/carlossuzin6111-code/sistema-tonho/pull/138) | Mergeado | Reconciliação | docs: reconcile autonomous password reset status | `security/sec-04-password-reset-audit` |
| [#139](https://github.com/carlossuzin6111-code/sistema-tonho/pull/139) | Mergeado | Reconciliação | docs: reconcile waiver consent status | `security/sec-08-waiver-status` |
| [#140](https://github.com/carlossuzin6111-code/sistema-tonho/pull/140) | Mergeado | Reconciliação | feat: add encrypted offsite backup retention | `db/db-05-offsite-backup` |
| [#141](https://github.com/carlossuzin6111-code/sistema-tonho/pull/141) | Mergeado | Reconciliação | ci: enforce expand contract migration policy | `db/db-06-expand-contract` |
| [#142](https://github.com/carlossuzin6111-code/sistema-tonho/pull/142) | Mergeado | Reconciliação | test: verify compound workout transaction rollback | `db/db-08-compound-transaction` |
| [#143](https://github.com/carlossuzin6111-code/sistema-tonho/pull/143) | Mergeado | Reconciliação | test: cover all domain measurement constraints | `db/db-09-domain-constraints` |
| [#144](https://github.com/carlossuzin6111-code/sistema-tonho/pull/144) | Mergeado | Reconciliação | docs: reconcile workout session roadmap status | `bus/bus-01-session-status` |
| [#145](https://github.com/carlossuzin6111-code/sistema-tonho/pull/145) | Mergeado | Complementação | feat: add weekly adherence analytics | `bus/bus-05-adherence-analytics` |
| [#146](https://github.com/carlossuzin6111-code/sistema-tonho/pull/146) | Mergeado | Complementação | BUS-07: sessão ativa e temporizador no frontend | `bus/bus-07-session-timer` |
| [#147](https://github.com/carlossuzin6111-code/sistema-tonho/pull/147) | Mergeado | Complementação | BUS-08: limitar retenção e expor telemetria da fila offline | `bus/bus-08-offline-retention` |
| [#148](https://github.com/carlossuzin6111-code/sistema-tonho/pull/148) | Mergeado | Complementação | BUS-10: editar e excluir mensagens com eventos SSE | `bus/bus-10-chat-lifecycle` |
| [#149](https://github.com/carlossuzin6111-code/sistema-tonho/pull/149) | Mergeado | Complementação | BUS-11: indicador de digitação via SSE | `bus/bus-11-typing-indicator` |
| [#150](https://github.com/carlossuzin6111-code/sistema-tonho/pull/150) | Mergeado | Complementação | BUS-12: filtro server-side e auditoria de status de alunos | `bus/bus-12-server-filter-audit` |
| [#151](https://github.com/carlossuzin6111-code/sistema-tonho/pull/151) | Mergeado | Complementação | BUS-13: editor de periodização biomecânica | `bus/bus-13-periodization-editor` |
| [#152](https://github.com/carlossuzin6111-code/sistema-tonho/pull/152) | Fechado sem merge | Complementação | BUS-14: governança, escopo e deduplicação do catálogo | `bus/bus-14-catalog-governance-next` |
| [#153](https://github.com/carlossuzin6111-code/sistema-tonho/pull/153) | Fechado sem merge | Complementação | feat: enforce subscription tenant access | `ops/ops-01-subscriptions-next` |
| [#154](https://github.com/carlossuzin6111-code/sistema-tonho/pull/154) | Fechado sem merge | Complementação | feat: add Head/Junior team management | `ops/ops-02-team-management-next` |
| [#155](https://github.com/carlossuzin6111-code/sistema-tonho/pull/155) | Fechado sem merge | Complementação | feat: add consented multiprofessional partner access | `ops/ops-03-partner-access-next` |
| [#156](https://github.com/carlossuzin6111-code/sistema-tonho/pull/156) | Mergeado | Complementação | feat: add wearable metric ingestion foundation | `ops/ops-04-wearables-next` |
| [#157](https://github.com/carlossuzin6111-code/sistema-tonho/pull/157) | Fechado sem merge | Complementação | feat: add CRM churn alerts and NPS workflow | `ops/ops-05-crm-alerts-next` |
| [#158](https://github.com/carlossuzin6111-code/sistema-tonho/pull/158) | Fechado sem merge | Complementação | feat: add geofenced student check-ins | `ops/ops-06-geofence-checkins-next` |
| [#159](https://github.com/carlossuzin6111-code/sistema-tonho/pull/159) | Mergeado | Complementação | feat: add daily readiness check-ins | `ops/ops-07-readiness-checkin-next` |
| [#160](https://github.com/carlossuzin6111-code/sistema-tonho/pull/160) | Fechado sem merge | Complementação | feat: add notification preferences center | `ops/ops-08-notification-center-next` |
| [#161](https://github.com/carlossuzin6111-code/sistema-tonho/pull/161) | Mergeado | Complementação | feat: add LGPD export and anonymization | `ops/ops-09-lgpd-compliance-next` |
| [#162](https://github.com/carlossuzin6111-code/sistema-tonho/pull/162) | Fechado sem merge | Complementação | feat: split liveness and readiness health checks | `ops/ops-10-health-checks-next` |
| [#163](https://github.com/carlossuzin6111-code/sistema-tonho/pull/163) | Fechado sem merge | Complementação | feat: add per-device session management | `ops/ops-11-device-sessions-next` |
| [#164](https://github.com/carlossuzin6111-code/sistema-tonho/pull/164) | Mergeado | Complementação | feat: add auditable support impersonation | `ops/ops-12-impersonation-audit-next` |
| [#165](https://github.com/carlossuzin6111-code/sistema-tonho/pull/165) | Mergeado | Complementação | feat: add structured logs and protected metrics | `ops/ops-13-observability-next` |
| [#166](https://github.com/carlossuzin6111-code/sistema-tonho/pull/166) | Mergeado | Complementação | ci: enforce mandatory pipeline policy | `ops/ops-14-ci-cd-policy-next` |
| [#167](https://github.com/carlossuzin6111-code/sistema-tonho/pull/167) | Mergeado | Complementação | feat: add Capacitor hybrid mobile wrapper | `mob/mob-01-capacitor-wrapper-next` |
| [#168](https://github.com/carlossuzin6111-code/sistema-tonho/pull/168) | Mergeado | Complementação | fix: restore CI after controller merge conflicts | `fix/ci-chat-duplicate` |
| [#169](https://github.com/carlossuzin6111-code/sistema-tonho/pull/169) | Mergeado | Complementação | feat: resolve API base URL for Capacitor | `mob/mob-02-api-base-url-next` |
| [#170](https://github.com/carlossuzin6111-code/sistema-tonho/pull/170) | Mergeado | Complementação | feat: allow secure Capacitor WebView origins | `mob/mob-03-webview-cors-next` |
| [#171](https://github.com/carlossuzin6111-code/sistema-tonho/pull/171) | Mergeado | Hardening/consolidação | fix: make Docker proxy resilient after app restarts | `fix/docker-runtime-proxy` |
| [#172](https://github.com/carlossuzin6111-code/sistema-tonho/pull/172) | Mergeado | Hardening/consolidação | feat: add grouped Compose production hardening checks | `infra/production-hardening` |
| [#173](https://github.com/carlossuzin6111-code/sistema-tonho/pull/173) | Mergeado | Hardening/consolidação | feat: group session lifecycle hardening | `security/session-hardening` |
| [#174](https://github.com/carlossuzin6111-code/sistema-tonho/pull/174) | Mergeado | Hardening/consolidação | feat: group email verification policy hardening | `security/email-verification-policy` |
| [#175](https://github.com/carlossuzin6111-code/sistema-tonho/pull/175) | Mergeado | Hardening/consolidação | feat: group distributed rate limit hardening | `security/rate-limit-distributed` |
| [#176](https://github.com/carlossuzin6111-code/sistema-tonho/pull/176) | Mergeado | Hardening/consolidação | feat: group mobile refresh token rotation | `security/refresh-token-rotation` |
| [#177](https://github.com/carlossuzin6111-code/sistema-tonho/pull/177) | Mergeado | Hardening/consolidação | feat: group mobile refresh token secure storage | `mobile/auth-refresh-storage` |
| [#178](https://github.com/carlossuzin6111-code/sistema-tonho/pull/178) | Mergeado | Hardening/consolidação | feat: group backup restore verification workflow | `infra/backup-restore-hardening` |
| [#179](https://github.com/carlossuzin6111-code/sistema-tonho/pull/179) | Mergeado | Hardening/consolidação | feat: renovar automaticamente sessões mobile | `mobile/refresh-auto-renew` |
| [#180](https://github.com/carlossuzin6111-code/sistema-tonho/pull/180) | Mergeado | Hardening/consolidação | fix: tornar sessão ativa resiliente ao retorno mobile | `bus/session-resilience` |
| [#181](https://github.com/carlossuzin6111-code/sistema-tonho/pull/181) | Mergeado | Hardening/consolidação | feat: exigir check-in diário de prontidão | `ops/readiness-gate` |
| [#182](https://github.com/carlossuzin6111-code/sistema-tonho/pull/182) | Mergeado | Hardening/consolidação | feat: consolidar bem-estar e centro de notificações | `feature/wellbeing-and-notifications` |
| [#183](https://github.com/carlossuzin6111-code/sistema-tonho/pull/183) | Mergeado | Hardening/consolidação | feat: pacote consolidado de bem-estar, notificações e privacidade | `feature/wellbeing-and-notifications` |
| [#184](https://github.com/carlossuzin6111-code/sistema-tonho/pull/184) | Mergeado | Hardening/consolidação | feat: pacote grande de segurança de conta | `feature/account-security-suite` |
| [#185](https://github.com/carlossuzin6111-code/sistema-tonho/pull/185) | Mergeado | Hardening/consolidação | feat: pacote consolidado de UX do chat e treinos | `feature/chat-and-workout-ux` |
| [#186](https://github.com/carlossuzin6111-code/sistema-tonho/pull/186) | Mergeado | Hardening/consolidação | feat: consolidar ciclo de vida e tempo real do chat | `feature/chat-and-workout-ux` |

### Regra de interpretação

“Mergeado” comprova integração do PR, não conclusão integral do requisito de negócio. Requisitos que ainda dependem de provedor externo, operação real, QA manual ou cobertura de todos os fluxos permanecem “Parcial” no checklist. “Fechado sem merge” não é contabilizado como entrega; seu conteúdo só é considerado quando reaparece em PR posterior efetivamente mergeado.

## Correção emergencial de advisories — 05/08/2026

- Estado: concluído e mergeado
- Branch: `security/dependency-advisories-20260805`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/187
- Motivo: advisories publicados após o PR #186 passaram a reprovar os audits obrigatórios.

### Alterações

- [x] Atualizar somente `package-lock.json` e `backend/package-lock.json`.
- [x] Preservar as versões declaradas nos dois `package.json`.
- [x] Reinstalar dependências, incluindo o AWS SDK já declarado no backend.
- [x] Executar testes e audits completos.
- [x] Abrir PR e acompanhar os cinco checks.
- [x] Merge pelo mantenedor do repositório upstream.

### Evidências

- Frontend: 69/69 testes aprovados.
- Backend: 237/237 testes aprovados em 40 suítes.
- `npm audit`: 0 vulnerabilidades.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- CI do PR #187: os cinco checks obrigatórios foram aprovados.
- Dívida observada: Jest ainda emite aviso tardio de teardown em `auth-config.test.js`, embora finalize com código 0.
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

- Estado: concluído e mergeado
- Branch: `security/sec-01-idor-test-matrix`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/83
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
- [x] Abrir PR e registrar link no arquivo de controle.
- [x] Acompanhar CI.

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
- Backend: 144/144 testes aprovados em 16 suítes.
- `npm audit` na raiz: 0 vulnerabilidades.
- `npm audit --omit=dev` no backend: 0 vulnerabilidades.
- CI do PR #83: Backend Tests, Frontend & Infrastructure e Secret Scan totalmente aprovados.

## DB-01 / DB-05 — Persistência de Banco, Avatares e Procedimento de Restore

- Estado: concluído e mergeado
- Branch: `db/db-01-db-05-persistence-restore`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/84
- Início: 20/07/2026
- Prioridade: 5/10

### Diagnóstico

- O Compose monta o volume persistente nomeado `db-data:/app/data` para os serviços `app`, `translation-worker` e `backup-worker`.
- O banco SQLite (`/app/data/database.sqlite`), o diretório de avatares privados (`/app/data/avatars/`) e o diretório de backups automáticos (`/app/data/backups/`) residem no mesmo volume montado em `/app/data`.
- O `backup-worker` gera snapshots não-bloqueantes (`VACUUM INTO`), cria o manifesto `manifest.json` com hashes SHA256 do banco e dos avatares, e mantém retenção rotativa de 7 dias.
- O script `restoreBackup.js` valida o manifesto, soma de verificação SHA256 do banco e avatares, integridade do SQLite e restaura os dados atomicamente em diretório destino limpo.

### Plano aprovado

- [x] Confirmar o merge do SEC-01 e sincronizar a `main`.
- [x] Criar a branch exclusiva `db/db-01-db-05-persistence-restore`.
- [x] Registrar o plano e diagnóstico em `docs/CONTROLE_DE_IMPLEMENTACOES.md`.
- [x] Criar suíte de testes de integração `backend/src/tests/persistenceRestore.test.js` cobrindo co-localização de dados, simulação de perda de dados e recuperação atômica completa.
- [x] Validar que a restauração recria tabelas SQLite, registros de usuários/alunos e imagens de avatares mantendo integridade e somas SHA256.
- [x] Executar suítes de testes do backend, frontend e auditorias de segurança.
- [x] Abrir PR e registrar link no arquivo de controle.
- [x] Acompanhar CI.

### Critérios de aceite

- Banco de dados, avatares e backups estão co-localizados no volume montado em `/app/data`.
- O teste de restore reconstrói com sucesso o banco e avatares em caso de desastre sem perda de integridade.
- Restauração recusa pacotes com checksums inconsistentes ou avatares alterados/ausentes.
- Suítes de testes automatizados do sistema permanecem 100% aprovadas.

### Evidências

- Teste específico `persistenceRestore.test.js`: 2/2 aprovados.
- Co-localização sob volume persistente `/app/data` confirmada (`database.sqlite`, `avatars/`, `backups/`).
- Simulação de disaster recovery validada: limpeza total de banco e avatares seguida de restore automatizado via `restoreBackup.js`, recompondo estado completo e integridade de registros e arquivos WebP.
- Frontend: 50/50 testes aprovados em 5 suítes.
- Backend: 146/146 testes aprovados em 17 suítes.
- `npm audit` na raiz: 0 vulnerabilidades.
- `npm audit --omit=dev` no backend: 0 vulnerabilidades.
- CI do PR #84: Backend Tests, Frontend & Infrastructure e Secret Scan totalmente aprovados.

## OPS-14 — Ampliação e Obrigatoriedade da Integração Contínua (CI/CD)

- Estado: concluído e mergeado
- Branch: `ops/ops-14-ci-cd-hardening`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/85
- Início: 20/07/2026
- Prioridade: 4/10

### Diagnóstico

- O workflow do GitHub Actions (`.github/workflows/backend-tests.yml`) já executa a suíte backend, frontend/infraestrutura e o scanner de segredos Gitleaks.
- Faltava incluir auditorias automatizadas de segurança de dependências (`npm audit` na raiz e `npm audit --omit=dev` no backend) e validação da integridade de migrations (`npm run migrate:status`).
- A restrição de caminhos (`paths`) no gatilho de `pull_request` permitia que PRs focados apenas em certas pastas ignorassem as checagens obrigatórias; o gatilho de PR deve disparar para qualquer modificação.

### Plano aprovado

- [x] Confirmar o merge de DB-01 / DB-05 e sincronizar a `main`.
- [x] Criar a branch exclusiva `ops/ops-14-ci-cd-hardening`.
- [x] Registrar o plano e diagnóstico em `docs/CONTROLE_DE_IMPLEMENTACOES.md`.
- [x] Remover filtros restritivos de `paths` no evento `pull_request` do workflow do GitHub Actions.
- [x] Adicionar a etapa de validação de status de migrations (`npm run migrate:status`) no job do backend.
- [x] Adicionar etapas de auditoria de dependências (`npm audit --omit=dev` no backend e `npm audit` no frontend/infra).
- [x] Adicionar teste unitário no frontend (`strict-csp.test.js`) validando a presença e obrigatoriedade destas etapas de segurança no arquivo de workflow.
- [x] Executar suítes de testes do backend, frontend e auditorias locais.
- [x] Abrir PR e registrar link no arquivo de controle.
- [x] Acompanhar CI.

### Critérios de aceite

- O workflow dispara obrigatoriamente para qualquer Pull Request sem ignorar alterações.
- O job do backend executa validação de migrations e auditoria de dependências antes dos testes de unidade.
- O job de frontend/infra executa auditoria de dependências do projeto raiz antes dos testes de integração.
- A suíte de testes automatizada do sistema valida a presença das regras no workflow.

### Evidências

- Teste de integridade de workflow em `strict-csp.test.js` aprovado.
- Gatilho `pull_request` no `.github/workflows/backend-tests.yml` configurado sem filtros de caminhos para execuções obrigatórias de CI.
- Etapas `npm run migrate:status` e `npm audit --omit=dev` inseridas no job do backend.
- Etapa `npm audit` inserida no job de frontend/infraestrutura.
- Frontend: 51/51 testes aprovados em 5 suítes.
- Backend: 146/146 testes aprovados em 17 suítes.
- `npm audit` na raiz: 0 vulnerabilidades.
- `npm audit --omit=dev` no backend: 0 vulnerabilidades.
- CI do PR #85: Backend Tests (com migrações, audit e 17 suítes), Frontend & Infrastructure (com audit e 5 suítes) e Secret Scan totalmente aprovados.

## BUS-01 — Sessões Reais de Treino

- Estado: concluído e mergeado
- Branch: `feat/bus-01-workout-sessions`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/86
- Início: 20/07/2026
- Prioridade: 3/10

### Diagnóstico

- O sistema gerenciava fichas de treino (`workouts`) e exercícios (`workout_exercises`), mas não possuía rastreamento transacional de execuções reais de treinos efetuadas pelos alunos.
- É necessário permitir que alunos iniciem sessões reais de treino (`start`), acompanhem e registrem séries concluídas e cargas por exercício (`update exercise progress`), concluam a sessão com cálculo automatizado de tempo de execução (`complete`) ou cancelem a sessão (`cancel`), mantendo histórico acessível ao Personal Trainer e ao Aluno.

### Plano aprovado

- [x] Confirmar o merge do OPS-14 e sincronizar a `main`.
- [x] Criar a branch exclusiva `feat/bus-01-workout-sessions`.
- [x] Registrar o plano e diagnóstico em `docs/CONTROLE_DE_IMPLEMENTACOES.md`.
- [x] Criar migration Knex `202607200001_create_workout_sessions.js` criando as tabelas `workout_sessions` e `workout_session_exercises` com chaves estrangeiras e índices.
- [x] Implementar o controller `backend/src/controllers/workoutSessionController.js` para início, atualização progressiva, conclusão, cancelamento e consulta de histórico com controle de acesso IDOR.
- [x] Adicionar schemas de validação no `backend/src/middleware/validateRequest.js`.
- [x] Adicionar script `backend/src/scripts/validateMigrations.js` garantindo destruição limpa do pool de conexões ao verificar migrations.
- [x] Registrar rotas `/api/workout-sessions` e documentação OpenAPI/Swagger no `backend/src/index.js`.
- [x] Criar suíte de testes de integração `backend/src/tests/workoutSessions.test.js` cobrindo o fluxo completo e isolamento entre locatários.
- [x] Executar suítes de testes do backend, frontend e auditorias de segurança.
- [x] Abrir PR e registrar link no arquivo de controle.
- [x] Acompanhar CI.

### Critérios de aceite

- Aluno consegue iniciar uma sessão real de treino para sua ficha ativa.
- Tentativa de iniciar sessão com treino alheio ou com outra sessão ativa retorna erro apropriado (403/409).
- Atualização de progresso por exercício salva séries concluídas, peso utilizado, marcação de concluído e notas.
- Conclusão da sessão calcula tempo total em segundos e grava log de auditoria.
- Suítes de testes automatizados do backend e frontend permanecem 100% aprovadas.

### Evidências

- Migration `202607200001_create_workout_sessions.js` criada e aplicada.
- Controller `workoutSessionController.js` e rotas `/api/workout-sessions` com OpenAPI/Swagger implementados.
- Teste específico `workoutSessions.test.js`: 8/8 aprovados.
- Frontend: 51/51 testes aprovados em 5 suítes.
- Backend: 154/154 testes aprovados em 18 suítes.
- `npm audit` na raiz: 0 vulnerabilidades.
- `npm audit --omit=dev` no backend: 0 vulnerabilidades.
- CI do PR #86: Backend Tests (com 18 suítes), Frontend & Infrastructure (5 suítes) e Secret Scan totalmente aprovados.

## SEC-04 — Reset de Senha Autônomo para Personais

- Estado: concluído e mergeado
- Branch: `security/sec-04-password-reset`
- Pull request: https://github.com/carlossuzin6111-code/sistema-tonho/pull/87
- Início: 20/07/2026
- Prioridade: 8/10

### Diagnóstico

- O sistema permitia redefinição de senha apenas de alunos por personal ou por troca autenticada de senha pelo perfil.
- É necessário um mecanismo autônomo de recuperação e redefinição de senha para Personais Trainers via token temporário e seguro (`password_reset_tokens`), protegido por limitação estrita de taxa contra força bruta e resposta genérica que impeça a enumeração de contas.

### Plano aprovado

- [x] Confirmar o merge do BUS-01 e sincronizar a `main`.
- [x] Criar a branch exclusiva `security/sec-04-password-reset`.
- [x] Registrar o plano e diagnóstico em `docs/CONTROLE_DE_IMPLEMENTACOES.md`.
- [x] Criar migration Knex `202607200002_create_password_reset_tokens.js` criando a tabela `password_reset_tokens` com chaves estrangeiras e índices.
- [x] Implementar as funções `forgotPassword` e `resetPasswordWithToken` no controller `backend/src/controllers/authController.js` com suporte a hashes de token SHA-256 e revogação de sessão via `session_version`.
- [x] Adicionar schemas de validação no `backend/src/middleware/validateRequest.js`.
- [x] Adicionar rate limiters dedicados e registrar rotas `/api/auth/forgot-password` e `/api/auth/reset-password` com documentação OpenAPI/Swagger no `backend/src/index.js`.
- [x] Criar suíte de testes de integração `backend/src/tests/passwordReset.test.js` (7/7 testes aprovados).
- [x] Executar suítes de testes do backend, frontend e auditorias de segurança.
- [x] Abrir PR e registrar link no arquivo de controle.
- [x] Acompanhar CI.

### Critérios de aceite

- Solicitação de redefinição para e-mail inexistente retorna resposta genérica (200 OK) sem vazar a existência da conta.
- Solicitação para e-mail cadastrado gera token criptográfico com hash no banco e expiração em 1 hora.
- Redefinição com token válido atualiza `password_hash`, invalida sessões ativas via incremento de `session_version` e marca o token como utilizado.
- Reuso ou uso de token expirado/inválido é sumariamente rejeitado (400 Bad Request).
- Endpoints estão protegidos por limitação de taxa (rate limiting).
- Suítes de testes do backend e frontend permanecem 100% aprovadas.

### Evidências

- Migration `202607200002_create_password_reset_tokens.js` criada e aplicada.
- Controller `authController.js` atualizado com `forgotPassword` e `resetPasswordWithToken`.
- Rotas `/api/auth/forgot-password` e `/api/auth/reset-password` ativas com Swagger e rate limiter.
- Teste específico `passwordReset.test.js`: 7/7 aprovados.
- Frontend: 51/51 testes aprovados em 5 suítes.
- Backend: 161/161 testes aprovados em 19 suítes.
- `npm audit` na raiz: 0 vulnerabilidades.
- `npm audit --omit=dev` no backend: 0 vulnerabilidades.
