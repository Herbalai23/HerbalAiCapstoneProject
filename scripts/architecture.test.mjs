import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const requireTypescript = createRequire(new URL(
  existsSync(new URL('../herbalaifrontend/node_modules/typescript', import.meta.url))
    ? '../herbalaifrontend/package.json' : '../herbalaibackend/package.json', import.meta.url));
const ts = requireTypescript('typescript');

const repository = fileURLToPath(new URL('..', import.meta.url));
const frontend = path.join(repository, 'herbalaifrontend');
const sourceRoot = path.join(frontend, 'src');
const read = relative => readFileSync(path.join(repository, relative), 'utf8');
const filesUnder = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const filename = path.join(directory, entry.name);
  return entry.isDirectory() ? filesUnder(filename) : [filename];
});
const sourceFiles = filesUnder(sourceRoot).filter(filename => /\.tsx?$/.test(filename));
const importSpecifiers = filename => {
  const syntax = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const imports = [];
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(syntax);
  return imports;
};
const routePages = sourceFiles.filter(filename => path.basename(filename) === 'page.tsx' && filename.startsWith(path.join(sourceRoot, 'app') + path.sep));
const routeUrl = filename => '/' + path.relative(path.join(sourceRoot, 'app'), path.dirname(filename)).split(path.sep).filter(segment => segment && !/^\(.+\)$/.test(segment)).join('/');
const expectedUrls = ['/', '/about', '/admin', '/auth/google/success', '/chat', '/community', '/community/[id]', '/community/new', '/credits', '/forgot-password', '/library', '/messenger', '/privacy', '/reset-password', '/signin', '/signup', '/sources', '/suggest', '/verify-email'];

test('application code lives in src without a competing root router, and Proxy moves with it', () => {
  assert.equal(existsSync(path.join(frontend, 'app')), false);
  assert.equal(existsSync(path.join(frontend, 'proxy.ts')), false);
  assert.equal(existsSync(path.join(sourceRoot, 'proxy.ts')), true);
  assert.equal(existsSync(path.join(sourceRoot, 'app/api/auth/google/complete/route.ts')), true);
  assert.equal(existsSync(path.join(frontend, 'public/favicon.ico')), true);
});

test('route groups preserve the full existing page URL inventory without collisions', () => {
  const urls = routePages.map(routeUrl);
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(urls.sort(), [...expectedUrls].sort());
});

