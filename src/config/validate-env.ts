/**
 * 앱 기동 시점에 치명적인 설정 누락을 즉시 잡아냅니다.
 * 런타임 중간에 "시크릿이 비어 있어서 토큰이 검증되지 않는" 상황을 만들지 않기 위함입니다.
 */
function envString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '';
}

function isInternalDatabaseHost(value: unknown): boolean {
  const host = envString(value).trim().toLowerCase();
  if (
    host.endsWith('-postgres') ||
    host.endsWith('.svc') ||
    host.endsWith('.svc.cluster.local')
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const match = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  return match !== null && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];
  const isProduction = config.NODE_ENV === 'production';

  const required = [
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_DATABASE',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  for (const key of required) {
    if (!config[key]) errors.push(`${key} 환경변수가 비어 있습니다.`);
  }

  const accessSecret = envString(config.JWT_ACCESS_SECRET);
  const refreshSecret = envString(config.JWT_REFRESH_SECRET);
  const seedLoginId = envString(config.SEED_SUPER_ADMIN_LOGIN_ID);
  const seedPassword = envString(config.SEED_SUPER_ADMIN_PASSWORD);

  if (accessSecret && accessSecret.length < 32) {
    errors.push('JWT_ACCESS_SECRET 은 32자 이상이어야 합니다.');
  }
  if (refreshSecret && refreshSecret.length < 32) {
    errors.push('JWT_REFRESH_SECRET 은 32자 이상이어야 합니다.');
  }
  if (accessSecret && accessSecret === refreshSecret) {
    errors.push(
      'JWT_ACCESS_SECRET 과 JWT_REFRESH_SECRET 은 서로 달라야 합니다.',
    );
  }

  if (isProduction) {
    if (envString(config.DB_SYNCHRONIZE).toLowerCase() === 'true') {
      errors.push('운영 환경에서는 DB_SYNCHRONIZE 를 true 로 둘 수 없습니다.');
    }
    if (envString(config.COOKIE_SECURE).toLowerCase() !== 'true') {
      errors.push('운영 환경에서는 COOKIE_SECURE 가 true 여야 합니다.');
    }
    const databaseSsl = envString(config.DB_SSL).toLowerCase() === 'true';
    const allowInsecureInternalDatabase =
      envString(config.ALLOW_INSECURE_INTERNAL_DB).toLowerCase() === 'true';
    if (
      !databaseSsl &&
      (!allowInsecureInternalDatabase ||
        !isInternalDatabaseHost(config.DB_HOST))
    ) {
      errors.push(
        allowInsecureInternalDatabase
          ? 'TLS 예외는 검증된 내부 데이터베이스 호스트에만 사용할 수 있습니다.'
          : '운영 환경에서는 DB_SSL=true 로 데이터베이스 TLS를 사용해야 합니다.',
      );
    }
    if (
      databaseSsl &&
      (envString(config.DB_SSL_REJECT_UNAUTHORIZED) || 'true').toLowerCase() !==
        'true'
    ) {
      errors.push(
        '운영 DB TLS는 DB_SSL_REJECT_UNAUTHORIZED=true 로 인증서를 검증해야 합니다.',
      );
    }
    if (
      accessSecret.startsWith('change-me') ||
      refreshSecret.startsWith('change-me')
    ) {
      errors.push('운영 환경에서 예시 시크릿을 그대로 사용할 수 없습니다.');
    }
    if (!config.CORS_ORIGINS) {
      errors.push('운영 환경에서는 CORS_ORIGINS 를 명시해야 합니다.');
    }
    const allowProductionSeed =
      envString(config.ALLOW_PRODUCTION_ADMIN_SEED).toLowerCase() === 'true';
    if ((seedLoginId || seedPassword) && !allowProductionSeed) {
      errors.push(
        '운영 관리자 시딩에는 ALLOW_PRODUCTION_ADMIN_SEED=true 를 명시해야 합니다.',
      );
    }
    if (
      allowProductionSeed &&
      (seedLoginId.toLowerCase() === 'admin' ||
        seedPassword.startsWith('ChangeMe'))
    ) {
      errors.push('운영 환경에서 예시 관리자 자격증명을 사용할 수 없습니다.');
    }
  }

  if (errors.length > 0) {
    throw new Error(`환경변수 검증 실패:\n - ${errors.join('\n - ')}`);
  }

  return config;
}
