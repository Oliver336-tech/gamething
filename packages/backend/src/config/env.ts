const coerceNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
};

const requireString = (value: string | undefined, name: string, minLength = 1): string => {
  if (!value || value.length < minLength) {
    throw new Error(`${name} is required and must be at least ${minLength} characters long`);
  }
  return value;
};

const env = {
  PORT: coerceNumber(process.env.PORT, 3000),
  DATABASE_URL: requireString(process.env.DATABASE_URL ?? 'file:./local.db', 'DATABASE_URL'),
  JWT_SECRET: requireString(process.env.JWT_SECRET, 'JWT_SECRET', 16),
  REFRESH_TOKEN_SECRET: requireString(process.env.REFRESH_TOKEN_SECRET, 'REFRESH_TOKEN_SECRET', 16),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ACCESS_TOKEN_TTL_MINUTES: coerceNumber(process.env.ACCESS_TOKEN_TTL_MINUTES, 15),
  REFRESH_TOKEN_TTL_DAYS: coerceNumber(process.env.REFRESH_TOKEN_TTL_DAYS, 7),
};

export default env;
