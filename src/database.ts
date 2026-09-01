import { DatabaseSync } from 'node:sqlite';
import { ToolError, safeDatabaseError } from './errors.js';
import { countPositionalPlaceholders, validateReadOnlySql } from './sql-policy.js';

export type SqlParameter = string | number | boolean | null;
export type QueryResult = { columns: string[]; rows: Record<string, unknown>[]; page: number; pageSize: number; returnedRowCount: number; hasMore: boolean };

function safeValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (value === undefined) return null;
  return value;
}

export class ReadOnlyDatabase {
  private readonly db: DatabaseSync;

  public constructor(path: string) {
    try {
      this.db = new DatabaseSync(path, { readOnly: true, allowExtension: false });
    } catch (error) {
      console.error('Shop database open error:', error instanceof Error ? error.message : String(error));
      throw new ToolError('Database access error. Check that the configured database is readable and valid SQLite.');
    }
  }

  public query(sql: string, parameters: SqlParameter[] = [], page = 1, pageSize = 50): QueryResult {
    validateReadOnlySql(sql);
    if (countPositionalPlaceholders(sql) !== parameters.length) {
      throw new ToolError('Incorrect SQL parameters: each ? placeholder needs one matching positional parameter.');
    }
    if (!Number.isSafeInteger(page) || page < 1) throw new ToolError('Invalid field page: expected an integer of at least 1.');
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new ToolError('Invalid field pageSize: expected an integer from 1 to 100.');
    const offset = (page - 1) * pageSize;
    if (!Number.isSafeInteger(offset)) throw new ToolError('Invalid pagination: page and pageSize exceed the safe integer range.');
    try {
      const statement = this.db.prepare(`SELECT * FROM (${sql}) AS __mcp_query LIMIT ? OFFSET ?`);
      const values = parameters.map((value) => typeof value === 'boolean' ? Number(value) : value);
      const rawRows = statement.all(...values, pageSize + 1, offset) as Record<string, unknown>[];
      const hasMore = rawRows.length > pageSize;
      const rows = rawRows.slice(0, pageSize).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safeValue(value)])));
      return { columns: rows.length ? Object.keys(rows[0]!) : statement.columns().map((column) => column.name), rows, page, pageSize, returnedRowCount: rows.length, hasMore };
    } catch (error) {
      throw safeDatabaseError(error);
    }
  }

  public all(sql: string): Record<string, unknown>[] {
    try { return this.db.prepare(sql).all() as Record<string, unknown>[]; } catch (error) { throw safeDatabaseError(error); }
  }

  public close(): void { this.db.close(); }
}
