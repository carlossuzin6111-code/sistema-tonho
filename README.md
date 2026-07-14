# Sistema do Tonho (FitLife Sync) 🏋️‍♂️

Aplicativo web completo para gerenciamento de treinos entre Personal Trainers e Alunos.

## 🚀 O que mudou nesta nova versão? (Refatoração de Arquitetura)

Esta versão traz mudanças profundas na base do projeto visando escalabilidade, velocidade e modularidade. Deixamos de ser um monolito simples em Node.js para nos tornarmos uma aplicação PWA robusta baseada em microsserviços via Docker.

### 1. Separação de Frontend e Backend (Gateway Nginx)
- **Frontend Independente:** Todos os arquivos HTML, CSS e JS que rodam no navegador foram movidos para a pasta `/frontend`.
- **Nginx Proxy Reverso:** O aplicativo agora roda atrás de um servidor Nginx de alta performance (na porta 3000). O Nginx cuida de servir os arquivos estáticos e redireciona qualquer requisição de API invisivelmente para o backend Node.js através da rota `/api`.
- **Prevenção de CORS:** Essa arquitetura evita dores de cabeça com bloqueios de CORS, além de permitir o funcionamento de Server-Sent Events (SSE) limpos para o chat em tempo real.

### 2. Abstração de Banco de Dados com Knex.js
- **Adeus Strings SQL Manuais:** Todas as 5 rotas (`auth`, `student`, `workout`, `exercise` e `chat`) foram refatoradas para usar o *Query Builder* do **Knex.js**.
- **Multi-DB Ready:** O sistema ainda está rodando o prático banco local `SQLite` (via `backend/knexfile.js`), mas agora a estrutura do código está 100% pronta para migrar para bancos de dados mais potentes como `PostgreSQL` ou `MySQL` mudando apenas algumas linhas de configuração.
- **Migração de Respostas:** O Knex encapsula e protege contra injeções SQL e normaliza as devoluções (arrays de IDs ao inserir, métodos padronizados `.first()`, `.del()`, etc).

### 3. Layout PWA Móvel Híbrido (Drawer Sidebar)
- **Roteamento Inteligente:** O arquivo `index.html` agora roteia o usuário de forma autônoma: Desktop vai para `desktop.html`, Smartphone vai para `mobile.html`.
- **Isolamento Completo (Sem Vazamento de Estilos):** Sem uso de `@media` queries mirabolantes. O layout mobile é independente, possuindo:
  - Header fixo
  - **Menu Lateral (Drawer):** Um menu hambúrguer animado que desliza com efeito Glassmorphism para melhor navegação.
  - Menu Inferior (Bottom Navigation) ajustado à área segura dos iPhones (`safe-area-inset-bottom`).

## 🛠️ Tecnologias Utilizadas
- **Node.js** (Backend API)
- **Express.js** (Rotas da API)
- **Knex.js** (ORM e Query Builder)
- **SQLite3** (Banco de dados de desenvolvimento)
- **Nginx** (Web Server / Proxy Reverso)
- **Docker Compose** (Orquestração de Containeres)
- **HTML5/CSS3/Vanilla JS** (Frontend)

## 📦 Como rodar localmente

1. Tenha o Docker Desktop instalado e aberto.
2. Na raiz do projeto, rode:
   ```bash
   docker-compose up -d --build
   ```
3. O Nginx subirá na porta 3000. Acesse no navegador:
   ```
   http://localhost:3000
   ```

## Testes do backend

Use o lockfile para instalar também as dependências de desenvolvimento e executar a mesma suíte usada no CI:

```bash
cd backend
npm ci
npm test
```

Os testes usam SQLite em memória, aguardam a criação do schema e não iniciam o worker externo de tradução.
