import { ToolError } from './errors.js';

const FORBIDDEN = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'UPSERT', 'CREATE', 'DROP', 'ALTER',
  'VACUUM', 'REINDEX', 'ANALYZE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
  'RELEASE', 'ATTACH', 'DETACH', 'PRAGMA', 'LOAD_EXTENSION', 'VALUES', 'EXPLAIN',
]);

function tokens(sql: string): string[] {
  const result: string[] = [];
  let index = 0;
  while (index < sql.length) {
    const char = sql[index]!;
    if (/\s/.test(char)) { index += 1; continue; }
    if (char === '-' && sql[index + 1] === '-') {
      index = sql.indexOf('\n', index + 2); if (index < 0) break; continue;
    }
    if (char === '/' && sql[index + 1] === '*') {
      const end = sql.indexOf('*/', index + 2);
      if (end < 0) throw new ToolError('SQL query error: unterminated comment.');
      index = end + 2; continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const quote = char; index += 1;
      while (index < sql.length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) { index += 2; continue; }
          index += 1; break;
        }
        index += 1;
      }
      if (index >= sql.length && sql[index - 1] !== quote) throw new ToolError('SQL query error: unterminated quoted value.');
      continue;
    }
    if (char === '[') {
      const end = sql.indexOf(']', index + 1);
      if (end < 0) throw new ToolError('SQL query error: unterminated identifier.');
      index = end + 1; continue;
    }
    if (char === ';') { result.push(';'); index += 1; continue; }
    if (/[A-Za-z_]/.test(char)) {
      let word = char; index += 1;
      while (index < sql.length && /[A-Za-z0-9_$]/.test(sql[index]!)) word += sql[index++]!;
      result.push(word.toUpperCase()); continue;
    }
    index += 1;
  }
  return result;
}

export function validateReadOnlySql(sql: string): void {
  if (!sql.trim()) throw new ToolError('Invalid field sql: provide one read-only SELECT or WITH ... SELECT query.');
  const words = tokens(sql);
  while (words.at(-1) === ';') words.pop();
  if (words.length === 0 || words.includes(';')) {
    throw new ToolError('Read-only policy violation: only one SELECT / WITH ... SELECT query is permitted and the database cannot be changed.');
  }
  if (words[0] !== 'SELECT' && words[0] !== 'WITH') {
    throw new ToolError('Read-only policy violation: only one SELECT / WITH ... SELECT query is permitted and the database cannot be changed.');
  }
  if (words.some((word) => FORBIDDEN.has(word))) {
    throw new ToolError('Read-only policy violation: only one SELECT / WITH ... SELECT query is permitted and the database cannot be changed.');
  }
  if (words[0] === 'WITH' && !words.includes('SELECT')) {
    throw new ToolError('Read-only policy violation: a WITH query must finish with SELECT.');
  }
}

export function countPositionalPlaceholders(sql: string): number {
  let count = 0;
  let index = 0;
  while (index < sql.length) {
    const char = sql[index]!;
    if (char === '-' && sql[index + 1] === '-') { index = sql.indexOf('\n', index + 2); if (index < 0) break; continue; }
    if (char === '/' && sql[index + 1] === '*') { const end = sql.indexOf('*/', index + 2); index = end < 0 ? sql.length : end + 2; continue; }
    if (char === "'" || char === '"' || char === '`') {
      const quote = char; index += 1;
      while (index < sql.length) { if (sql[index] === quote) { if (sql[index + 1] === quote) { index += 2; continue; } index += 1; break; } index += 1; }
      continue;
    }
    if (char === '?') count += 1;
    index += 1;
  }
  return count;
}
