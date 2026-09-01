# Specification: read-only MCP server for `data/shop.db`

## 1. Role and objective

You are a senior TypeScript/Node.js engineer specialising in the Model Context
Protocol (MCP). Create a production-quality MCP server that lets an
MCP-compatible AI agent analyse the local SQLite database of an online store.

The server is an adapter between an MCP client and a **read-only** SQLite
database. It must start through the standard input/output transport; it must
not expose HTTP endpoints or require the user to run a separate web server.

After installation and build, the following command must start the server:

```bash
node dist/index.js
```

An MCP-client configuration must be able to use it as follows (the absolute
path is intentionally only in the client configuration, never hard-coded in
the source code):

```json
{
  "mcpServers": {
    "shop-database": {
      "command": "node",
      "args": ["/absolute/path/to/shop-mcp/dist/index.js"],
      "env": {
        "SHOP_DB_PATH": "/absolute/path/to/shop-mcp/data/shop.db"
      }
    }
  }
}
```

## 2. Source of truth and scope

The database file is `data/shop.db`. Its schema is the
source of truth. Do not invent tables, columns, values, or relationships not
present in this database.

The confirmed schema contains these business tables:

```text
customers
  id, first_name, last_name, email, phone, created_at

products
  id, name, category, price, stock_quantity, created_at

orders
  id, customer_id, order_date, status, total_amount

order_items
  id, order_id, product_id, quantity, unit_price
```

Relationships:

```text
customers.id      <- orders.customer_id
orders.id         <- order_items.order_id
products.id       <- order_items.product_id
```

`orders.status` is constrained to `new`, `processing`, `shipped`,
`completed`, or `cancelled`. `order_items.quantity` is positive.

There is no country column in the provided schema. Therefore do **not** add,
document, test, or claim support for country-based questions (including
customers from Germany and country with the most customers).

The server must not mutate the database under any circumstance. It does not
manage customers, orders, products, stock, or payments; it only exposes data
for analysis.

## 3. Expected analytical capabilities

The connected AI agent must be able to inspect the schema and answer, using
the MCP tools, at least the following questions:

1. List the available tables and explain their columns and relationships.
2. Identify the customer who spent the most money, returning name, email and
   total spend.
3. Return the five best-selling products with name, sold quantity and revenue.
4. Return the three product categories with the greatest revenue, joining
   `orders`, `order_items`, and `products`.
5. Calculate revenue generated in 2025 using the order date.
6. Identify the customer with the most orders and return their order count.

The tool design must also support common e-commerce analytical requests without
adding a dedicated tool for each one, for example:

- monthly revenue and order trends;
- average order value and revenue by order status;
- top customers by spend or order frequency;
- product/category sales, units, and revenue;
- low-stock products and stock overview;
- order history for a customer, order, or product;
- recent orders and operational status counts.

Use the data and columns actually available. When calculating product revenue,
use the historical line-item value `order_items.quantity * order_items.unit_price`
unless the question explicitly requires the current product catalogue price.
When calculating order-based revenue, use `orders.total_amount` unless a query
explicitly needs line-item aggregation. Do not silently redefine what
“revenue” means; the tool merely executes the agent's stated SQL.

## 4. MCP tool design

Create exactly two public MCP tools. Do **not** create specialised tools such
as `get_top_products`, `get_customer_orders`, or `get_low_stock_products`.
The generic design is deliberate: it keeps the surface small while allowing an
agent to compose arbitrary safe analytical queries.

### 4.1 `get_database_schema`

Returns schema metadata for user-facing business tables only. Use this before
writing a query when the agent needs to discover table names, columns, types,
constraints, indexes, or foreign-key relationships.

Input schema:

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

Return structured, LLM-friendly data for each table: table name, explanatory
description, columns (name, SQLite type, nullability, default, primary-key
flag), foreign keys, and indexes when present. Exclude SQLite internal tables,
including `sqlite_sequence`, from the regular result.

Its description must explicitly say that the database is read-only and has no
country field, so the agent does not hallucinate unavailable country analytics.

### 4.2 `query_database`

Executes one read-only SQL query against `data/shop.db`. Use it for filters, joins,
aggregations, sorting, pagination, and any ad-hoc analytics after inspecting
the schema.

Input schema:

```json
{
  "type": "object",
  "properties": {
    "sql": {
      "type": "string",
      "description": "One read-only SQLite SELECT query. CTEs beginning with WITH are allowed when their final statement is SELECT. Do not send multiple statements or PRAGMA. Use parameter placeholders for values supplied through parameters."
    },
    "parameters": {
      "type": "array",
      "description": "Optional positional values bound to ? placeholders, in order. Values may be strings, numbers, booleans, or null.",
      "items": {
        "type": ["string", "number", "boolean", "null"]
      },
      "default": []
    },
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1,
      "description": "One-based page number. Use with pageSize for paginated result retrieval."
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 50,
      "description": "Maximum rows returned for this page. The server-enforced maximum is 100."
    }
  },
  "required": ["sql"],
  "additionalProperties": false
}
```

