# FitLife Sync

Sistema web para acompanhamento de alunos por personal trainers. O projeto reúne
cadastro, medidas corporais, catálogo de exercícios, montagem de treinos e chat
em tempo real.

> Estado atual: MVP funcional. A aplicação ainda possui limitações de segurança,
> persistência e escalabilidade que precisam ser tratadas antes de um uso em
> produção com dados reais.

## Funcionalidades

- Autenticação JWT com perfis `personal` e `student`.
- Cadastro e acompanhamento de alunos vinculados a um personal.
- Histórico de medidas corporais.
- Catálogo de exercícios e fichas de treino.
- Chat com atualização em tempo real por Server-Sent Events (SSE).
- Interfaces desktop e mobile em HTML, CSS e JavaScript.
- Documentação OpenAPI disponibilizada pela própria API.

## Arquitetura atual

#### Migrations do banco

O schema é versionado em `backend/src/db/migrations`. A aplicação executa automaticamente as migrations pendentes antes de abrir a porta HTTP. Para operar manualmente:

```bash
cd backend
npm run migrate
npm run migrate:status
npm run migrate:rollback
```

Defina `NODE_ENV` para selecionar o ambiente do `knexfile.js` e `DB_PATH` para indicar o arquivo SQLite em desenvolvimento ou produção. O rollback remove as tabelas da aplicação e deve ser usado somente com backup e autorização do responsável pelos dados.

#### Chaves de cadastro

As chaves de cadastro são geradas com 256 bits de entropia criptográfica, armazenadas no banco somente como hashes SHA-256 e consumidas na mesma transação que cria o personal. Para gerar uma chave:

```bash
cd backend
npm run access-key:create
```

O valor é exibido uma única vez. Armazene-o em um canal seguro e não o inclua em commits, logs ou tickets. As chaves do antigo `keys_aut.json` não são importadas automaticamente: como foram versionadas, devem ser revogadas e substituídas por novas chaves após alinhamento com o mantenedor.

### 3. Layout PWA Móvel Híbrido (Drawer Sidebar)
- **Roteamento Inteligente:** O arquivo `index.html` agora roteia o usuário de forma autônoma: Desktop vai para `desktop.html`, Smartphone vai para `mobile.html`.
- **Isolamento Completo (Sem Vazamento de Estilos):** Sem uso de `@media` queries mirabolantes. O layout mobile é independente, possuindo:
  - Header fixo
  - **Menu Lateral (Drawer):** Um menu hambúrguer animado que desliza com efeito Glassmorphism para melhor navegação.
  - Menu Inferior (Bottom Navigation) ajustado à área segura dos iPhones (`safe-area-inset-bottom`).

| Componente | Responsabilidade |
|---|---|
| `frontend/` | Interfaces estáticas desktop e mobile |
| Nginx | Arquivos estáticos, proxy reverso e suporte ao SSE |
| Express | Autenticação, alunos, medidas, treinos, exercícios e chat |
| Knex + SQLite | Acesso e persistência dos dados |
| Cloudflare Tunnel | Exposição externa opcional do Nginx |

O uso do Knex reduz o acoplamento das consultas, mas a aplicação está configurada
e testada apenas com SQLite. Migrar para PostgreSQL ou MySQL exige revisar schema,
migrations, tipos e retornos de inserção.

Veja a descrição detalhada em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Estrutura do repositório

```text
.
├── backend/
│   ├── src/controllers/   # Regras das áreas funcionais
│   ├── src/middleware/    # Autenticação e autorização
│   ├── src/tests/         # Testes de integração
│   ├── src/database.js    # Bootstrap do schema, seed e tradutor
│   └── knexfile.js        # Conexões Knex por ambiente
├── frontend/
│   ├── css/
│   ├── js/
│   ├── desktop.html
│   ├── mobile.html
│   └── index.html         # Seleção da interface por dispositivo
├── docker-compose.yml
└── nginx.conf
```

## Executar com Docker

Pré-requisitos: Docker Desktop ou Docker Engine com Docker Compose.

1. Copie `.env.example` para `.env` e substitua todos os valores de exemplo.
2. Inicie o frontend, Nginx e backend:

   ```bash
   docker compose up -d --build web app
   ```

## Configuração segura antes de iniciar

1. Copie `.env.example` para `.env`.
2. Gere um segredo JWT aleatório com pelo menos 32 bytes. Por exemplo:
   ```bash
   openssl rand -base64 48
   ```
3. Preencha `JWT_SECRET` no `.env` com o valor gerado. A aplicação recusa segredos ausentes ou menores que 32 bytes. Não reutilize o antigo valor padrão.
4. Copie `backend/keys_aut.example.json` para `backend/keys_aut.json` e adicione somente as chaves de cadastro necessárias ao ambiente local.
5. Mantenha `.env`, `backend/keys_aut.json` e bancos SQLite fora do Git. Esses arquivos já estão listados no `.gitignore` e no `.dockerignore`.

O Docker Compose monta `backend/keys_aut.json` no container sem incorporá-lo à imagem. Crie o arquivo antes de executar `docker-compose up`.

Se o segredo padrão ou as chaves anteriormente versionadas tiverem sido usados, eles devem ser rotacionados pelo mantenedor. A remoção do histórico Git exige coordenação separada e não deve ser feita em uma contribuição comum sem aprovação explícita.
