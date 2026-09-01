import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReadOnlyDatabase } from '../src/database.js';
import { createShopServer } from '../src/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('MCP server registration', () => {
  it('exposes exactly the two public tools through MCP', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'shop-mcp-server-')), 'fixture.db');
    const fixture = new DatabaseSync(path); fixture.exec('CREATE TABLE customers (id INTEGER PRIMARY KEY); INSERT INTO customers VALUES (1)'); fixture.close();
    const server = createShopServer(new ReadOnlyDatabase(path));
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(['get_database_schema', 'query_database']);
    const result = await client.callTool({ name: 'query_database', arguments: { sql: 'SELECT id FROM customers' } });
    expect(result.isError).toBeUndefined();
    await client.close();
  });
});