The description must make clear: only a single `SELECT` statement (or a
`WITH ... SELECT` query) is accepted; data-definition, data-modification,
transaction, attachment, pragma, and multiple-statement SQL is refused;
pagination is server-applied; and the result includes paging metadata.

Tool result format:

```json
{
  "columns": ["column_name"],
  "rows": [{"column_name": "value"}],
  "page": 1,
  "pageSize": 50,
  "returnedRowCount": 1,
  "hasMore": false
}
```

Return structured content when supported by the installed MCP SDK, with a
compact textual fallback for clients that only display text. Preserve SQLite
`NULL` as JSON `null`. Serialise unsupported values safely and consistently.

## 5. Read-only security contract

Open SQLite in read-only mode. The connection configuration itself must prevent
writes where the SQLite driver supports that capability; SQL validation is a
second, defence-in-depth layer, not the sole safeguard.

`query_database` must reject, before execution:

- `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `UPSERT`;
- `CREATE`, `DROP`, `ALTER`, `VACUUM`, `REINDEX`, `ANALYZE`;
- transaction and savepoint statements;
- `ATTACH`, `DETACH`, `PRAGMA`, extension loading, and any non-query command;
- multiple SQL statements, including a permitted query followed by a semicolon
  and another command;
- CTEs containing mutation statements (for example `WITH x AS (DELETE ...)`).

Do not rely on a prefix-only check such as `sql.trim().startsWith('SELECT')`.
Use robust validation compatible with `node:sqlite`, and also use the driver's
read-only mode. A destructive request such as “Delete
all cancelled orders” must produce a clear tool error and make no database
change.

Never expose database file paths, environment contents, credentials, or stack
traces in tool results. Log operational diagnostics only to stderr, never to
stdout, because stdout carries MCP protocol messages.

## 6. Pagination and result limits

Pagination and a strict row limit are required.

- Default `page` is 1 and default `pageSize` is 50.
- Maximum `pageSize` is 100; values above this must fail validation rather than
  be silently increased or ignored.
- Apply pagination safely in the server, not by trusting an agent-supplied
  `LIMIT`/`OFFSET`. Preserve a valid agent-supplied `LIMIT` if present only if
  doing so is compatible with the chosen safe implementation; otherwise return
  a clear validation error telling the agent to remove it and use `page` and
  `pageSize`.
- Fetch at most `pageSize + 1` rows to determine `hasMore`, and return at most
  `pageSize` rows.
- Calculate the offset safely and reject page/size combinations that overflow
  or exceed the driver's safe integer range.

Document that a stable `ORDER BY` should be included whenever an agent fetches
multiple pages.

## 7. Error handling

The server must remain running after a tool failure. Return actionable MCP tool
errors in Russian or English consistently; do not return raw stack traces.

Required error cases include:

- Invalid tool input: identify the invalid field and expected constraint.
- Read-only policy violation: say that only one `SELECT` / `WITH ... SELECT`
  query is permitted and the database cannot be changed.
- SQL syntax or semantic error: return a concise SQLite error message, scrubbed
  of local paths and internal implementation details.
- Incorrect number of SQL parameters: explain that each `?` placeholder needs
  a matching positional parameter.
- Database missing, unreadable, or corrupt: return a generic configuration or
  database-access error, while writing diagnostic detail only to stderr.

Never turn a database error into an empty successful result.

## 8. Technology and architecture

Use current, official, stable APIs documented by the following dependencies at
implementation time:

- Node.js (current supported LTS);
- TypeScript with `strict: true`;
- `@modelcontextprotocol/sdk`;
- Zod for MCP tool input schemas, as appropriate for the installed SDK version;
- the built-in Node.js `node:sqlite` module for all SQLite access. Do not add a
  third-party SQLite driver such as `sqlite3`, `better-sqlite3`, or `sql.js`.
  Select and document a supported Node.js LTS version in which `node:sqlite`
  provides the required stable API, parameterised queries, and read-only
  database opening capability;
- a TypeScript test runner such as Vitest.

Use `StdioServerTransport`. Do not use Express, Fastify, HTTP, SSE, or a
separate API service. Do not use an HTTP client: this server accesses a local
SQLite file directly.

Before choosing package versions or writing integration code, consult the
official documentation for every dependency and use its current supported API;
do not rely on outdated snippets or assumptions. In particular, consult the
[official MCP TypeScript SDK repository](https://github.com/modelcontextprotocol/typescript-sdk)
and the [official Zod package documentation](https://www.npmjs.com/package/zod).
Use the official Node.js documentation for `node:sqlite` and the chosen test
runner's official documentation as well. Record the compatible versions and
any material API decisions in the README.

Suggested organisation:

```text
src/
  index.ts              # stdio startup only
  server.ts             # MCP server and tool registration
  config.ts             # validated environment/configuration
  database.ts           # read-only connection and safe query execution
  schema.ts             # schema discovery and business-table descriptions
  sql-policy.ts         # single-statement/read-only validation
  errors.ts             # safe, user-facing error mapping
