import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from '../herbalaifrontend/node_modules/typescript/lib/typescript.js';

const requireFrontend = createRequire(new URL('../herbalaifrontend/package.json', import.meta.url));
const { NextRequest } = requireFrontend('next/server');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const readSource = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const callbackExports = {};
new Function('exports', compile(await readSource('herbalaifrontend/lib/auth-redirect.ts')))(callbackExports);
const routeCompiled = compile(await readSource('herbalaifrontend/app/api/auth/google/complete/route.ts'));
const frontendOrigin = 'https://www.herbalai.site';
const backendApi = 'https://backend.example/api';

const fixture = ({ origin = frontendOrigin, token = 'TEST-only-refresh-token', destination = '/chat?q=lagundi', status = 200 } = {}) => {
  const requests = [];
  const exports = {};
  const fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ data: { accessToken: 'TEST-only-access', refreshToken: 'TEST-only-rotated' } }), {
      status, headers: { 'Content-Type': 'application/json' },
    });
  };
  new Function('require', 'exports', 'fetch', 'process', routeCompiled)(
    name => name === '../../../../../lib/auth-redirect' ? callbackExports : requireFrontend(name),
    exports, fetch, { env: { NODE_ENV: 'production', NEXT_PUBLIC_API_URL: backendApi } },
  );
  const form = new FormData();
  if (token !== null) form.set('refreshToken', token);
  form.set('callbackUrl', destination);
  const headers = origin === null ? {} : { origin };
  const request = new NextRequest(`${frontendOrigin}/api/auth/google/complete`, { method: 'POST', headers, body: form });
  return { complete: () => exports.POST(request), requests };
};

for (const origin of [frontendOrigin, new URL(backendApi).origin]) {
  test(`completion accepts the configured sign-in origin: ${origin}`, async () => {
    const instance = fixture({ origin });
    const response = await instance.complete();
    assert.equal(response.status, 303);
    const destination = new URL(response.headers.get('location'));
    assert.equal(destination.origin, frontendOrigin);
    assert.equal(destination.pathname, '/auth/google/success');
    assert.equal(destination.searchParams.get('callbackUrl'), '/chat?q=lagundi');
    assert.equal(destination.searchParams.has('refreshToken'), false);
    assert.equal(instance.requests[0].url, `${backendApi}/auth/refresh-token`);
    assert.equal(instance.requests[0].options.cache, 'no-store');
    for (const name of ['accessToken', 'refreshToken']) {
      const cookie = response.cookies.get(name);
      assert.equal(cookie.httpOnly, true);
      assert.equal(cookie.secure, true);
      assert.equal(cookie.sameSite, 'lax');
      assert.equal(cookie.path, '/');
    }
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
}

for (const origin of [null, 'null', 'https://attacker.invalid', 'https://www.herbalai.site.attacker.invalid', 'http://www.herbalai.site']) {
  test(`completion rejects an untrusted origin before exchanging tokens: ${origin}`, async () => {
    const instance = fixture({ origin });
    assert.equal((await instance.complete()).status, 403);
    assert.equal(instance.requests.length, 0);
  });
}

test('completion rejects missing tokens and an invalid backend session', async () => {
  const missing = fixture({ token: null });
  assert.equal((await missing.complete()).status, 400);
  assert.equal(missing.requests.length, 0);
  const rejected = await fixture({ status: 401 }).complete();
  assert.equal(rejected.status, 401);
  assert.equal(rejected.cookies.getAll().length, 0);
});

for (const destination of ['https://attacker.invalid', '//attacker.invalid', '/signin']) {
  test(`completion rejects unsafe continuation: ${destination}`, async () => {
    const response = await fixture({ destination }).complete();
    assert.equal(new URL(response.headers.get('location')).searchParams.has('callbackUrl'), false);
  });
}

test('Google sign-in starts on the website origin rather than the backend hostname', async () => {
  const source = await readSource('herbalaifrontend/app/signin/page.tsx');
  const tree = ts.createSourceFile('signin.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let authUrl;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'googleAuthUrl') {
      authUrl = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(authUrl && ts.isStringLiteral(authUrl));
  assert.equal(authUrl.text, '/api/auth/google');
});

test('the existing rewrite forwards OAuth start and callback through the same website origin', async () => {
  const exports = {};
  new Function('exports', 'process', compile(await readSource('herbalaifrontend/next.config.ts')))(
    exports, { env: { NEXT_PUBLIC_API_URL: backendApi } },
  );
  const rewrites = await exports.default.rewrites();
  assert.deepEqual(rewrites, [{ source: '/api/:path*', destination: `${backendApi}/:path*` }]);
});
