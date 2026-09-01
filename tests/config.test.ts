import { describe, expect, it, vi } from 'vitest';
import { resolveDatabasePath } from '../src/config.js';

describe('database configuration', () => {
  it('returns a safe configuration error for a missing configured file', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => resolveDatabasePath({ SHOP_DB_PATH: '/definitely/missing/shop.db' })).toThrow(/configuration error/);
    error.mockRestore();
  });
});
