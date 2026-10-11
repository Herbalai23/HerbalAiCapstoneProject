import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PITAHC_DIRECTORY_URL, PITAHC_DIRECTORY_UNAVAILABLE_CITATION, PITAHC_DIRECTORY_AVAILABILITY, annotatePitahcSourceAvailability } from '../src/content/pitahc-source-availability.js';
import { adminEditDatabaseBoundary } from './helpers/admin-edit-database-boundary.js';

const importMocks = vi.hoisted(() => ({ upsert: vi.fn(), embed: vi.fn() }));
vi.mock('../src/repositories/knowledgebase.repository.js', () => ({ upsertKBBatch: importMocks.upsert }));
vi.mock('../src/services/ai/core/gemini-service.js', () => ({ generateEmbedding: importMocks.embed }));

import { ImportKnowledgeBaseService } from '../src/services/ai/knowledge-base/import-knowledge-base-service.js';

const migration = await readFile(new URL('../prisma/migrations/20261012020000_note_unavailable_pitahc_directory/migration.sql', import.meta.url), 'utf8');
const connectionUrl = process.env['HERBALAI_TEST_DATABASE_URL'];
const enabled = adminEditDatabaseBoundary(connectionUrl, process.env['DATABASE_URL'], Boolean(process.env['CI']));
let database: pg.Client;

describe('PITAHC source availability seed', () => {
  it('keeps the original URL and dated availability reason in the citation', () => {
    expect(PITAHC_DIRECTORY_UNAVAILABLE_CITATION).toContain(PITAHC_DIRECTORY_URL);
    expect(PITAHC_DIRECTORY_UNAVAILABLE_CITATION).toContain('HTTP 404 observed on 12 October 2026');
    expect(PITAHC_DIRECTORY_UNAVAILABLE_CITATION).toContain('current online access is not verified');
  });

  it('does not recreate the broken clickable URL during seeding', async () => {
    const seed = await readFile(new URL('../prisma/seed.ts', import.meta.url), 'utf8');
    expect(seed).toContain('citation: PITAHC_DIRECTORY_UNAVAILABLE_CITATION');
    expect(seed).toMatch(/title: "PITAHC Directory of Herbs",[\s\S]*?url: null,[\s\S]*?accessedAt: null,/);
    expect(seed).not.toContain(`url: "${PITAHC_DIRECTORY_URL}"`);
  });

  it('annotates only the exact KB source without mutating historical provenance', () => {
    const source = { url: PITAHC_DIRECTORY_URL, title: 'Historical directory', accessedAt: '2026-09-16', citation: 'Existing reference', section: 'Lagundi' };
    const unrelated = { url: 'https://example.invalid/source', title: 'Other source' };
    const metadata = { jurisdiction: 'Philippines', sources: [source, unrelated, null, 'legacy'], reviewStatus: 'SOURCE_VERIFIED' };
    const before = structuredClone(metadata);
    const annotated = annotatePitahcSourceAvailability(metadata);
    expect(annotated).toEqual({ ...metadata, sources: [{ ...source, availability: PITAHC_DIRECTORY_AVAILABILITY }, unrelated, null, 'legacy'] });
    expect(metadata).toEqual(before);
    expect(annotatePitahcSourceAvailability(annotated)).toEqual(annotated);
  });

  it('preserves missing or malformed source collections', () => {
    expect(annotatePitahcSourceAvailability(undefined)).toBeUndefined();
    expect(annotatePitahcSourceAvailability({ sources: {} })).toEqual({ sources: {} });
    expect(annotatePitahcSourceAvailability({ sources: [] })).toEqual({ sources: [] });
  });

  it('retains availability metadata through the admin knowledge import without changing the answer', async () => {
    importMocks.embed.mockResolvedValue([0.1, 0.2]);
    importMocks.upsert.mockResolvedValue([{ id: 'TEST-source-fact', created: true }]);
    const metadata = {
      jurisdiction: 'Philippines',
      sources: [{ title: 'Historical directory', publisher: 'PITAHC', url: PITAHC_DIRECTORY_URL, accessedAt: '2026-09-16' }],
    };
    const result = await ImportKnowledgeBaseService([
      { question: 'TEST historical source question', answer: 'TEST unchanged historical answer.', metadata },
    ], 'TEST-admin');
    expect(result).toMatchObject({ code: 200, data: { total: 1, created: 1, updated: 0 } });
    expect(importMocks.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ answer: 'TEST unchanged historical answer.', metadata: annotatePitahcSourceAvailability(metadata) }),
    ], 'TEST-admin');
    expect(metadata.sources[0]).not.toHaveProperty('availability');
  });
});