test('page entries stay thin and delegate to a feature screen', () => {
  for (const filename of routePages) {
    const source = readFileSync(filename, 'utf8');
    assert.match(source, /export \{ default \} from ['"]@\/features\//, filename);
    assert.ok(source.trim().split(/\r?\n/).length <= 14, filename);
    assert.doesNotMatch(source, /useState|useEffect|api\.(get|post)|fetch\(/, filename);
  }
});

test('all internal frontend aliases resolve after moves, including lazy components', () => {
  for (const filename of sourceFiles) {
    for (const specifier of importSpecifiers(filename).filter(value => value.startsWith('@/'))) {
      const target = path.join(sourceRoot, specifier.slice(2));
      assert.ok(['', '.ts', '.tsx', '/index.ts', '/index.tsx'].some(extension => existsSync(target + extension)), filename + ': ' + specifier);
    }
  }
});

test('feature implementations do not depend on route entry files', () => {
  for (const filename of sourceFiles.filter(value => value.startsWith(path.join(sourceRoot, 'features') + path.sep))) {
    assert.ok(importSpecifiers(filename).every(specifier => !specifier.startsWith('@/app/')), filename);
  }
});

test('admin tabs remain bounded presentation modules with state and requests outside their markup', () => {
  const screen = read('herbalaifrontend/src/features/admin/AdminScreen.tsx');
  for (const name of ['DashboardSection', 'SuggestionsSection', 'HerbsSection', 'UsersSection', 'KnowledgeBaseSection', 'AuditLogsSection']) {
    const section = read('herbalaifrontend/src/features/admin/sections/' + name + '.tsx');
    assert.ok(section.trim().split(/\r?\n/).length <= 500, name);
    assert.doesNotMatch(section, /useState\(|useEffect\(|api\.(get|post|put|patch|delete)|fetch\(/, name);
    assert.ok(screen.includes('<' + name + ' '), name);
  }
});

test('admin presentation, state hook and action factories keep explicit boundaries', () => {
  const screen = read('herbalaifrontend/src/features/admin/AdminScreen.tsx');
  const workspace = read('herbalaifrontend/src/features/admin/useAdminWorkspace.ts');
  assert.match(screen, /useAdminWorkspace\(\)/);
  assert.ok(screen.trim().split(/\r?\n/).length < 900);
  assert.doesNotMatch(screen, /useState\(|useEffect\(|api\.(get|post|put|patch|delete)/);
  assert.ok(workspace.trim().split(/\r?\n/).length < 600);
  for (const name of ['review-actions', 'herb-actions', 'knowledge-base-actions', 'user-actions']) {
    const filename = 'herbalaifrontend/src/features/admin/actions/' + name + '.ts';
    const action = read(filename);
    assert.ok(action.trim().split(/\r?\n/).length < 350, name);
    assert.doesNotMatch(action, /useState\(|useEffect\(/, name);
    assert.ok(importSpecifiers(path.join(repository, filename)).every(specifier => !specifier.includes('useAdminWorkspace') && !specifier.includes('AdminScreen')), name);
  }
});

test('Messenger presentation and socket lifecycle stay outside each other’s responsibilities', () => {
  const screen = read('herbalaifrontend/src/features/messenger/MessengerScreen.tsx');
  const state = read('herbalaifrontend/src/features/messenger/useMessengerState.ts');
  const connection = read('herbalaifrontend/src/features/messenger/useMessengerConnection.ts');
  assert.match(screen, /useMessengerState\(\)/);
  assert.match(screen, /<Suspense/);
  assert.ok(screen.trim().split(/\r?\n/).length < 650);
  assert.doesNotMatch(screen, /useState\(|useEffect\(|api\.(get|post|put|delete)|socket\.on/);
  assert.ok(state.trim().split(/\r?\n/).length < 600);
  assert.match(state, /useMessengerConnection\(/);
  assert.doesNotMatch(state, /socket\.on/);
  assert.ok(connection.trim().split(/\r?\n/).length < 120);
  assert.doesNotMatch(connection, /useState\(|<div|api\.(post|put|delete)/);
});

test('Suggestions keeps form requests and lifecycle outside its existing presentation', () => {
  const screen = read('herbalaifrontend/src/features/suggestions/SuggestHerbScreen.tsx');
  const state = read('herbalaifrontend/src/features/suggestions/useSuggestionSubmission.ts');
  assert.match(screen, /useSuggestionSubmission\(\)/);
  assert.match(screen, /<Suspense/);
  assert.ok(screen.trim().split(/\r?\n/).length < 700);
  assert.doesNotMatch(screen, /useState\(|useEffect\(|api\.(get|post|put|delete)/);
  assert.ok(state.trim().split(/\r?\n/).length < 450);
  assert.doesNotMatch(state, /<div|<form/);
  assert.match(state, /scope: 'mine'/);
});

test('TypeScript, Tailwind and component-generator paths point at src', () => {
  const config = JSON.parse(read('herbalaifrontend/tsconfig.json'));
  assert.deepEqual(config.compilerOptions.paths['@/*'], ['./src/*']);
  const components = JSON.parse(read('herbalaifrontend/components.json'));
  assert.equal(components.tailwind.css, 'src/app/globals.css');
  const styles = read('herbalaifrontend/src/app/globals.css');
  assert.match(styles, /@source "\.\.\/components"/);
  assert.match(styles, /@source "\.\.\/features"/);
});

test('the stable backend authentication entry delegates to independent workflows', () => {
  const facade = read('herbalaibackend/src/services/auth.service.ts');
  assert.ok(facade.trim().split(/\r?\n/).length <= 10);
  const expected = ['signup', 'login', 'forgotPassword', 'changePassword', 'requestPasswordSetup', 'resetPassword', 'refreshToken', 'logout', 'getGoogleAuthUrl', 'googleLogin', 'verifyEmail', 'resendEmailVerification'];
  const names = [...facade.matchAll(/export \{([^}]+)\}/g)].flatMap(match => match[1].split(',').map(name => name.trim()));
  assert.deepEqual(names.sort(), expected.sort());
  for (const filename of filesUnder(path.join(repository, 'herbalaibackend/src/services/auth'))) {
    const source = readFileSync(filename, 'utf8');
    assert.doesNotMatch(source, /from ['"][^'"]*auth\.service/);
    assert.doesNotMatch(source, /from ['"][^'"]*(controllers|routes)\//);
  }
});

test('domain policies stay independent of transport, persistence and provider adapters', () => {
  for (const filename of filesUnder(path.join(repository, 'herbalaibackend/src/domain'))) {
    const source = readFileSync(filename, 'utf8');
    assert.doesNotMatch(source, /from ['"][^'"]*(repositories|controllers|routes|lib|config)\//, filename);
    assert.doesNotMatch(source, /from ['"](express|pg|nodemailer|google-auth-library)['"]/, filename);
  }
});
