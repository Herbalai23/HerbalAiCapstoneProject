import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from '../herbalaifrontend/node_modules/typescript/lib/typescript.js';
const requireFrontend = createRequire(new URL('../herbalaifrontend/package.json', import.meta.url));
const React = requireFrontend('react');
const { renderToStaticMarkup } = requireFrontend('react-dom/server');
const sections = ['DashboardSection', 'SuggestionsSection', 'HerbsSection', 'UsersSection', 'KnowledgeBaseSection', 'AuditLogsSection'];
const read = name => readFileSync(new URL('../herbalaifrontend/src/features/admin/sections/' + name + '.tsx', import.meta.url), 'utf8');
function load(name) {
  const source = read(name);
  const syntax = ts.createSourceFile(name + '.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const props = {};
  const calls = [];
  const declaration = syntax.statements.find(ts.isInterfaceDeclaration);
  for (const property of declaration.members) {
    const key = property.name.text;
    const type = property.type.getText(syntax);
    props[key] = /=>|Dispatch|ComponentType/.test(type) ? (...args) => { calls.push([key, ...args]); return null; }
      : type.includes('[]') ? [] : type.startsWith('Set<') ? new Set()
      : type === 'boolean' ? false : type === 'number' ? 0 : type.includes('| null') ? null
      : type === 'User' ? { id: 'LOCAL-test', role: 'admin', name: 'TEST user' }
      : type.includes('ALL') ? 'ALL' : type === 'SuggestionFilter' ? 'Pending' : '';
  }
  const wrapper = ({ children, ...attributes }) => React.createElement('div', attributes, children);
  const dependency = specifier => {
    if (specifier === 'next/link') return { __esModule: true, default: ({ children, ...attributes }) => React.createElement('a', attributes, children) };
    if (specifier === 'lucide-react') return new Proxy({}, { get: () => attributes => React.createElement('svg', attributes) });
    if (specifier === '@/components/ui/card') return { Card: wrapper, CardContent: wrapper, CardHeader: wrapper, CardTitle: wrapper };
    if (specifier === '@/components/ui/button') return { Button: ({ children, ...attributes }) => React.createElement('button', attributes, children) };
    if (specifier === '@/features/suggestions/SuggestionStatusBadge') return { __esModule: true, default: () => null };
    return requireFrontend(specifier);
  };
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText)(dependency, exports);
  return { render: overrides => exports.default({ ...props, ...overrides }), calls };
}
for (const name of sections) {
  test(name + ' renders its real extracted empty/loading presentation without API or database calls', () => {
    const fixture = load(name);
    const html = renderToStaticMarkup(fixture.render());
    assert.ok(html.includes('<h1') || html.includes('<h2'), name);
    assert.equal(fixture.calls.length, 0);
    assert.doesNotMatch(read(name), /api\.(get|post|put|patch|delete)|fetch\(|useEffect\(/);
  });
}
test('audit loading and failure states cannot claim an empty history', () => {
  const fixture = load('AuditLogsSection');
  assert.match(renderToStaticMarkup(fixture.render({ auditLoading: true })), /Loading audit logs/);
  assert.match(renderToStaticMarkup(fixture.render({ auditLoadFailed: true })), /Audit logs could not be loaded/);
});
test('users request failures expose retry without pretending the database is empty', () => {
  const fixture = load('UsersSection');
  assert.match(renderToStaticMarkup(fixture.render({ usersLoadFailed: true })), /Retry/);
});
