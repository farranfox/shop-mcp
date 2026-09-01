export class ToolError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export function safeDatabaseError(error: unknown): ToolError {
  const message = error instanceof Error ? error.message : '';
  if (/bind|parameter|argument/i.test(message)) {
    return new ToolError('Incorrect SQL parameters: each ? placeholder needs one matching positional parameter.');
  }
  if (/no such table|no such column|syntax error|misuse|near /i.test(message)) {
    return new ToolError(`SQL query error: ${message.replace(/[/\\][^\s'"`]+/g, '[path]').slice(0, 300)}`);
  }
  return new ToolError('Database access error. Check that the configured database is readable and valid SQLite.');
}
