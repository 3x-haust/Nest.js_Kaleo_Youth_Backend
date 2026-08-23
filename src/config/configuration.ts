const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: toInt(process.env.PORT, 4000),
  trustProxyHops: toInt(process.env.TRUST_PROXY_HOPS, 0),
  corsOrigins: toList(process.env.CORS_ORIGINS),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000',

  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: toInt(process.env.DB_PORT, 5433),
    username: process.env.DB_USERNAME ?? 'kaleo',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'kaleo_youth',
    synchronize: toBool(process.env.DB_SYNCHRONIZE, false),
    ssl: toBool(process.env.DB_SSL, false),
    sslRejectUnauthorized: toBool(process.env.DB_SSL_REJECT_UNAUTHORIZED, true),
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '14d',
  },

  cookie: {
    secure: toBool(process.env.COOKIE_SECURE, false),
    domain: process.env.COOKIE_DOMAIN || undefined,
  },

  seed: {
    loginId: process.env.SEED_SUPER_ADMIN_LOGIN_ID ?? '',
    password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? '',
    name: process.env.SEED_SUPER_ADMIN_NAME ?? '최고관리자',
  },

  upload: {
    dir: process.env.UPLOAD_DIR ?? './uploads',
  },

  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY ?? '',
    timeoutMs: toInt(process.env.YOUTUBE_API_TIMEOUT_MS, 5000),
    sermonChannel: process.env.YOUTUBE_SERMON_CHANNEL?.trim() ?? '',
    sermonPreacherName:
      process.env.YOUTUBE_SERMON_PREACHER_NAME?.trim() || '박정인 목사',
  },
});

export type AppConfig = ReturnType<typeof configuration>;
