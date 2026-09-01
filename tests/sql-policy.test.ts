import { describe, expect, it } from 'vitest';
import { countPositionalPlaceholders, validateReadOnlySql } from '../src/sql-policy.js';

describe('read-only SQL policy', () => {
  it('accepts SELECT and read-only CTE queries', () => {
    expect(() => validateReadOnlySql('SELECT * FROM customers')).not.toThrow();
    expect(() => validateReadOnlySql('WITH totals AS (SELECT 1 AS n) SELECT n FROM totals')).not.toThrow();
  });

  it.each(['INSERT INTO customers VALUES (1)', 'UPDATE orders SET status = \'new\'', 'DELETE FROM orders', 'PRAGMA table_info(customers)', 'SELECT 1; DELETE FROM orders', 'WITH x AS (DELETE FROM orders RETURNING id) SELECT * FROM x', 'WITH x AS (SELECT 1) VALUES (2)', 'ATTACH DATABASE \'x\' AS x'])('rejects unsafe SQL: %s', (sql) => {
    expect(() => validateReadOnlySql(sql)).toThrow(/only one SELECT/);
  });
  it('counts placeholders without counting quoted values or comments', () => {
    expect(countPositionalPlaceholders("SELECT '?', name FROM customers WHERE id = ? -- ?\n AND email = ?")).toBe(2);
  });
});
