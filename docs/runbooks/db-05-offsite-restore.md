# DB-05 — Backup off-site e restore

## Configuração

O worker `backup-worker` continua criando o bundle local verificado. Quando `BACKUP_S3_BUCKET` está definido, ele envia três cópias do banco para um bucket S3-compatible (Amazon S3 ou Cloudflare R2):

- `daily/`: mantém os sete últimos ciclos;
- `weekly/`: mantém quatro ciclos;
- `monthly/`: mantém um ciclo.

O arquivo `database.sqlite` é cifrado localmente com AES-256-GCM antes do upload. Gere uma chave de 32 bytes (`openssl rand -hex 32`) e injete-a como `BACKUP_ENCRYPTION_KEY` no secret manager. Nunca grave a chave em `.env`, logs ou no bucket. Configure também `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ENDPOINT` (obrigatório para R2), `BACKUP_S3_ACCESS_KEY_ID` e `BACKUP_S3_SECRET_ACCESS_KEY`.

O worker usa `ServerSideEncryption: AES256` como camada adicional. A retenção remota é aplicada após cada upload; o bucket deve ter versionamento e lifecycle próprio como segunda proteção.

## Restore testado

1. Pare a API/worker ou isole o diretório de dados.
2. Baixe o `database.sqlite.enc` e `manifest.json` do prefixo desejado, preservando a classe mais recente compatível com o RPO.
3. Desencripte o arquivo usando a chave correspondente à versão indicada no manifesto; valide o header `FITLIFE-BACKUP-V1` e a tag GCM antes de abrir o SQLite.
4. Execute `node backend/src/scripts/restoreBackup.js <bundle> <novo-diretorio>` para restaurar o bundle local, incluindo avatares quando presentes.
5. Execute `PRAGMA integrity_check`, `npm run migrate:status` e os testes de smoke antes de apontar `DB_PATH` para o diretório restaurado.
6. Registre horário, prefixo, versão da chave, resultado da integridade e RTO no incidente.

O teste automatizado usa um cliente S3 injetado e não acessa a nuvem. Um restore periódico real deve ser executado em ambiente isolado, com a chave recuperada do secret manager.
