import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ReadOnlyDatabase, type SqlParameter } from './database.js';
import { ToolError } from './errors.js';
import { discoverSchema } from './schema.js';

const parameterSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const queryInput = z.object({
  sql: z.string().min(1, 'sql must not be empty').describe('One read-only SQLite SELECT query. CTEs beginning with WITH are allowed when their final statement is SELECT. Do not send multiple statements or PRAGMA. Use parameter placeholders for values supplied through parameters.'),
  parameters: z.array(parameterSchema).default([]).describe('Optional positional values bound to ? placeholders, in order.'),
  page: z.number().int().min(1).default(1).describe('One-based page number.'),
  pageSize: z.number().int().min(1).max(100).default(50).describe('Maximum rows returned for this page; server maximum is 100.'),
}).strict();

function success(value: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value };
}

function failure(error: unknown) {
  const message = error instanceof ToolError ? error.message : 'Unexpected server error.';
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

export function createShopServer(database: ReadOnlyDatabase): McpServer {
  const server = new McpServer({ name: 'shop-database', version: '1.0.0' });
  server.registerTool('get_database_schema', {
    title: 'Get database schema',
    description: 'Returns user-facing business tables, columns, constraints, indexes, and relationships. The database is read-only and has no country field, so country analytics are unavailable.',
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({}).passthrough(),
  }, async () => {
    try { return success(discoverSchema(database)); } catch (error) { return failure(error); }
  });
  server.registerTool('query_database', {
    title: 'Query database',
    description: 'Executes exactly one read-only SELECT or WITH ... SELECT query. Data definition, data modification, transactions, attachments, PRAGMA, and multiple statements are refused. Pagination is server-applied and results include paging metadata; include stable ORDER BY when retrieving multiple pages.',
    inputSchema: queryInput,
    outputSchema: z.object({}).passthrough(),
  }, async ({ sql, parameters, page, pageSize }) => {
    try { return success(database.query(sql, parameters as SqlParameter[], page, pageSize)); } catch (error) { return failure(error); }
  });
  return server;
}
