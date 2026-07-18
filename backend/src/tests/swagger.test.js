const express = require('express');
const request = require('supertest');
const setupSwagger = require('../swagger');
const { apiDocsEnabled } = require('../swagger');

describe('Swagger exposure policy', () => {
  test('is disabled by default in production', async () => {
    const app = express();
    expect(setupSwagger(app, { environment: 'production', enabled: '' })).toBe(false);

    await request(app).get('/api/api-docs/').expect(404);
    await request(app).get('/api/swagger.json').expect(404);
  });

  test('remains available in development', async () => {
    const app = express();
    expect(setupSwagger(app, { environment: 'development', enabled: '' })).toBe(true);

    const response = await request(app).get('/api/swagger.json');
    expect(response.statusCode).toBe(200);
    expect(response.body.openapi).toBe('3.0.0');
  });

  test('supports an explicit production override', () => {
    expect(apiDocsEnabled('production', 'true')).toBe(true);
    expect(apiDocsEnabled('development', 'false')).toBe(false);
  });
});
