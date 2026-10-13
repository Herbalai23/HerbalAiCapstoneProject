import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from '../herbalaifrontend/node_modules/typescript/lib/typescript.js';

const requireFrontend = createRequire(new URL('../herbalaifrontend/package.json', import.meta.url));
const { NextRequest } = requireFrontend('next/server');
const baseline = process.env.CUSTOM_DOMAIN_AUTH_BASELINE_REF;
if (baseline && !/^[a-f0-9]{40}$/i.test(baseline)) throw new Error('Baseline must be an exact commit SHA');
const readSource = path => baseline
  ? execFileSync('git', ['show', `${baseline}:${path}`], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
  : readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const proxyExports = {};
new Function('require', 'exports', compile(await readSource('herbalaifrontend/src/proxy.ts')))(requireFrontend, proxyExports);
const callbackExports = {};
new Function('exports', compile(await readSource('herbalaifrontend/src/lib/auth-redirect.ts')))(callbackExports);
const signinSource = await readSource('herbalaifrontend/src/features/auth/SignInScreen.tsx');
const signinTree = ts.createSourceFile('signin.tsx', signinSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let submitDeclaration;
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(signinTree) === 'handleSubmit') submitDeclaration = node;
  ts.forEachChild(node, visit);
};
visit(signinTree);
assert.ok(submitDeclaration, 'the test must execute the actual sign-in handler');
const submitCompiled = compile(`const handleSubmit = ${submitDeclaration.initializer.getText(signinTree)}; exports.submit = handleSubmit;`);

for (const destination of [
  '/chat?q=What%20preparation%20and%20safety%20information%20is%20available%20for%20Abutilon%20indicum%3F',
  '/chat?q=lagundi&language=filipino',
  '/messenger?userId=TEST-only-contact',
  '/community/new?draft=TEST-only',
  '/admin?section=users',
]) {
  test(`anonymous proxy preserves the complete local destination: ${destination}`, () => {
    const request = new NextRequest(`https://www.herbalai.site${destination}`);
    const response = proxyExports.proxy(request);
    const redirect = new URL(response.headers.get('location'));
    assert.equal(response.status, 307);
    assert.equal(redirect.origin, 'https://www.herbalai.site');
    assert.equal(redirect.pathname, '/signin');
    assert.equal(redirect.searchParams.get('callbackUrl'), destination);
    assert.equal(callbackExports.safeAuthCallback(redirect.searchParams.get('callbackUrl')), destination);
  });
}

for (const cookieName of ['accessToken', 'refreshToken']) {
  test(`the proxy admits a cookie-bearing request without claiming token validity: ${cookieName}`, () => {
    const response = proxyExports.proxy(new NextRequest('https://www.herbalai.site/chat?q=TEST', {
      headers: { cookie: `${cookieName}=TEST-only-synthetic` },
    }));
    assert.equal(response.headers.get('x-middleware-next'), '1');
    assert.equal(response.headers.get('location'), null);
  });
}

const signinFixture = (callback, login) => {
  const navigations = [];
  const errors = [];
  const loading = [];
  const exports = {};
  const window = { location: {
    search: callback === null ? '' : `?${new URLSearchParams({ callbackUrl: callback })}`,
    replace: destination => navigations.push(destination),
  } };
  new Function('exports', 'login', 'identifier', 'password', 'setError', 'setLoading', 'window', 'safeAuthCallback', 'requestError', submitCompiled)(
    exports, login, 'TEST-only-user', 'TEST-only-password', value => errors.push(value), value => loading.push(value), window,
    callbackExports.safeAuthCallback, () => 'TEST-only credential rejection',
  );
  return { submit: () => exports.submit({ preventDefault() {} }), navigations, errors, loading };
};

test('successful sign-in starts a fresh document navigation only after authentication finishes', async () => {
  let completeLogin;
  const login = new Promise(resolve => { completeLogin = resolve; });
  const destination = '/chat?q=lagundi%20preparation&language=filipino';
  const fixture = signinFixture(destination, () => login);
  const submitting = fixture.submit();
  assert.deepEqual(fixture.navigations, []);
  completeLogin({ role: 'contributor' });
  await submitting;
  assert.deepEqual(fixture.navigations, [destination]);
  assert.deepEqual(fixture.loading, [true, false]);
});

for (const callback of ['https://attacker.invalid/', '//attacker.invalid/', '/%2f%2fattacker.invalid/', '/signin']) {
  test(`fresh login navigation rejects unsafe or looping callbacks: ${callback}`, async () => {
    const fixture = signinFixture(callback, async () => ({ role: 'contributor' }));
    await fixture.submit();
    assert.deepEqual(fixture.navigations, ['/']);
  });
}

test('a rejected sign-in does not navigate or reuse a protected prefetched route', async () => {
  const fixture = signinFixture('/chat?q=TEST', async () => { throw new Error('TEST-only failure'); });
  await fixture.submit();
  assert.deepEqual(fixture.navigations, []);
  assert.equal(fixture.errors.at(-1), 'TEST-only credential rejection');
  assert.deepEqual(fixture.loading, [true, false]);
});
