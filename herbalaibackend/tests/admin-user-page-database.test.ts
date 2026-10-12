import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminEditDatabaseBoundary } from './helpers/admin-edit-database-boundary.js';
const state = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock('../src/lib/prisma.js', () => ({ get prisma() { return state.client; } }));
import { adminUserQuerySchema } from '../src/lib/admin-user-query.js';
import { findAdminUserPage } from '../src/repositories/admin-user.repository.js';

const enabled = adminEditDatabaseBoundary(process.env['HERBALAI_TEST_DATABASE_URL'], process.env['DATABASE_URL'], process.env['CI'] === 'true');
const schema = `qa_users_page_${randomUUID().replaceAll('-', '')}`;
let pool: pg.Pool | undefined;
let schemaCreated = false;

describe.skipIf(!enabled)('Isolated administrator global user filters', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env['HERBALAI_TEST_DATABASE_URL'], options: `-c search_path=${schema}` });
    const identity = (await pool.query('SELECT current_database() AS database, host(inet_server_addr()) AS host')).rows[0];
    expect(identity.database).toBe('herbalai_test');
    expect(['127.0.0.1', '::1']).toContain(identity.host);
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await pool.query(`CREATE TYPE "${schema}"."Role" AS ENUM ('admin', 'contributor')`);
    await pool.query(`CREATE TABLE "${schema}"."User" (LIKE public."User" INCLUDING ALL)`);
    await pool.query(`ALTER TABLE "${schema}"."User" ALTER COLUMN role DROP DEFAULT`);
    await pool.query(`ALTER TABLE "${schema}"."User" ALTER COLUMN role TYPE "${schema}"."Role" USING role::text::"${schema}"."Role"`);
    await pool.query(`ALTER TABLE "${schema}"."User" ALTER COLUMN role SET DEFAULT 'contributor'`);
    state.client = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  });

  afterAll(async () => {
    try {
      if (state.client) await state.client.$disconnect();
    } finally {
      if (pool) {
        try {
          if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
        } finally {
          await pool.end();
        }
      }
    }
  });

  it('filters 32 accounts before pagination, clamps pages, handles ban expiry and cleans up', async () => {
    const prisma = state.client!;
    const prefix = `users-qa-${randomUUID()}`;
    const now = Date.now();
    const ids = Array.from({ length: 32 }, (_, index) => `${prefix}-${index}`);
    const before = await prisma.user.count();
    const query = (filters: Record<string, string> = {}) => findAdminUserPage(adminUserQuerySchema.parse({ search: prefix, ...filters }));
    try {
      await prisma.user.createMany({ data: ids.map((id, index) => ({
        id, username: index === 1 ? `${id}_100%` : id, email: `${id}@example.invalid`,
        name: index === 0 ? 'Oldest Needle Account' : 'Isolated user fixture', password: 'disabled-test-only',
        joined: new Date(now - (32 - index) * 1000), role: index === 28 || index === 29 ? 'admin' : 'contributor',
        isBanned: index === 27 || index >= 29,
        banExpiresAt: index === 27 || index === 31 ? new Date(now - 60_000) : index === 30 ? new Date(now + 3_600_000) : null,
      })) });
      const first = await query();
      expect(first.total).toBe(32);
      expect(first.allTotal).toBe(before + 32);
      expect(first.users).toHaveLength(25);
      expect(first.users.some(account => account.id === ids[0])).toBe(false);
      const second = await query({ page: '2' });
      expect(second.users).toHaveLength(7);
      expect(second.users.some(account => account.id === ids[0])).toBe(true);
      expect(new Set([...first.users, ...second.users].map(account => account.id)).size).toBe(32);
      const name = await query({ search: 'oLDeSt nEEdLe', page: '2' });
      expect(name.page).toBe(1);
      expect(name.total).toBe(1);
      expect(name.users[0]?.id).toBe(ids[0]);
      expect((await query({ search: `${ids[0]}@example.invalid`.toUpperCase() })).users[0]?.id).toBe(ids[0]);
      expect((await query({ search: `${ids[1]}_100%` })).users[0]?.id).toBe(ids[1]);
      expect((await query({ search: '%' })).total).toBe(1);
      expect((await query({ search: '_' })).total).toBe(1);
      const banned = await query({ status: 'BANNED', page: '10000' });
      expect(banned.page).toBe(1);
      expect(banned.total).toBe(2);
      expect(banned.users.every(account => account.isBanned)).toBe(true);
      expect((await query({ status: 'ACTIVE' })).total).toBe(30);
      expect((await query({ search: ids[27]! })).users[0]?.isBanned).toBe(false);
      expect((await query({ role: 'admin' })).total).toBe(2);
      const activeAdmin = await query({ role: 'admin', status: 'ACTIVE' });
      expect(activeAdmin.total).toBe(1);
      expect(activeAdmin.users[0]?.id).toBe(ids[28]);
      expect((await query({ role: 'contributor', status: 'BANNED' })).users[0]?.id).toBe(ids[30]);
      const absent = await query({ search: `${prefix}-absent`, page: '2' });
      expect(absent).toMatchObject({ total: 0, page: 1, users: [], allTotal: before + 32 });
      const capped = await query({ limit: '9999' });
      expect(capped.limit).toBe(100);
      for (const account of capped.users) {
        expect(Object.keys(account).sort()).toEqual(['id', 'username', 'email', 'name', 'avatar', 'role', 'joined',
          'isBanned', 'banReason', 'banExpiresAt', 'emailVerified'].sort());
      }
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    expect(await prisma.user.count()).toBe(before);
  });
});
