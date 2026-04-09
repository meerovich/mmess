import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  // Use a separate client for migrations (migrate closes it when done)
  const migrationClient = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(migrationClient);

  const migrationsFolder = path.resolve(__dirname, '../../drizzle');

  try {
    await migrate(db, { migrationsFolder });
    console.log('Database migrations complete');
  } finally {
    await migrationClient.end();
  }
}