describe.skipIf(!enabled)('PITAHC source availability migration on isolated PostgreSQL', () => {
  beforeAll(async () => {
    database = new pg.Client({ connectionString: connectionUrl });
    await database.connect();
    await database.query('BEGIN');
    await database.query('SET LOCAL search_path TO pg_temp, public');
    await database.query('CREATE TEMP TABLE "HerbSource" (id INTEGER PRIMARY KEY, "herbId" TEXT NOT NULL, title TEXT NOT NULL, publisher TEXT, url TEXT, citation TEXT, supports TEXT[] NOT NULL, "accessedAt" TIMESTAMP) ON COMMIT DROP');
    await database.query('CREATE TEMP TABLE "KnowledgeBase" (id TEXT PRIMARY KEY, answer TEXT NOT NULL, metadata JSONB, "updatedAt" TIMESTAMP) ON COMMIT DROP');
  });

  beforeEach(async () => {
    await database.query('TRUNCATE pg_temp."HerbSource"');
    await database.query('TRUNCATE pg_temp."KnowledgeBase"');
    await database.query('INSERT INTO pg_temp."HerbSource" VALUES (1, $1, $2, $3, $4, $5, $6, $7)', [
      'TEST-Lagundi', 'PITAHC Directory of Herbs', 'PITAHC', PITAHC_DIRECTORY_URL,
      'Existing historical reference.', ['medicinalUses', 'preparationMethod', 'dosage'], '2026-09-16',
    ]);
  });

  afterAll(async () => {
    if (!database) return;
    try { await database.query('ROLLBACK'); } finally { await database.end(); }
  });

  it('disables only the unavailable link while preserving provenance and support fields', async () => {
    const before = (await database.query('SELECT * FROM pg_temp."HerbSource" WHERE id=1')).rows[0];
    await database.query(migration);
    const after = (await database.query('SELECT * FROM pg_temp."HerbSource" WHERE id=1')).rows[0];
    expect(after).toEqual({ ...before, url: null, citation: `Existing historical reference.\n${PITAHC_DIRECTORY_UNAVAILABLE_CITATION}` });
  });

  it('preserves unrelated sources and unreviewed URL variants', async () => {
    const urls = ['https://pitahc.gov.ph/', `${PITAHC_DIRECTORY_URL}?other=1`, 'https://example.invalid/herbs-directory/'];
    for (const [index, url] of urls.entries()) {
      await database.query('INSERT INTO pg_temp."HerbSource" (id, "herbId", title, url, supports) VALUES ($1, $2, $3, $4, $5)', [index + 2, 'TEST-other', 'Other reference', url, ['warnings']]);
    }
    const before = (await database.query('SELECT * FROM pg_temp."HerbSource" WHERE id>1 ORDER BY id')).rows;
    await database.query(migration);
    expect((await database.query('SELECT * FROM pg_temp."HerbSource" WHERE id>1 ORDER BY id')).rows).toEqual(before);
  });

  it('is idempotent and does not duplicate availability notes', async () => {
    await database.query(migration);
    const before = (await database.query('SELECT * FROM pg_temp."HerbSource" ORDER BY id')).rows;
    await database.query(migration);
    expect((await database.query('SELECT * FROM pg_temp."HerbSource" ORDER BY id')).rows).toEqual(before);
  });

  it('handles a missing historical citation without losing the original URL', async () => {
    await database.query('UPDATE pg_temp."HerbSource" SET citation=NULL WHERE id=1');
    await database.query(migration);
    expect((await database.query('SELECT url, citation FROM pg_temp."HerbSource" WHERE id=1')).rows[0]).toEqual({ url: null, citation: PITAHC_DIRECTORY_UNAVAILABLE_CITATION });
  });

  it('annotates KB metadata while preserving answer, timestamps, source ordering and existing citation', async () => {
    const source = { title: 'PITAHC', url: PITAHC_DIRECTORY_URL, accessedAt: '2026-09-16', citation: 'Existing citation' };
    const unrelated = { title: 'Other', url: 'https://example.invalid/source' };
    const metadata = { jurisdiction: 'Philippines', sources: [unrelated, source], limitations: ['Historical reference only'] };
    await database.query('INSERT INTO pg_temp."KnowledgeBase" VALUES ($1, $2, $3, $4)', ['TEST-fact', 'TEST unchanged answer', metadata, '2026-09-16']);
    const before = (await database.query('SELECT * FROM pg_temp."KnowledgeBase"')).rows[0];
    await database.query(migration);
    const after = (await database.query('SELECT * FROM pg_temp."KnowledgeBase"')).rows[0];
    expect(after).toEqual({ ...before, metadata: annotatePitahcSourceAvailability(metadata) });
    await database.query(migration);
    expect((await database.query('SELECT * FROM pg_temp."KnowledgeBase"')).rows[0]).toEqual(after);
  });

  it('does not modify unrelated or malformed KB metadata', async () => {
    const records = [null, { sources: {} }, { sources: [] }, { sources: [{ url: 'https://example.invalid/source' }] }];
    for (const [index, metadata] of records.entries()) {
      await database.query('INSERT INTO pg_temp."KnowledgeBase" VALUES ($1, $2, $3, $4)', [`TEST-${index}`, 'TEST unchanged answer', metadata, '2026-09-16']);
    }
    const before = (await database.query('SELECT * FROM pg_temp."KnowledgeBase" ORDER BY id')).rows;
    await database.query(migration);
    expect((await database.query('SELECT * FROM pg_temp."KnowledgeBase" ORDER BY id')).rows).toEqual(before);
  });
});
