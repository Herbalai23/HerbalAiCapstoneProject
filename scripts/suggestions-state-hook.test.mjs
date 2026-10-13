import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from '../herbalaifrontend/node_modules/typescript/lib/typescript.js';

const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
const compile = async name => ts.transpileModule(
  await readFile(new URL('../herbalaifrontend/src/features/suggestions/' + name + '.ts', import.meta.url), 'utf8'),
  { compilerOptions: options },
).outputText;
const compiled = await compile('useSuggestionSubmission');
const review = {};
new Function('exports', await compile('suggestion-review'))(review);
const response = data => ({ data: { status: 'success', data } });
const submission = {
  id: 17, localName: 'Local QA plant', scientificName: 'Local QA species', category: 'Other',
  medicinalUses: 'Local QA use', preparationMethod: 'Local QA preparation', dosage: 'Local QA dosage',
  informationSource: 'Local QA source', status: 'ChangesRequested', reviewNotes: 'Please clarify the source.',
  createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z',
};
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture({
  get = async () => response({ suggestions: [], total: 0, counts: { all: 0, active: 0, history: 0 } }),
  post = async () => response({ suggestion: { ...submission, status: 'Pending' } }),
  search = '', authenticated = true, unavailable = false,
} = {}) {
  const states = [];
  const refs = [];
  const effects = [];
  const requests = [];
  const redirects = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  const timers = new Map();
  const revoked = [];
  let stateCursor = 0;
  let refCursor = 0;
  const hooks = {
    useState(initial) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useRef(initial) {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useEffect: (callback, dependencies) => effects.push({ callback, dependencies }),
    useCallback: callback => callback,
  };
  const api = Object.fromEntries(Object.entries({ get, post }).map(([method, handler]) => [
    method, async (...args) => { requests.push({ method, args }); return handler(...args); },
  ]));
  const window = {
    scrollTo() {},
    addEventListener: (name, callback) => windowListeners.set(name, callback),
    removeEventListener: name => windowListeners.delete(name),
    setInterval: (callback, delay) => { timers.set(1, { callback, delay }); return 1; },
    clearInterval: id => timers.delete(id),
  };
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, callback) => documentListeners.set(name, callback),
    removeEventListener: name => documentListeners.delete(name),
  };
  const require = name => {
    if (name === 'react') return hooks;
    if (name === 'next/navigation') return { useRouter: () => ({ push: path => redirects.push(path) }), useSearchParams: () => new URLSearchParams(search) };
    if (name === '@/lib/context/AuthContext') return { useAuth: () => ({
      user: { id: 'LOCAL-contributor' }, isAuthenticated: authenticated, loading: false,
      sessionUnavailable: unavailable, checkSession: async () => null,
    }) };
    if (name === '@/lib/axios') return { __esModule: true, default: api };
    if (name === './suggestion-review') return review;
    if (name === '@/lib/request-feedback') return { requestError: (error, fallback) => error.response?.data?.message || fallback };
    throw Error('Unexpected dependency: ' + name);
  };
  const exports = {};
  new Function('require', 'exports', 'window', 'document', 'URL', 'console', compiled)(
    require, exports, window, document,
    { createObjectURL: () => 'blob:LOCAL-preview', revokeObjectURL: url => revoked.push(url) },
    { error() {} },
  );
  const render = () => {
    stateCursor = 0;
    refCursor = 0;
    effects.length = 0;
    return exports.useSuggestionSubmission();
  };
  const effect = fragment => effects.find(entry => entry.callback.toString().includes(fragment)).callback;
  return { render, effect, requests, redirects, windowListeners, documentListeners, timers, revoked };
}
function fill(view) {
  view.setLocalName('  Local QA plant  ');
  view.setScientificName('  Local QA species  ');
  view.setCategory('Other');
  view.setMedicinalUses('  Local QA use  ');
  view.setPreparationMethod('  Local QA preparation  ');
  view.setDosage('  Local QA dosage  ');
  view.setInformationSource('  Local QA source  ');
}
const event = { preventDefault() {} };

test('empty required names reject locally without sending or leaving a busy form', async () => {
  const state = fixture();
  await state.render().handleSubmit(event);
  assert.equal(state.render().error, 'Local / Filipino Name is required.');
  assert.equal(state.render().isSubmitting, false);
  assert.equal(state.requests.length, 0);
});

test('new submission preserves trimmed multipart contract and selects active first page', async () => {
  const state = fixture();
  fill(state.render());
  await state.render().handleSubmit(event);
  const sent = state.requests[0];
  assert.equal(sent.args[0], '/suggest');
  assert.deepEqual(Object.fromEntries(sent.args[1]), {
    localName: submission.localName, scientificName: submission.scientificName, category: 'Other',
    medicinalUses: submission.medicinalUses, preparationMethod: submission.preparationMethod,
    dosage: submission.dosage, informationSource: submission.informationSource,
  });
  assert.equal(sent.args[2].headers['Content-Type'], 'multipart/form-data');
  const view = state.render();
  assert.equal(view.success, true);
  assert.equal(view.currentStatus, 'Pending');
  assert.equal(view.submissionsTab, 'active');
  assert.equal(view.submissionsPage, 1);
  assert.equal(view.isSubmitting, false);
});

