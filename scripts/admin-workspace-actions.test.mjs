import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from '../herbalaifrontend/node_modules/typescript/lib/typescript.js';

const requireFrontend = createRequire(new URL('../herbalaifrontend/package.json', import.meta.url));
const axios = requireFrontend('axios');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const sources = Object.fromEntries(await Promise.all(
  ['review-actions', 'herb-actions', 'knowledge-base-actions', 'user-actions'].map(async name =>
    [name, compile(await readFile(new URL('../herbalaifrontend/src/features/admin/actions/' + name + '.ts', import.meta.url), 'utf8'))])));
const helper = async path => {
  const exports = {};
  new Function('exports', compile(await readFile(new URL('../herbalaifrontend/src/' + path + '.ts', import.meta.url), 'utf8')))(exports);
  return exports;
};
const feedback = await helper('features/suggestions/suggestion-review');
const knowledge = await helper('features/admin/knowledge-source');
const success = data => ({ data: { status: 'success', data } });
function fixture(name, initial = {}, response = success({})) {
  const values = { error: 'old error', successMsg: 'old notice', ...initial };
  const requests = [];
  const invalidations = [];
  const api = Object.fromEntries(['post', 'put', 'patch', 'delete'].map(method =>
    [method, async (...args) => {
      requests.push({ method, args });
      if (response instanceof Error) throw response;
      return typeof response === 'function' ? response(...args) : response;
    }]));
  const dependency = specifier => {
    if (specifier === '@/lib/axios') return { __esModule: true, default: api };
    if (specifier === '@/lib/request-cache') return { invalidateApiGetCache: prefix => invalidations.push(prefix) };
    if (specifier === '@/features/suggestions/suggestion-review') return feedback;
    if (specifier === '@/features/admin/knowledge-source') return knowledge;
    if (specifier === '../admin-feedback') return {
      getErrorMessage: (error, fallback) => axios.isAxiosError(error) ? error.response?.data?.message || fallback : fallback,
    };
    return requireFrontend(specifier);
  };
  const exports = {};
  new Function('require', 'exports', sources[name])(dependency, exports);
  const setters = Object.fromEntries(Object.keys(values).map(key => [
    'set' + key[0].toUpperCase() + key.slice(1), next => { values[key] = typeof next === 'function' ? next(values[key]) : next; },
  ]));
  return { values, requests, invalidations, setters, create: context => Object.values(exports)[0]({ ...values, ...setters, ...context }) };
}

function review(response = success({}), overrides = {}) {
  const state = fixture('review-actions', {
    actioningId: null, evidenceClassById: { 7: 'DOH_PITAHC_LISTED' }, suggestions: [{ id: 7, revision: 4 }],
    reviewNotesById: { 7: '  Review notes for the contributor  ' },
    dashboardStats: { totalHerbs: 2, suggestionsByStatus: [{ name: 'Pending', value: 1 }, { name: 'Approved', value: 0 }] },
  }, response);
  const refreshes = [];
  const actions = state.create({ refreshSuggestions: async () => refreshes.push('refreshed'), ...overrides });
  return { ...state, actions, refreshes };
}
test('review factory preserves approval revision, evidence, notes and refresh/cache actions', async () => {
  const state = review();
  await state.actions.handleApprove(7);
  assert.deepEqual(state.requests[0], { method: 'post', args: ['/suggest/7/approve', {
    revision: 4, evidenceClass: 'DOH_PITAHC_LISTED', reviewNotes: 'Review notes for the contributor',
  }] });
  assert.deepEqual(state.invalidations, ['/herbs']);
  assert.equal(state.values.dashboardStats.totalHerbs, 3);
  assert.deepEqual(state.refreshes, ['refreshed']);
  assert.equal(state.values.actioningId, null);
});
test('unassessed evidence and busy review state do not send approval requests', async () => {
  const invalid = review(success({}), { evidenceClassById: {} });
  await invalid.actions.handleApprove(7);
  assert.equal(invalid.requests.length, 0);
  assert.match(invalid.values.error, /evidence classification/);
  const busy = review(success({}), { actioningId: 7 });
  await busy.actions.handleReject(7);
  assert.equal(busy.requests.length, 0);
});
test('request-changes factory distinguishes saved decision from failed list refresh', async () => {
  const state = review(success({ notificationDelivery: 'provider_accepted' }), {
    refreshSuggestions: async () => { throw new Error('LOCAL refresh failure'); },
  });
  await state.actions.handleRequestChanges(7);
  assert.equal(state.requests[0].args[0], '/suggest/7/request-changes');
  assert.equal(state.requests[0].args[1].revision, 4);
  assert.match(state.values.error, /Changes were saved/);
  assert.ok(state.values.successMsg.startsWith('Changes requested and review notes saved.'));
  assert.equal(state.values.actioningId, null);
});
test('short request-changes note sends no request', async () => {
  const state = review(success({}), { reviewNotesById: { 7: 'short' } });
  await state.actions.handleRequestChanges(7);
  assert.equal(state.requests.length, 0);
  assert.match(state.values.error, /at least 10 characters/);
});
test('rejection preserves revision and trimmed notes', async () => {
  const state = review();
  await state.actions.handleReject(7);
  assert.deepEqual(state.requests[0], { method: 'post', args: ['/suggest/7/reject', {
    revision: 4, reviewNotes: 'Review notes for the contributor',
  }] });
  assert.equal(state.values.actioningId, null);
});

