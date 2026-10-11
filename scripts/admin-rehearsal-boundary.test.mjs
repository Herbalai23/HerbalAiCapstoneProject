import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adminRehearsalDatabaseUrl } from './admin-rehearsal-boundary.mjs';

for (const host of ['localhost', '127.0.0.1', '[::1]']) {
  test(`accepts explicit isolated rehearsal at ${host}`, () => {
    const target = `postgresql://test_user:private@${host}:55441/herbalai_test?sslmode=disable`;
    assert.equal(adminRehearsalDatabaseUrl({ HERBALAI_ADMIN_REHEARSAL_DATABASE_URL: target }), target);
  });
}

for (const target of [undefined, '', 'not-a-url',
  'postgresql://user:private@database.neon.tech/herbalai_test',
  'postgresql://user:private@localhost/neondb',
  'postgresql://user:private@localhost/herbalai_test_backup',
  'https://localhost/herbalai_test',
  'postgresql://user:private@localhost/herbalai_test?host=database.neon.tech',
  'postgresql://user:private@localhost/herbalai_test?options=-csearch_path%3Dpublic',
  'postgresql://user:private@localhost/herbalai_test#private']) {
  test(`rejects unsafe rehearsal target ${String(target).split('@').at(-1)}`, () => {
    assert.throws(() => adminRehearsalDatabaseUrl({ HERBALAI_ADMIN_REHEARSAL_DATABASE_URL: target }), error => {
      assert.match(error.message, /hosted targets are forbidden/);
      assert.ok(!error.message.includes('private'));
      return true;
    });
  });
}

test('never falls back to deployed runtime database settings', () => {
  assert.throws(() => adminRehearsalDatabaseUrl({
    DATABASE_URL: 'postgresql://test_user:private@localhost/herbalai_test',
    DIRECT_URL: 'postgresql://test_user:private@localhost/herbalai_test',
  }));
});

test('runner fails closed before importing browser or database dependencies', () => {
  const environment = { ...process.env, DATABASE_URL: 'postgresql://user:private@database.neon.tech/neondb' };
  delete environment.HERBALAI_ADMIN_REHEARSAL_DATABASE_URL;
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./rehearse-admin-crud-and-rag.mjs', import.meta.url))], {
    env: environment,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /hosted targets are forbidden/);
  assert.ok(!result.stderr.includes('private'));
  assert.ok(!result.stderr.includes('ERR_MODULE_NOT_FOUND'));
});
