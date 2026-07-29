# DB-06 — Governança de migrations expand/contract

Toda migration nova deve ser compatível com a versão anterior da aplicação. A fase de expansão adiciona tabelas/colunas nullable, defaults compatíveis ou índices; o código novo é publicado somente depois que essa fase estiver aplicada. A remoção de colunas, tabelas ou renomeações fica para uma migration posterior, depois de todas as instâncias deixarem de consumir o formato antigo.

O script `.github/scripts/verify-migration-policy.sh` exige `exports.up` e `exports.down` em cada migration e rejeita `dropTable`, `dropColumn` e `renameColumn` dentro de `up`. O teste `migrationPolicy.test.js` replica a regra no backend. Rollbacks destrutivos continuam permitidos em `down`, pois são necessários para recuperação controlada.

Fluxo de deploy:

1. Publicar a migration de expansão e executar `npm run migrate:status`.
2. Confirmar que a versão antiga continua iniciando e que os índices/colunas novas são opcionais.
3. Publicar o código que lê/escreve o novo formato, com dual-read/dual-write quando houver mudança de representação.
4. Medir logs e métricas por uma janela de segurança; só então planejar a contração em PR separado.
5. Executar rollback apenas em janela controlada, verificando backup e compatibilidade antes de remover dados.
