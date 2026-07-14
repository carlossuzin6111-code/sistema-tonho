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

O FitLife Sync é um **monólito modular conteinerizado**, não uma arquitetura de
microsserviços. Há uma única aplicação Node.js/Express responsável por todas as
regras de negócio e um Nginx que serve o frontend e encaminha `/api` ao backend.

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

3. Acesse `http://localhost:3000`.

Para iniciar também o túnel, defina `TUNNEL_TOKEN` no `.env` e execute:

```bash
docker compose up -d --build
```

Nunca versione o `.env`, tokens do túnel, chaves de cadastro ou bancos com dados
operacionais.

## Executar e testar o backend localmente

```bash
cd backend
npm ci
npm test
npm start
```

O backend usa a porta `3000` por padrão. Se o Nginx já estiver nessa porta,
configure outra porta no ambiente antes de executar o processo local.

Na branch principal atual, a inicialização da API também inicia o tradutor em
segundo plano. Esse worker pode manter um handle aberto após os testes; trate isso
como uma limitação conhecida, não como motivo para ocultar falhas da suíte.

## Endereços úteis

- Aplicação via Nginx: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/api/api-docs`
- Especificação OpenAPI: `http://localhost:3000/api/swagger.json`

## Variáveis de ambiente

| Variável | Uso | Padrão atual |
|---|---|---|
| `PORT` | Porta interna do backend | `3000` |
| `NODE_ENV` | Ambiente do Node.js | `development` no Compose |
| `JWT_SECRET` | Assinatura dos tokens JWT | Deve ser substituído por segredo forte |
| `DB_PATH` | Caminho do arquivo SQLite | `/app/data/database.sqlite` no Compose |
| `TUNNEL_TOKEN` | Credencial do Cloudflare Tunnel | Sem valor seguro padrão |

## Limitações conhecidas da versão atual

- O schema é criado durante a inicialização, sem migrations versionadas reais.
- O tradutor de exercícios roda em loop dentro do processo HTTP.
- O armazenamento e o transporte do JWT no frontend precisam de hardening.
- SQLite atende ao MVP, mas limita concorrência e escala horizontal.
- O frontend é responsivo, porém não possui manifest ou service worker; portanto,
  ainda não é uma PWA instalável.
- O túnel torna a aplicação pública e só deve ser habilitado em ambiente
  devidamente protegido.

## Codificação de texto

Arquivos de texto devem ser salvos em UTF-8 com finais de linha LF. As regras
estão em `.editorconfig` e `.gitattributes`. No Windows PowerShell 5.1, use
`Get-Content arquivo -Encoding UTF8` para evitar que texto UTF-8 seja exibido
como mojibake.

Para diagnóstico de acesso pela rede local, consulte
[mobile_access_troubleshooting.md](mobile_access_troubleshooting.md).
