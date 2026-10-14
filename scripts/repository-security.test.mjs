import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { privateRepositoryPath, inspectCredentialContent, inspectRepository } from './repository-security.mjs';

test('environment templates and private-key exports cannot be tracked', () => {
  for (const path of ['.env', '.env.example', '.envsecret', 'herbalaibackend/.env.production', 'nested/.env_backup', 'nested/key.pem', 'nested/signing.key', 'qa.private.json', 'credentials.json', 'service-account-demo.json']) {
    assert.equal(privateRepositoryPath(path), true, path);
  }
  for (const path of ['src/config/env.ts', 'next-env.d.ts', 'Docs/ENVIRONMENT_CONFIGURATION.md', 'key.pub']) {
    assert.equal(privateRepositoryPath(path), false, path);
  }
});

test('provider credentials and private-key content are reported without their values', () => {
  const fixtures = [
    ['google-api-key', ['AIza', 'A'.repeat(35)].join('')],
    ['github-token', ['ghp', 'B'.repeat(36)].join('_')],
    ['google-oauth-secret', ['GOCSPX', 'C'.repeat(28)].join('-')],
    ['google-refresh-token', ['1', 'D'.repeat(50)].join('//')],
    ['stripe-secret', ['sk', 'live', 'E'.repeat(28)].join('_')],
    ['aws-access-key', ['AKIA', 'F'.repeat(16)].join('')],
    ['slack-token', ['xoxb', 'G'.repeat(24)].join('-')],
    ['private-key', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
  ];
  for (const [rule, credential] of fixtures) {
    const findings = inspectCredentialContent('fixture.txt', `first line\n${credential}\n`);
    assert.deepEqual(findings, [{ path: 'fixture.txt', rule, line: 2 }]);
    assert.equal(JSON.stringify(findings).includes(credential), false);
  }
});

test('public URLs, citation IDs and synthetic test fixtures are not credentials', () => {
  const content = 'https://www.herbalai.site who-dengue-2025 sk_test_SYNTHETIC 7ddf754f-d193-4cc9-b351-99906754a03b';
  assert.deepEqual(inspectCredentialContent('public.txt', content), []);
});

test('private-file patterns are ignored at any repository depth', () => {
  const paths = ['.env.example', '.env.staging', 'herbalaibackend/.env.backup', 'qa.private.json', 'nested/signing.pem', 'nested/service-account-prod.json'];
  const ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { input: paths.join('\n') }).toString().trim().split(/\r?\n/);
  assert.deepEqual(ignored, paths);
});

test('Docker contexts exclude private credentials', () => {
  for (const path of ['herbalaibackend/.dockerignore', 'herbalaifrontend/.dockerignore']) {
    const content = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    for (const pattern of ['.env', '.env.*', '*.private.json', '*.pem', '*.key', 'credentials.json', 'service-account*.json']) {
      assert.ok(content.split(/\r?\n/).includes(pattern), `${path}: ${pattern}`);
    }
    assert.equal(content.includes('!.env.example'), false);
  }
});

test('current tracked and publishable source passes the credential guard', () => {
  assert.deepEqual(inspectRepository().findings, []);
});
