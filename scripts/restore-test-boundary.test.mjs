import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { restoreTestDatabaseUrl } from './restore-test-boundary.mjs';

for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
  test(`accepts explicit isolated target at ${host}`, () => {
    const target = `postgresql://test_user:test_password@${host}:55441/herbalai_test?sslmode=disable`;
    assert.equal(restoreTestDatabaseUrl({ HERBALAI_RESTORE_TEST_DATABASE_URL: target }), target);
  });
}

for (const target of [undefined, '', 'not-a-url',
  'postgresql://user:private@database.neon.tech/herbalai_test',
  'postgresql://user:private@localhost/neondb',
  'postgresql://user:private@localhost/herbalai_test_backup',
  'https://localhost/herbalai_test',
  'postgresql://user:private@localhost/herbalai_test?host=database.neon.tech',
  'postgresql://user:private@localhost/herbalai_test?options=-csearch_path%3Dpublic',
  'postgresql://user:private@localhost/herbalai_test#secret']) {
  test(`rejects unsafe target ${target ? new URL(target, 'https://invalid.local').hostname : 'missing'}`, () => {
    assert.throws(() => restoreTestDatabaseUrl({ HERBALAI_RESTORE_TEST_DATABASE_URL: target }), error => {
      assert.match(error.message, /production targets are forbidden/);
      assert.ok(!error.message.includes('private'));
      return true;
    });
  });
}

test('never falls back to runtime DATABASE_URL or DIRECT_URL', () => {
  assert.throws(() => restoreTestDatabaseUrl({
    DATABASE_URL: 'postgresql://test_user:test_password@localhost/herbalai_test',
    DIRECT_URL: 'postgresql://test_user:test_password@localhost/herbalai_test',
  }));
});

test('rejects production even with an isolated target', () => {
  assert.throws(() => restoreTestDatabaseUrl({
    NODE_ENV: 'production',
    HERBALAI_RESTORE_TEST_DATABASE_URL: 'postgresql://test_user:test_password@localhost/herbalai_test',
  }));
});

test('entry point refuses missing dedicated target before importing database dependencies', () => {
  const environment = { ...process.env, DATABASE_URL: 'postgresql://user:private@database.neon.tech/neondb' };
  delete environment.HERBALAI_RESTORE_TEST_DATABASE_URL;
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-database-backup-restore.mjs', import.meta.url))], {
    env: environment, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production targets are forbidden/);
  assert.ok(!result.stderr.includes('private'));
});
