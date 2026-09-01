import { accessSync, constants, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolError } from './errors.js';

export function resolveDatabasePath(env: NodeJS.ProcessEnv = process.env, moduleUrl = import.meta.url): string {
  const fallback = resolve(fileURLToPath(new URL('../data/shop.db', moduleUrl)));
  const path = env.SHOP_DB_PATH?.trim() || fallback;
  try {
    if (!statSync(path).isFile()) throw new Error('not a file');
    accessSync(path, constants.R_OK);
    return path;
  } catch (error) {
    console.error('Shop database configuration error:', error instanceof Error ? error.message : String(error));
    throw new ToolError('Database configuration error: the configured shop database is missing or unreadable.');
  }
}
