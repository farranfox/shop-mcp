import { ReadOnlyDatabase } from './database.js';

type TableRow = { name: string; sql: string | null };
type ColumnRow = { cid: number; name: string; type: string; notnull: number; dflt_value: unknown; pk: number };
type ForeignKeyRow = { id: number; seq: number; table: string; from: string; to: string; on_update: string; on_delete: string };
type IndexRow = { seq: number; name: string; unique: number; origin: string; partial: number };

const DESCRIPTIONS: Record<string, string> = {
  customers: 'Store customers and their contact details.',
  products: 'Current product catalogue, prices, categories, and stock.',
  orders: 'Customer orders with date, operational status, and order total.',
  order_items: 'Historical order lines linking orders to products with quantity and unit price.',
};

export function discoverSchema(database: ReadOnlyDatabase): { readOnly: true; notes: string[]; tables: unknown[] } {
  const tables = database.all("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name") as TableRow[];
  return {
    readOnly: true,
    notes: ['This database is read-only.', 'There is no country field; country-based analytics are unavailable.'],
    tables: tables.map((table) => ({
      name: table.name,
      description: DESCRIPTIONS[table.name] ?? 'Business table.',
      columns: database.all(`PRAGMA table_info(${quoteIdentifier(table.name)})`).map((column) => {
        const item = column as ColumnRow;
        return { name: item.name, type: item.type, nullable: item.notnull === 0 && item.pk === 0, default: item.dflt_value, primaryKey: item.pk > 0 };
      }),
      foreignKeys: database.all(`PRAGMA foreign_key_list(${quoteIdentifier(table.name)})`).map((foreignKey) => {
        const item = foreignKey as ForeignKeyRow;
        return { column: item.from, referencesTable: item.table, referencesColumn: item.to, onUpdate: item.on_update, onDelete: item.on_delete };
      }),
      indexes: database.all(`PRAGMA index_list(${quoteIdentifier(table.name)})`).map((index) => {
        const item = index as IndexRow;
        return { name: item.name, unique: item.unique === 1, origin: item.origin, partial: item.partial === 1 };
      }),
    })),
  };
}

function quoteIdentifier(identifier: string): string { return `'${identifier.replaceAll("'", "''")}'`; }