tests/
  ...
package.json
tsconfig.json
vitest.config.ts        # if required by the selected runner
.env.example
.gitignore
README.md
```

Keep MCP handlers thin: validation and response shaping belong in the tool
layer; database connection and execution belong in `database.ts`; policy
validation must be independently testable. Avoid `any`, global mutable state,
and duplicated SQL-policy logic.

## 9. Configuration

Resolve the database path in this precedence order:

1. `SHOP_DB_PATH`, when it is supplied;
2. a path to `data/shop.db` calculated relative to the built project files.

Do not hard-code an absolute local path. Validate that the selected path exists
and is a regular readable file. The default must work after `npm run build`
when the repository contains `data/shop.db`.

Provide `.env.example` containing:

```dotenv
# Optional. Defaults to ../data/shop.db relative to the project build output.
SHOP_DB_PATH=
```

No authentication is required for this local database server. Do not invent
tokens, API keys, or HTTP configuration variables.

Add `.env`, generated output, coverage output, and dependency directories to
`.gitignore`, while keeping `data/shop.db` tracked/included as required by the
assignment.

## 10. Package scripts and quality gates

Provide these scripts at minimum:

```text
npm run build      Compile TypeScript to dist/
npm run start      Run node dist/index.js
npm run dev        Start from TypeScript for development
npm run test       Run automated tests
npm run lint       Run static checks, if a linter is configured
```

The project must build successfully with a clean install:

```bash
npm install
npm run build
npm test
node dist/index.js
```

Use parameter binding rather than interpolating parameter values into SQL.

## 11. Tests

Add automated tests using a temporary SQLite fixture/database. Tests must not
modify the provided `data/shop.db`.

Use test-driven development (TDD) throughout implementation: first write a
failing test that states the required behaviour, then implement the smallest
change that makes it pass, and finally refactor while keeping the test suite
green. Add tests before the corresponding production implementation for SQL
policy rules, pagination, database access, error mapping, and MCP handlers.
Do not treat tests as a final-only verification step.

Cover at least:

1. Schema discovery returns the four business tables and hides
   `sqlite_sequence`.
2. A normal `SELECT` with bound parameters succeeds and returns structured
   rows.
3. Joins and aggregation needed for the assignment work.
4. Page 1/page 2 behaviour, `hasMore`, default values, maximum page size, and
   invalid page values.
5. Reject every prohibited statement family, multiple statements, and writable
   CTEs.
6. A rejected destructive request leaves the fixture data unchanged.
7. Invalid SQL and a parameter-count error become safe, concise tool errors.
8. Missing database configuration produces a safe startup or tool-access error.
9. Tool input schemas and handlers operate through the MCP server interface,
   not only through isolated helpers.

Include a smoke test or documented manual verification procedure for stdio
startup that confirms no non-protocol logs are written to stdout.

## 12. README requirements

Write a high-quality `README.md` in Russian or English, consistently. It must
contain:

1. Purpose, scope, and the read-only guarantee.
2. Database entities and their relationships.
3. Prerequisites.
4. Installation, configuration, build, development, test, and run commands.
5. `SHOP_DB_PATH` and fallback-path behaviour.
6. A real MCP-client configuration example for stdio transport.
7. A table describing both MCP tools, their inputs, return values, limits, and
   when an agent should use them.
8. Safe SQL examples that answer every supported assignment question, excluding
   the country questions.
9. A pagination example using `page` and `pageSize` with deterministic
   ordering.
10. Safety limitations and examples of rejected destructive SQL.
11. Error-handling behaviour and troubleshooting for missing database,
    build/dependency issues, and SQL errors.

Do not claim Docker support. Do not document or implement specialised tools
for common operations.

## 13. Delivery checklist

Before declaring the work complete:

- inspect the actual `data/shop.db` schema and reconcile any discrepancy with this
  specification without inventing fields;
- implement exactly the two public tools described above;
- verify that stdout is MCP-protocol-only and stderr is used for diagnostics;
- run build and all tests successfully;
- confirm a destructive SQL attempt cannot change the database;
- provide all source, configuration, tests, and README files needed for a fresh
  clone to run the server.

State any unavoidable implementation decision (for example the selected
Node.js LTS version for `node:sqlite`) in the README. Do not make assumptions beyond this
specification or the actual database schema.
