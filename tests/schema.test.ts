import { DatabaseSync } from 'node:sqlite';
import { copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { ReadOnlyDatabase } from '../src/database.js';
import { discoverSchema } from '../src/schema.js';

describe('schema discovery', () => {
  const tempPath = join(mkdtempSync(join(tmpdir(), 'shop-mcp-schema-')), 'shop.db');
  copyFileSync(join(process.cwd(), 'data', 'shop.db'), tempPath);
  const database = new ReadOnlyDatabase(tempPath);
  afterEach(() => undefined);
  it('returns business tables and hides SQLite internals', () => {
    const schema = discoverSchema(database);
    expect(schema.tables.map((table: { name: string }) => table.name)).toEqual(['customers', 'order_items', 'orders', 'products']);
    expect(JSON.stringify(schema)).not.toContain('sqlite_sequence');
    expect(JSON.stringify(schema)).toContain('country field');
  });
});
