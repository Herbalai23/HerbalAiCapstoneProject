import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminEditDatabaseBoundary } from './helpers/admin-edit-database-boundary.js';
import { knowledgeImportServerBoundary } from './helpers/knowledge-import-server-boundary.js';

const state = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock('../src/lib/prisma.js', () => ({ get prisma() { return state.client; } }));
import { findKBPage } from '../src/repositories/knowledgebase.repository.js';

const connectionUrl = process.env['HERBALAI_TEST_DATABASE_URL'];
const enabled = adminEditDatabaseBoundary(connectionUrl, process.env['DATABASE_URL'], Boolean(process.env['CI']));
const schema = `qa_kb_page_${randomUUID().replaceAll('-', '')}`;
let pool: pg.Pool | undefined;
let schemaCreated = false;

describe.skipIf(!enabled)('knowledge pagination on isolated PostgreSQL', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: connectionUrl, options: `-c search_path=${schema}` });
    const target = (await pool.query('SELECT current_database() AS database, inet_server_addr()::text AS host, inet_server_port() AS port, current_user AS "user"')).rows[0];
    knowledgeImportServerBoundary(target, connectionUrl!, process.env['CI'] === 'true');
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await pool.query('CREATE TABLE "KnowledgeBase" (id TEXT PRIMARY KEY, question TEXT NOT NULL UNIQUE, answer TEXT NOT NULL, category TEXT, tags TEXT[] NOT NULL, metadata JSONB, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW())');
    await pool.query(`INSERT INTO "KnowledgeBase" (id, question, answer, category, tags, metadata, "isActive", "createdAt")
      SELECT 'TEST-' || fixture, 'TEST ONLY question ' || fixture,
        CASE WHEN fixture >= 39 THEN 'TEST ONLY medicine coordination' ELSE 'TEST ONLY general information' END,
        CASE WHEN fixture >= 39 THEN 'coordinated-care' WHEN fixture = 38 THEN '' ELSE 'herbal-safety' END,
        ARRAY['test'], '{"fixture":true}'::jsonb, fixture <> 40,
        TIMESTAMP '2026-01-01' - fixture * INTERVAL '1 minute'
      FROM generate_series(1, 40) AS fixture`);
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

  it('includes categories outside the first server page', async () => {
    const result = await findKBPage(1, 25, '');
    expect(result).toMatchObject({ total: 40, page: 1, categories: ['coordinated-care', 'herbal-safety'] });
    expect(result.items).toHaveLength(25);
    expect(result.items.every(record => record.category === 'herbal-safety')).toBe(true);
  });

  it('returns the remaining records with stable ordering on page two', async () => {
    const result = await findKBPage(2, 25, '');
    expect(result).toMatchObject({ total: 40, page: 2 });
    expect(result.items).toHaveLength(15);
    expect(result.items[0]?.id).toBe('TEST-26');
    expect(result.items[14]?.id).toBe('TEST-40');
  });

  it.each([
    { status: 'ACTIVE' as const, id: 'TEST-39' },
    { status: 'INACTIVE' as const, id: 'TEST-40' },
  ])('filters category and $status before counting and clamping', async ({ status, id }) => {
    const result = await findKBPage(2, 25, '', { category: 'coordinated-care', status });
    expect(result).toMatchObject({ total: 1, page: 1, categories: ['coordinated-care', 'herbal-safety'] });
    expect(result.items.map(record => record.id)).toEqual([id]);
  });

  it('combines case-insensitive search with category and status', async () => {
    const result = await findKBPage(1, 25, 'MEDICINE', { category: 'coordinated-care', status: 'ACTIVE' });
    expect(result.total).toBe(1);
    expect(result.items.map(record => record.id)).toEqual(['TEST-39']);
  });

  it('keeps global categories for empty searches and never writes fixture records', async () => {
    const result = await findKBPage(99, 25, 'absent test phrase');
    expect(result).toMatchObject({ total: 0, page: 1, items: [], categories: ['coordinated-care', 'herbal-safety'] });
    expect((await pool!.query('SELECT COUNT(*)::int AS count FROM "KnowledgeBase"')).rows[0].count).toBe(40);
  });
});
