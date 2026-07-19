const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FitLife Sync API',
      version: '1.0.0',
      description: 'Documentação da API para o sistema do Tonho (FitLife Sync) - Gerenciamento de Treinos e Alunos.',
    },
    servers: [
      {
        url: '/api',
        description: 'Servidor Local (Proxy Nginx)',
      },
      {
        url: 'http://localhost:3000/api',
        description: 'Servidor Direto (Porta interna do App)',
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Compatibilidade para clientes não-browser que gerenciam seu próprio JWT.'
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'fitlife_session',
          description: 'Sessão HttpOnly usada automaticamente pelo navegador.'
        },
        csrfToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-CSRF-Token',
          description: 'Obrigatório em mutações autenticadas por cookie.'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      },
      {
        cookieAuth: [],
        csrfToken: []
      }
    ]
  },
  // Paths to files containing OpenAPI JSDoc annotations
  apis: ['./src/index.js', './src/controllers/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);

function apiDocsEnabled(environment = process.env.NODE_ENV, explicitValue = process.env.API_DOCS_ENABLED) {
  if (explicitValue !== undefined && explicitValue !== '') {
    return String(explicitValue).toLowerCase() === 'true';
  }
  return environment !== 'production';
}

function setupSwagger(app, options = {}) {
  if (!apiDocsEnabled(options.environment, options.enabled)) return false;

  // Serve swagger docs
  app.use('/api/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  
  // Also expose raw swagger JSON
  app.get('/api/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('Swagger API docs available at: /api/api-docs');
  return true;
}

module.exports = setupSwagger;
module.exports.apiDocsEnabled = apiDocsEnabled;