test('revision uses existing record endpoint and failed resubmission preserves the draft', async () => {
  const state = fixture({ post: async () => { throw { response: { data: { message: 'Local revision conflict' } } }; } });
  state.render().editSubmission(submission);
  assert.equal(state.render().localName, submission.localName);
  await state.render().handleSubmit(event);
  assert.equal(state.requests[0].args[0], '/suggest/17/resubmit');
  const view = state.render();
  assert.equal(view.error, 'Local revision conflict');
  assert.equal(view.editingSubmission.id, 17);
  assert.equal(view.localName, submission.localName);
  assert.equal(view.isSubmitting, false);
});

test('reset clears revision, form, selected upload and success state', () => {
  const state = fixture();
  state.render().editSubmission(submission);
  const view = state.render();
  view.fileInputRef.current = { value: 'LOCAL-image' };
  view.handleFileChange({ target: { files: [{ type: 'image/png', size: 10 }] } });
  state.render().handleReset();
  const reset = state.render();
  assert.equal(reset.editingSubmission, null);
  assert.equal(reset.localName, '');
  assert.equal(reset.imagePreview, null);
  assert.equal(reset.fileInputRef.current.value, '');
  assert.equal(reset.error, null);
});

test('upload guards reject type and size, and preview cleanup releases its URL', () => {
  const state = fixture();
  const view = state.render();
  view.handleFileChange({ target: { files: [{ type: 'text/html', size: 10 }] } });
  assert.match(state.render().error, /Invalid file format/);
  view.handleFileChange({ target: { files: [{ type: 'image/png', size: 6 * 1024 * 1024 }] } });
  assert.match(state.render().error, /File size too large/);
  view.handleFileChange({ target: { files: [{ type: 'image/png', size: 10 }] } });
  assert.equal(state.render().imagePreview, 'blob:LOCAL-preview');
  state.effect('revokeObjectURL')()();
  assert.deepEqual(state.revoked, ['blob:LOCAL-preview']);
  assert.equal(state.requests.length, 0);
});

test('list loading respects owner scope, server counts and history page, and cleans refresh listeners', async () => {
  const counts = { all: 9, active: 3, history: 6 };
  const state = fixture({ get: async () => response({ suggestions: [submission], total: 6, counts }) });
  state.render().handleTabChange('history');
  const view = state.render();
  const cleanup = state.effect('loadSubmissions')();
  await flush();
  assert.deepEqual(state.requests[0].args, ['/suggest', { params: { view: 'history', scope: 'mine', page: 1, limit: 5 } }]);
  assert.deepEqual(state.render().submissionsCounts, counts);
  assert.equal(state.render().totalSubmissionPages, 2);
  assert.equal(state.timers.get(1).delay, 60_000);
  state.windowListeners.get('focus')();
  await flush();
  assert.equal(state.requests.length, 2);
  cleanup();
  assert.equal(state.timers.size, 0);
  assert.equal(state.windowListeners.size, 0);
  assert.equal(state.documentListeners.size, 0);
  assert.equal(view.submissionsTab, 'history');
});

test('cancelled list responses cannot overwrite the next tab state', async () => {
  let resolveOld;
  const state = fixture({ get: () => new Promise(resolve => { resolveOld = resolve; }) });
  state.render();
  const cleanup = state.effect('loadSubmissions')();
  cleanup();
  state.render().handleTabChange('history');
  resolveOld(response({ suggestions: [submission], total: 1, counts: { all: 1, active: 1, history: 0 } }));
  await flush();
  assert.deepEqual(state.render().submissions, []);
  assert.equal(state.render().submissionsTab, 'history');
});

test('owned revision link loads once, blocks submit while loading and cancellation suppresses late prefill', async () => {
  let resolveRevision;
  const state = fixture({ search: 'edit=17', get: () => new Promise(resolve => { resolveRevision = resolve; }) });
  state.render();
  const cleanup = state.effect('openLinkedSubmission')();
  assert.equal(state.render().linkedSubmissionLoading, true);
  await state.render().handleSubmit(event);
  assert.equal(state.requests.length, 1);
  cleanup();
  resolveRevision(response({ suggestion: submission }));
  await flush();
  assert.equal(state.render().editingSubmission, null);
  const loaded = fixture({ search: 'edit=17', get: async () => response({ suggestion: submission }) });
  loaded.render();
  loaded.effect('openLinkedSubmission')();
  await flush();
  assert.equal(loaded.render().editingSubmission.id, 17);
  assert.equal(loaded.render().linkedSubmissionLoading, false);
});

test('signed out redirect preserves revision target but a session outage does not redirect', () => {
  const state = fixture({ search: 'edit=17', authenticated: false });
  state.render();
  state.effect('router.push')();
  assert.deepEqual(state.redirects, ['/signin?callbackUrl=%2Fsuggest%3Fedit%3D17']);
  const outage = fixture({ authenticated: false, unavailable: true });
  outage.render();
  outage.effect('router.push')();
  assert.deepEqual(outage.redirects, []);
});
