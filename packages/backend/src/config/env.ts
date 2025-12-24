import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().min(0).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  REFRESH_TOKEN_SECRET: z.string().min(16, 'REFRESH_TOKEN_SECRET must be at least 16 characters'),
  ADMIN_EMAIL: z.string().email().optional(),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(7),
});

const env = envSchema.parse(process.env);

export default env;