function herbs(response = success({})) {
  const herb = { id: 'LOCAL-herb', localName: 'Lagundi', scientificName: 'Vitex negundo', category: 'Respiratory', medicinalUses: 'Documented use' };
  const state = fixture('herb-actions', { allHerbs: [herb], herbsTotal: 1, editingHerb: null, herbFormData: {}, isHerbModalOpen: false }, response);
  return { ...state, herb };
}
test('herb form factory opens and closes without fetching or changing a record', () => {
  const state = herbs();
  const actions = state.create();
  actions.openEditHerbModal(state.herb);
  assert.equal(state.values.editingHerb, state.herb);
  assert.equal(state.values.herbFormData.localName, 'Lagundi');
  assert.equal(state.values.herbFormData.dosage, '');
  assert.equal(state.values.isHerbModalOpen, true);
  actions.closeEditHerbModal();
  assert.equal(state.values.isHerbModalOpen, false);
  assert.equal(state.values.editingHerb, null);
  assert.equal(state.requests.length, 0);
});
test('herb save preserves PUT payload, cache invalidation and local list update', async () => {
  const state = herbs();
  const actions = state.create({ editingHerb: state.herb, herbFormData: { localName: 'Edited local herb' } });
  let prevented = false;
  await actions.handleEditHerbSubmit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(state.requests[0], { method: 'put', args: ['/herbs/LOCAL-herb', { localName: 'Edited local herb' }] });
  assert.deepEqual(state.invalidations, ['/herbs']);
  assert.equal(state.values.allHerbs[0].localName, 'Edited local herb');
});
test('herb save without an edit target sends no request', async () => {
  const state = herbs();
  await state.create().handleEditHerbSubmit({ preventDefault() {} });
  assert.equal(state.requests.length, 0);
});

function knowledgeState(response = success({})) {
  const state = fixture('knowledge-base-actions', {
    kbQuestion: 'Documented plant preparation?', kbAnswer: 'LOCAL documented answer only', kbSourceTitle: 'Source title',
    kbSourcePublisher: 'Source publisher', kbSourceUrl: 'https://example.invalid/source', kbCategory: 'Preparation',
    kbTags: ' local, reviewed ', editingKbItem: null, isImportingKb: false, isKbModalOpen: false,
    expandedKbIds: new Set(), copiedKbId: null,
  }, response);
  const refreshes = [];
  return { ...state, refreshes, actions: overrides => state.create({ refreshKbPage: async () => refreshes.push('refreshed'), ...overrides }) };
}
test('knowledge-base create preserves source metadata and refreshes after saving', async () => {
  const state = knowledgeState();
  await state.actions().handleSaveKbItem({ preventDefault() {} });
  assert.equal(state.requests[0].args[0], '/knowledge-base/create');
  const payload = state.requests[0].args[1];
  assert.deepEqual(payload.tags, ['local', 'reviewed']);
  assert.equal(payload.metadata.jurisdiction, 'Philippines');
  assert.equal(payload.metadata.sources[0].url, 'https://example.invalid/source');
  assert.deepEqual(state.refreshes, ['refreshed']);
});
test('knowledge-base edit retains previous metadata and secondary citations', async () => {
  const state = knowledgeState();
  const secondary = { title: 'Second source' };
  await state.actions({ editingKbItem: { id: 'LOCAL-fact', metadata: {
    retained: true, sources: [{ title: 'Old source', availabilityNote: 'historical' }, secondary],
  } } }).handleSaveKbItem({ preventDefault() {} });
  assert.equal(state.requests[0].method, 'patch');
  assert.equal(state.requests[0].args[0], '/knowledge-base/LOCAL-fact');
  assert.equal(state.requests[0].args[1].metadata.retained, true);
  assert.equal(state.requests[0].args[1].metadata.sources[0].availabilityNote, 'historical');
  assert.deepEqual(state.requests[0].args[1].metadata.sources[1], secondary);
});
test('invalid source metadata sends no knowledge-base save request', async () => {
  const state = knowledgeState();
  await state.actions({ kbSourceUrl: 'javascript:alert(1)' }).handleSaveKbItem({ preventDefault() {} });
  assert.equal(state.requests.length, 0);
  assert.match(state.values.error, /valid HTTP/);
});
test('knowledge-base modal reset clears source fields and expansion stays local', () => {
  const state = knowledgeState();
  const actions = state.actions();
  actions.openKbModal();
  assert.equal(state.values.kbSourceTitle, '');
  assert.equal(state.values.kbSourcePublisher, '');
  assert.equal(state.values.kbSourceUrl, '');
  actions.toggleKbExpand('LOCAL-fact');
  assert.equal(state.values.expandedKbIds.has('LOCAL-fact'), true);
  actions.toggleKbExpand('LOCAL-fact');
  assert.equal(state.values.expandedKbIds.has('LOCAL-fact'), false);
  assert.equal(state.requests.length, 0);
});
test('invalid imported JSON resets import state without sending a request', async () => {
  const state = knowledgeState();
  const target = { value: 'selected-file', files: [{ name: 'local.json', size: 10, text: async () => 'invalid-json' }] };
  await state.actions().handleKbFileImport({ target });
  assert.equal(target.value, '');
  assert.equal(state.values.isImportingKb, false);
  assert.equal(state.requests.length, 0);
  assert.ok(state.values.error);
});
test('ban result updates owner state and invalidates both admin caches without issuing a second ban', () => {
  const state = fixture('user-actions', {
    usersList: [{ id: 'LOCAL-user', isBanned: false }], usersRefresh: 0, banTarget: { id: 'LOCAL-user' }, copiedEmailId: null,
  });
  state.create().handleBanSaved({ id: 'LOCAL-user', isBanned: true });
  assert.deepEqual(state.invalidations, ['/auth/users', '/admin/audit-logs']);
  assert.equal(state.values.usersList[0].isBanned, true);
  assert.equal(state.values.usersRefresh, 1);
  assert.equal(state.values.banTarget, null);
  assert.equal(state.requests.length, 0);
});
