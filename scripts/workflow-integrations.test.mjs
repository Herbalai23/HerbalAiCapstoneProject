import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from '../herbalaifrontend/node_modules/typescript/lib/typescript.js';

const read = path => readFile(new URL(`../herbalaifrontend/${path}`, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const adminSource = await read('app/admin/page.tsx');
const suggestionSource = await read('app/suggest/page.tsx');
const sourcePolicy = {};
new Function('exports', compile(await read('lib/knowledge-source.ts')))(sourcePolicy);
const names = {};
new Function('exports', compile(await read('lib/registration-name.ts')))(names);

const initializer = (source, name) => {
  const parsed = ts.createSourceFile('review.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === name) result = node.initializer.getText(parsed);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.ok(result, `Missing implementation: ${name}`);
  return result;
};
const loadHandler = (source, name, context) => new Function(...Object.keys(context),
  compile(`const handler = ${initializer(source, name)};`) + '; return handler;')(...Object.values(context));

const approval = (selection, status = 'UNASSESSED') => {
  const requests = [];
  const errors = [];
  const pending = [];
  const handler = loadHandler(adminSource, 'handleApprove', {
    actioningId: null,
    evidenceClassById: selection ? { 7: selection } : {},
    reviewNotesById: {}, suggestions: [{ id: 7, revision: 3, evidenceClass: status }],
    setActioningId: value => pending.push(value), setError: value => errors.push(value), setSuccessMsg() {},
    api: { post: async (url, payload) => { requests.push({ url, payload }); return { data: { status: 'mock_no_mutation' } }; } },
  });
  return { handler, requests, errors, pending };
};

for (const storedClass of ['UNASSESSED', 'DOCUMENTED_TRADITIONAL_USE', 'DOH_PITAHC_LISTED']) {
  test(`requires explicit evidence selection even if stored classification is ${storedClass}`, async () => {
    const fixture = approval('', storedClass);
    await fixture.handler(7);
    assert.equal(fixture.requests.length, 0);
    assert.match(fixture.errors.at(-1), /Select an evidence classification/);
    assert.equal(fixture.pending.at(-1), null);
  });
}

test('submits exactly the reviewer-selected evidence and revision', async () => {
  const fixture = approval('EVIDENCE_SUPPORTED_PHILIPPINE_USE');
  await fixture.handler(7);
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0].payload.evidenceClass, 'EVIDENCE_SUPPORTED_PHILIPPINE_USE');
  assert.equal(fixture.requests[0].payload.revision, 3);
});

test('new KB editor starts with no inferred source attribution', () => {
  const values = {};
  const setters = Object.fromEntries(['EditingKbItem', 'KbQuestion', 'KbAnswer', 'KbCategory', 'KbTags',
    'KbSourceTitle', 'KbSourcePublisher', 'KbSourceUrl', 'IsKbModalOpen'].map(name => [`set${name}`, value => { values[name] = value; }]));
  loadHandler(adminSource, 'openKbModal', setters)(null);
  assert.equal(values.KbSourceTitle, '');
  assert.equal(values.KbSourcePublisher, '');
  assert.equal(values.KbSourceUrl, '');
  assert.equal(values.IsKbModalOpen, true);
});

test('existing KB editor keeps its actual source rather than substituting PITAHC', () => {
  const values = {};
  const setters = Object.fromEntries(['EditingKbItem', 'KbQuestion', 'KbAnswer', 'KbCategory', 'KbTags',
    'KbSourceTitle', 'KbSourcePublisher', 'KbSourceUrl', 'IsKbModalOpen'].map(name => [`set${name}`, value => { values[name] = value; }]));
  loadHandler(adminSource, 'openKbModal', setters)({ question: 'TEST WHO fact', answer: 'TEST ONLY', tags: [], metadata: {
    sources: [{ title: 'WHO source', publisher: 'WHO', url: 'https://www.who.int/' }],
  } });
  assert.equal(values.KbSourcePublisher, 'WHO');
  assert.equal(values.KbSourceUrl, 'https://www.who.int/');
});

test('KB refresh sends global filters and accepts clamped page and global categories', async () => {
  const requests = [];
  const values = {};
  const handler = loadHandler(adminSource, 'refreshKbPage', {
    kbPage: 2, debouncedKbSearch: 'care', kbCategoryFilter: 'coordinated-care', kbStatusFilter: 'INACTIVE',
    api: { get: async (url, config) => { requests.push({ url, config }); return { data: { status: 'success', data: {
      items: [{ id: 'TEST-matching' }], total: 2, page: 1, categories: ['coordinated-care', 'herbal-safety'],
    } } }; } },
    setKbList: value => { values.items = value; }, setKbTotal: value => { values.total = value; },
    setKbPage: value => { values.page = value; }, setAvailableKbCategories: value => { values.categories = value; },
  });
  await handler();
  assert.deepEqual(requests[0], { url: '/knowledge-base/page', config: { params: {
    page: 2, limit: 25, search: 'care', category: 'coordinated-care', status: 'INACTIVE',
  } } });
  assert.equal(values.page, 1);
  assert.equal(values.total, 2);
  assert.deepEqual(values.categories, ['coordinated-care', 'herbal-safety']);
});

test('unavailable source retains citation note but cannot become an active link', () => {
  const historical = { title: 'Directory', publisher: 'PITAHC', url: 'https://pitahc.gov.ph/herbs-directory/',
    availability: { status: 'unavailable', originalUrl: 'https://pitahc.gov.ph/herbs-directory/', note: 'HTTP 404. Historical citation retained.' } };
  const metadata = { sources: [historical] };
  const snapshot = JSON.stringify(metadata);
  const result = sourcePolicy.getKnowledgePrimarySource(metadata);
  assert.equal(result.url, '');
  assert.equal(result.unavailable, true);
  assert.equal(result.availabilityNote, historical.availability.note);
  assert.equal(JSON.stringify(metadata), snapshot);
  assert.match(adminSource, /primarySource\.availabilityNote/);
});

test('available source retains its supporting link and unsafe URL schemes are not linked', () => {
  assert.equal(sourcePolicy.getKnowledgePrimarySource({ sources: [{ url: 'https://www.who.int/' }] }).url, 'https://www.who.int/');
  assert.equal(sourcePolicy.getKnowledgePrimarySource({ sources: [{ url: 'javascript:alert(1)' }] }).url, '');
  assert.equal(sourcePolicy.getKnowledgePrimarySource(null), null);
});

test('registration validation counts Unicode letters rather than combining marks', () => {
  for (const valid of ['Maria', 'Santos', 'Émilie', 'Mari\u0301a', 'Μαρία']) assert.equal(names.registrationNameError(valid, 'First name'), null);
  for (const invalid of ['Ana', 'Jose\u0301', '12345', 'Maria5', 'Maria Jane', 'Maria-Jane', 'a'.repeat(51)]) {
    assert.ok(names.registrationNameError(invalid, 'First name'));
  }
});

const historyEffect = () => {
  const parsed = ts.createSourceFile('suggest.tsx', suggestionSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'useEffect'
      && node.arguments[0]?.getText(parsed).includes('const loadSubmissions')) result = node.arguments[0].getText(parsed);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.ok(result);
  return result;
};

test('clicking the current submission tab cannot leave the list stuck loading', () => {
  const calls = [];
  const handler = loadHandler(suggestionSource, 'handleTabChange', {
    submissionsTab: 'all', submissionsPage: 1,
    setSubmissionsTab: value => calls.push(value), setSubmissionsPage: value => calls.push(value),
    setSubmissionsLoading: value => calls.push(value),
  });
  handler('all');
  assert.deepEqual(calls, []);
});

for (const view of ['active', 'history', 'all']) {
  test(`submission ${view} uses server eligibility/counts, owner scope and pagination`, async () => {
    const requests = [];
    const values = {};
    const listeners = {};
    let interval;
    let cleared;
    const reviewed = { id: 7, status: 'Approved', historyEligibleAt: '2026-10-13T00:00:00Z' };
    const page = { suggestions: view === 'history' ? [] : [reviewed], total: view === 'history' ? 0 : 1,
      counts: { active: 1, history: 0, all: 1 } };
    const context = {
      isAuthenticated: true, submissionsTab: view, submissionsPage: 1, SUBMISSIONS_PER_PAGE: 5,
      api: { get: async (url, config) => { requests.push({ url, config }); return { data: { status: 'success', data: page } }; } },
      setSubmissionsLoading: value => { values.loading = value; }, setSubmissionsError: value => { values.error = value; },
      setSubmissionsPage: value => { values.page = value; }, setSubmissions: value => { values.items = value; },
      setSubmissionsTotal: value => { values.total = value; }, setSubmissionsCounts: value => { values.counts = value; },
      window: { addEventListener: (event, listener) => { listeners[event] = listener; }, removeEventListener: event => { delete listeners[event]; },
        setInterval: (callback, delay) => { interval = { callback, delay }; return 7; }, clearInterval: id => { cleared = id; } },
      document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    };
    const effect = new Function(...Object.keys(context), compile(`const effect = ${historyEffect()};`) + ';return effect;')(...Object.values(context));
    const cleanup = effect();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests[0], { url: '/suggest', config: { params: { view, scope: 'mine', page: 1, limit: 5 } } });
    assert.deepEqual(values.items, page.suggestions);
    assert.deepEqual(values.counts, page.counts);
    assert.equal(values.loading, false);
    assert.equal(interval.delay, 60_000);
    interval.callback();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, 2);
    cleanup();
    assert.equal(cleared, 7);
    assert.equal(listeners.focus, undefined);
  });
}
