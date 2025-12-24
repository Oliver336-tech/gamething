import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

process.env.DATABASE_URL = 'file:./packages/backend/test.db';
process.env.JWT_SECRET = 'test-jwt-secret-123456789';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-123456789';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ACCESS_TOKEN_TTL_MINUTES = '5';
process.env.REFRESH_TOKEN_TTL_DAYS = '1';

const { prisma, closePrisma } = await import('../db/client');
const { createBackendApp } = await import('../app');
const { MatchmakingService } = await import('../services/matchmaking');
const { ProgressionService } = await import('../services/progression');

const progression = new ProgressionService();
const matchmaking = new MatchmakingService(progression);
const { app } = createBackendApp({ matchmaking, progression });

const runMigrations = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Role" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL UNIQUE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL UNIQUE,
      "passwordHash" TEXT NOT NULL,
      "roleId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Session" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "refreshTokenHash" TEXT NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
};

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
});

afterAll(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await closePrisma();
});

describe('role assignment', () => {
  it('assigns admin role when email matches configured admin', async () => {
    const response = await request(app)
      .post('/auth/signup')
      .send({ email: process.env.ADMIN_EMAIL, password: 'password123' });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('admin');

    const user = await prisma.user.findUnique({ where: { email: process.env.ADMIN_EMAIL! }, include: { role: true } });
    expect(user?.role.name).toBe('admin');
  });

  it('assigns user role for non-admin emails', async () => {
    const response = await request(app)
      .post('/auth/signup')
      .send({ email: 'player@example.com', password: 'password123' });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('user');

    const user = await prisma.user.findUnique({ where: { email: 'player@example.com' }, include: { role: true } });
    expect(user?.role.name).toBe('user');
  });
});
