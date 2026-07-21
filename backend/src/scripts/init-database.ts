import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prismaDirectory = path.resolve(__dirname, '../../prisma');
const migrationPath = path.join(
  prismaDirectory,
  'migrations',
  '20260721000000_multi_tenant_foundation',
  'migration.sql'
);
const localDatabasePath = path.join(prismaDirectory, 'dev.db');
const databaseUrl = process.env.DATABASE_URL || `file:${localDatabasePath}`;

const client = createClient({
  url: databaseUrl,
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});

try {
  const existing = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'InventoryItem'"
  );

  if (existing.rows.length > 0) {
    const columns = await client.execute('PRAGMA table_info("InventoryItem")');
    const hasOrganizationId = columns.rows.some((row) => row.name === 'organizationId');
    if (!hasOrganizationId) {
      throw new Error(
        'The existing database uses the old single-store schema. Back it up, remove backend/prisma/dev.db, and run npm run db:init again.'
      );
    }

    console.log(`Database already initialized: ${databaseUrl}`);
  } else {
    const migration = await fs.readFile(migrationPath, 'utf8');
    await client.executeMultiple(migration);
    console.log(`Initialized multi-tenant prototype database: ${databaseUrl}`);
  }
} finally {
  client.close();
}
