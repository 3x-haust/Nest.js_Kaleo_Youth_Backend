import { validateEnv } from './validate-env';

const productionConfig = {
  NODE_ENV: 'production',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'kaleo',
  DB_DATABASE: 'kaleo_youth',
  DB_SYNCHRONIZE: 'false',
  DB_SSL: 'true',
  DB_SSL_REJECT_UNAUTHORIZED: 'true',
  COOKIE_SECURE: 'true',
  CORS_ORIGINS: 'https://example.com',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv production admin seed safeguards', () => {
  it('allows production startup without seed credentials', () => {
    expect(validateEnv({ ...productionConfig })).toEqual(productionConfig);
  });

  it('rejects production seed credentials unless explicitly enabled', () => {
    expect(() =>
      validateEnv({
        ...productionConfig,
        SEED_SUPER_ADMIN_LOGIN_ID: 'owner',
        SEED_SUPER_ADMIN_PASSWORD: 'Unique!Password2026',
      }),
    ).toThrow('ALLOW_PRODUCTION_ADMIN_SEED');
  });

  it('rejects documented example credentials even when seeding is enabled', () => {
    expect(() =>
      validateEnv({
        ...productionConfig,
        ALLOW_PRODUCTION_ADMIN_SEED: 'true',
        SEED_SUPER_ADMIN_LOGIN_ID: 'admin',
        SEED_SUPER_ADMIN_PASSWORD: 'ChangeMe!2026',
      }),
    ).toThrow('예시 관리자 자격증명');
  });

  it('rejects production database TLS without certificate verification', () => {
    expect(() =>
      validateEnv({
        ...productionConfig,
        DB_SSL: 'true',
        DB_SSL_REJECT_UNAUTHORIZED: 'false',
      }),
    ).toThrow('DB_SSL_REJECT_UNAUTHORIZED');
  });

  it('rejects production startup with database TLS disabled', () => {
    expect(() =>
      validateEnv({
        ...productionConfig,
        DB_SSL: 'false',
      }),
    ).toThrow('DB_SSL=true');
  });

  it('allows an explicit TLS exception for a managed internal database host', () => {
    const config = {
      ...productionConfig,
      DB_HOST: 'kaleo-youth-api-postgres',
      DB_SSL: 'false',
      ALLOW_INSECURE_INTERNAL_DB: 'true',
    };

    expect(validateEnv(config)).toEqual(config);
  });

  it('rejects the TLS exception when the database host is public', () => {
    expect(() =>
      validateEnv({
        ...productionConfig,
        DB_HOST: 'postgres.example.com',
        DB_SSL: 'false',
        ALLOW_INSECURE_INTERNAL_DB: 'true',
      }),
    ).toThrow('내부 데이터베이스');
  });
});
