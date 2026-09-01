import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReadOnlyDatabase } from '../src/database.js';

describe('read-only database queries', () => {
  let path: string;
  let database: ReadOnlyDatabase;
  beforeEach(() => {
    path = join(mkdtempSync(join(tmpdir(), 'shop-mcp-')), 'fixture.db');
    const fixture = new DatabaseSync(path);
    fixture.exec(`
      CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, total_amount REAL);
      CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, product_id INTEGER, quantity INTEGER, unit_price REAL);
      INSERT INTO products VALUES (1, 'A', 10), (2, 'B', 20), (3, 'C', 30);
      INSERT INTO orders VALUES (1, 50), (2, 20);
      INSERT INTO order_items VALUES (1, 1, 1, 2, 10), (2, 1, 2, 1, 30), (3, 2, 1, 1, 20);
    `);
    fixture.close(); database = new ReadOnlyDatabase(path);
  });
  afterEach(() => database.close());

  it('binds parameters and applies safe paging', () => {
    expect(database.query('SELECT name, price FROM products WHERE price >= ?', [20], 1, 1)).toEqual({ columns: ['name', 'price'], rows: [{ name: 'B', price: 20 }], page: 1, pageSize: 1, returnedRowCount: 1, hasMore: true });
    expect(database.query('SELECT name FROM products ORDER BY id', [], 2, 2).rows).toEqual([{ name: 'C' }]);
  });
  it('rejects invalid paging and does not mutate data', () => {
    expect(() => database.query('SELECT * FROM products', [], 0)).toThrow(/page/);
    expect(() => database.query('SELECT * FROM products', [], 1, 101)).toThrow(/pageSize/);
    expect(() => database.query('DELETE FROM products')).toThrow(/only one SELECT/);
    expect(database.query('SELECT count(*) AS count FROM products').rows).toEqual([{ count: 3 }]);
  });
  it('supports joins and historical line-item revenue aggregation', () => {
    const result = database.query(`
      SELECT p.name, SUM(oi.quantity) AS units, SUM(oi.quantity * oi.unit_price) AS revenue
      FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id
      GROUP BY p.id ORDER BY revenue DESC
    `);
    expect(result.rows).toEqual([{ name: 'A', units: 3, revenue: 40 }, { name: 'B', units: 1, revenue: 30 }]);
  });
  it('returns concise binding and SQL errors', () => {
    expect(() => database.query('SELECT name FROM products WHERE id = ?')).toThrow(/parameter/i);
    expect(() => database.query('SELECT missing_column FROM products')).toThrow(/SQL query error/);
  });
});
