const { randomBytes } = require('node:crypto');
const { chmod, readFile, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { hash } = require('@node-rs/argon2');
const { Client } = require('pg');

async function main() {
const envPath = path.join(process.cwd(), '.env');
const nextEnvPath = `${envPath}.next`;
const source = await readFile(envPath, 'utf8');
const values = new Map(
  source
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

const required = (key) => {
  const value = values.get(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
};
const replace = (text, key, value) => {
  const line = new RegExp(`^${key}=.*$`, 'm');
  if (!line.test(text)) throw new Error(`${key} is missing from .env`);
  return text.replace(line, `${key}=${value}`);
};

const databaseUsername = required('DB_USERNAME');
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(databaseUsername)) {
  throw new Error('DB_USERNAME contains unsupported characters');
}

const next = {
  accessSecret: randomBytes(48).toString('hex'),
  refreshSecret: randomBytes(48).toString('hex'),
  adminPassword: randomBytes(32).toString('base64url'),
  databasePassword: randomBytes(32).toString('base64url'),
};
const passwordHash = await hash(next.adminPassword);
let nextSource = source;
nextSource = replace(nextSource, 'JWT_ACCESS_SECRET', next.accessSecret);
nextSource = replace(nextSource, 'JWT_REFRESH_SECRET', next.refreshSecret);
nextSource = replace(
  nextSource,
  'SEED_SUPER_ADMIN_PASSWORD',
  next.adminPassword,
);
nextSource = replace(nextSource, 'DB_PASSWORD', next.databasePassword);
await writeFile(nextEnvPath, nextSource, { mode: 0o600 });

const client = new Client({
  host: required('DB_HOST'),
  port: Number.parseInt(required('DB_PORT'), 10),
  user: databaseUsername,
  password: required('DB_PASSWORD'),
  database: required('DB_DATABASE'),
});

await client.connect();
try {
  await client.query('BEGIN');
  const admin = await client.query(
    'UPDATE admins SET password_hash = $1, updated_at = now() WHERE login_id = $2 RETURNING id',
    [passwordHash, required('SEED_SUPER_ADMIN_LOGIN_ID')],
  );
  if (admin.rowCount !== 1) {
    throw new Error('Expected exactly one seeded super administrator');
  }
  const revoked = await client.query('DELETE FROM refresh_tokens');
  await client.query(
    `ALTER ROLE "${databaseUsername}" WITH PASSWORD '${next.databasePassword}'`,
  );
  await client.query('COMMIT');
  await rename(nextEnvPath, envPath);
  await chmod(envPath, 0o600);
  console.log(
    JSON.stringify({
      rotated: true,
      administratorsUpdated: admin.rowCount,
      refreshTokensRevoked: revoked.rowCount,
    }),
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Secret rotation failed');
  process.exitCode = 1;
});
