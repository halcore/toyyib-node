import { describe, expect, it } from 'vitest';

import { filterSchema } from '../scripts/filter-schema.mjs';

const json = (ref: string) => ({
  description: 'OK',
  content: { 'application/json': { schema: { $ref: ref } } },
});

/** An invented schema shaped like the server's: external, web-app and internal routes. */
function makeSchema() {
  return {
    openapi: '3.0.3',
    info: { title: 'Toyyib API', version: '1.0.0' },
    servers: [{ url: 'https://internal.example' }],
    security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    tags: [{ name: 'stocks' }, { name: 'usage' }, { name: 'account' }],
    paths: {
      '/api/v1/stocks/compliant': {
        get: {
          tags: ['stocks'],
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
          responses: { '200': json('#/components/schemas/PaginatedStocks') },
        },
      },
      '/api/v1/usage': {
        get: { tags: ['usage'], responses: { '200': { description: 'OK' } } },
      },
      '/api/v1/stocksearch': {
        get: { responses: { '200': json('#/components/schemas/Other') } },
      },
      '/api/v1/schema/': {
        get: { responses: { '200': { description: 'OK' } } },
      },
      '/v1/stocks/': {
        get: {
          tags: ['account'],
          responses: { '200': json('#/components/schemas/WebStock') },
        },
      },
      '/internal/v1/x': {
        post: {
          responses: { '200': json('#/components/schemas/InternalThing') },
        },
      },
    },
    components: {
      schemas: {
        PaginatedStocks: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/StockCompliance' },
            },
            next_token: { type: 'string', nullable: true },
          },
        },
        StockCompliance: {
          type: 'object',
          properties: { status: { $ref: '#/components/schemas/StatusEnum' } },
        },
        StatusEnum: { type: 'string', enum: ['compliant', 'non_compliant'] },
        WebStock: { type: 'object' },
        InternalThing: { type: 'object' },
        Other: { type: 'object' },
      },
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        BearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
  };
}

describe('filterSchema', () => {
  it('keeps only the external API paths', () => {
    expect(Object.keys(filterSchema(makeSchema()).paths)).toEqual([
      '/api/v1/stocks/compliant',
      '/api/v1/usage',
    ]);
  });

  it('keeps the components kept paths use, following nested refs', () => {
    const { schemas } = filterSchema(makeSchema()).components;
    expect(Object.keys(schemas).sort()).toEqual([
      'PaginatedStocks',
      'StatusEnum',
      'StockCompliance',
    ]);
  });

  it('keeps only the API key security scheme', () => {
    const result = filterSchema(makeSchema());
    expect(result.components.securitySchemes).toEqual({
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    });
    expect(result.security).toEqual([{ ApiKeyAuth: [] }]);
    expect(result.paths['/api/v1/stocks/compliant'].get.security).toEqual([
      { ApiKeyAuth: [] },
    ]);
  });

  it('keeps info and the tags kept operations use, and drops servers', () => {
    const result = filterSchema(makeSchema());
    expect(result.info).toEqual({ title: 'Toyyib API', version: '1.0.0' });
    expect(result.tags).toEqual([{ name: 'stocks' }, { name: 'usage' }]);
    expect(result).not.toHaveProperty('servers');
  });

  it('does not change its input', () => {
    const schema = makeSchema();
    filterSchema(schema);
    expect(schema).toEqual(makeSchema());
  });
});
