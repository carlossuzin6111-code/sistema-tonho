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

- Estado: implementado; entrega em andamento
- Branch: `db/db-02-sqlite-wal-timeout`
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
- [ ] Abrir PR e acompanhar a CI.

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
- Gitleaks local pendente: o Docker Desktop permaneceu desligado após queda de energia; a verificação será executada pelo job obrigatório do PR.

### Fora do escopo

- `PRAGMA foreign_keys = ON`, tratado separadamente no DB-03.
- Migração para PostgreSQL ou múltiplas réplicas da aplicação.
