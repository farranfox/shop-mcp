import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveDatabasePath } from './config.js';
import { ReadOnlyDatabase } from './database.js';
import { createShopServer } from './server.js';

async function main(): Promise<void> {
  const database = new ReadOnlyDatabase(resolveDatabasePath());
  const server = createShopServer(database);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Server startup failed.');
  process.exitCode = 1;
});
