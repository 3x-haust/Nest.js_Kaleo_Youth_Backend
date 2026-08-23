const { Client } = require('pg');
const dotenv = require('dotenv');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

dotenv.config();

const sourceDatabase =
  process.env.PLAYWRIGHT_SOURCE_DB_DATABASE || process.env.DB_DATABASE || 'kaleo_youth';
const targetDatabase =
  process.env.PLAYWRIGHT_DB_DATABASE || 'kaleo_youth_playwright';
const identifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

if (!identifier.test(sourceDatabase) || !identifier.test(targetDatabase)) {
  throw new Error('Playwright database names must be simple PostgreSQL identifiers.');
}
if (sourceDatabase === targetDatabase) {
  throw new Error('Playwright source and target databases must be different.');
}

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

async function prepare() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USERNAME || 'kaleo',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres',
  });

  await client.connect();
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [targetDatabase],
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(targetDatabase)}`);
    await client.query(
      `CREATE DATABASE ${quoteIdentifier(targetDatabase)} WITH TEMPLATE ${quoteIdentifier(sourceDatabase)}`,
    );
    process.stdout.write(`Prepared isolated Playwright database: ${targetDatabase}\n`);
  } finally {
    await client.end();
  }

  execFileSync(process.execPath, [path.join(__dirname, 'seed-demo.cjs')], {
    env: { ...process.env, DB_DATABASE: targetDatabase },
    stdio: 'inherit',
  });
  process.stdout.write(`Seeded full Playwright visual dataset: ${targetDatabase}\n`);
}

prepare().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
