import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from '../herbalaifrontend/node_modules/typescript/lib/typescript.js';

const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
const compile = async filename => ts.transpileModule(
  await readFile(new URL('../herbalaifrontend/src/features/messenger/' + filename + '.ts', import.meta.url), 'utf8'),
  { compilerOptions: options },
).outputText;
const compiled = await compile('useMessengerState');
const sync = {};
new Function('exports', await compile('messenger-sync'))(sync);
const user = { id: 'LOCAL-self', name: 'Local self' };
const peer = { id: 'LOCAL-peer', name: 'Local peer', avatar: 'P', role: 'contributor' };
const message = (id, content = 'Local message', receiver = peer) => ({
  id, senderId: user.id, receiverId: receiver.id, sender: user, receiver, content,
  isEdited: false, isDeleted: false, time: '2026-10-13T00:00:00.000Z',
});
const response = data => ({ data: { status: 'success', data } });
function fixture({ get = async () => response({ messages: [], hasMore: false }), post = async () => response({ message: message(7) }), put = async () => response({ message: { ...message(1, 'Edited local message'), isEdited: true } }) } = {}) {
  const states = [];
  const refs = [];
  let stateCursor = 0;
  let refCursor = 0;
  const requests = [];
  const alerts = [];
  const errors = [];
  const connectionInputs = [];
  const effects = [];
  const exports = {};
  const hooks = {
    useState(initial) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useRef(initial) {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    },
    useCallback: callback => callback,
    useEffect: (callback, dependencies) => effects.push({ callback, dependencies }),
  };
  const api = Object.fromEntries(Object.entries({ get, post, put }).map(([method, handler]) => [method,
    async (...args) => { requests.push({ method, args }); return handler(...args); }]));
  const require = name => {
    if (name === 'react') return hooks;
    if (name === 'next/navigation') return { useRouter: () => ({ push() {} }), useSearchParams: () => new URLSearchParams() };
    if (name === '@/lib/context/AuthContext') return { useAuth: () => ({ user, isAuthenticated: true, loading: false, sessionUnavailable: false, checkSession: async () => user }) };
    if (name === '@/lib/axios') return { __esModule: true, default: api };
    if (name === './messenger-sync') return sync;
    if (name === './useMessengerConnection') return { useMessengerConnection: inputs => connectionInputs.push(inputs) };
    throw Error('Unexpected dependency: ' + name);
  };
  new Function('require', 'exports', 'window', 'alert', 'console', 'URL', compiled)(
    require, exports, { innerWidth: 390 }, text => alerts.push(text),
    { error: (...args) => errors.push(args) },
    { createObjectURL: () => 'blob:LOCAL-preview' },
  );
  const render = () => {
    stateCursor = 0;
    refCursor = 0;
    effects.length = 0;
    return exports.useMessengerState();
  };
  return { render, requests, alerts, errors, connectionInputs, effects };
}
test('state hook wires stable history and socket refs while empty send makes no request', async () => {
  const state = fixture();
  const first = state.render();
  await first.handleSend({ preventDefault() {} });
  state.render();
  assert.equal(state.requests.length, 0);
  assert.equal(state.connectionInputs[0].historyRequests, state.connectionInputs[1].historyRequests);
  assert.equal(state.connectionInputs[0].socketRef, state.connectionInputs[1].socketRef);
});
test('opening a peer preserves history request and seeds the conversation preview', async () => {
  const state = fixture({ get: async () => response({ messages: [message(1)], hasMore: false }) });
  await state.render().openConversation(peer);
  const view = state.render();
  assert.equal(view.activeContact.id, peer.id);
  assert.equal(view.messages[0].id, 1);
  assert.equal(view.filteredConversations[0].contact.id, peer.id);
  assert.equal(view.loadingMessages, false);
  assert.equal(state.requests[0].args[0], '/messages/history/LOCAL-peer?limit=50');
  assert.deepEqual(state.requests[0].args[1], { timeout: 10000 });
});
test('send preserves multipart payload and merges the returned message without refreshing history', async () => {
  const state = fixture();
  await state.render().openConversation(peer);
  state.render().setInput('  Local send text  ');
  await state.render().handleSend({ preventDefault() {} });
  const sent = state.requests.find(request => request.method === 'post');
  assert.equal(sent.args[0], '/messages');
  assert.equal(sent.args[1].get('receiverId'), peer.id);
  assert.equal(sent.args[1].get('content'), 'Local send text');
  assert.deepEqual(sent.args[2], { headers: { 'Content-Type': 'multipart/form-data' } });
  const view = state.render();
  assert.equal(view.input, '');
  assert.equal(view.isSending, false);
  assert.equal(view.messages[0].id, 7);
  assert.equal(state.requests.filter(request => request.method === 'get').length, 1);
});
test('send failure retains the draft and releases pending state for retry', async () => {
  const state = fixture({ post: async () => { throw Error('LOCAL network failure'); } });
  await state.render().openConversation(peer);
  state.render().setInput('Keep local draft');
  await state.render().handleSend({ preventDefault() {} });
  const view = state.render();
  assert.equal(view.input, 'Keep local draft');
  assert.equal(view.isSending, false);
  assert.deepEqual(state.alerts, ['Failed to send message. Please try again.']);
});
test('editing merges only the returned existing message and clears edit state', async () => {
  const state = fixture({ get: async () => response({ messages: [message(1)], hasMore: false }) });
  await state.render().openConversation(peer);
  const view = state.render();
  view.setEditingMessageId(1);
  view.setEditInput('  Edited local message  ');
  await state.render().handleEditSubmit(1);
  const edited = state.requests.find(request => request.method === 'put');
  assert.deepEqual(edited.args, ['/messages/1', { content: 'Edited local message' }]);
  const current = state.render();
  assert.equal(current.messages.length, 1);
  assert.equal(current.messages[0].isEdited, true);
  assert.equal(current.editingMessageId, null);
  assert.equal(current.editInput, '');
});
test('late history for a previous contact cannot replace a newly opened conversation', async () => {
  let resolvePrevious;
  const previous = new Promise(resolve => { resolvePrevious = resolve; });
  const nextPeer = { ...peer, id: 'LOCAL-next', name: 'Next local peer' };
  const state = fixture({ get: async url => url.includes('LOCAL-next')
    ? response({ messages: [message(2, 'New contact message', nextPeer)], hasMore: false }) : previous });
  const view = state.render();
  const pending = view.openConversation(peer);
  await view.openConversation(nextPeer);
  resolvePrevious(response({ messages: [message(1)], hasMore: false }));
  await pending;
  const current = state.render();
  assert.equal(current.activeContact.id, nextPeer.id);
  assert.deepEqual(current.messages.map(entry => entry.id), [2]);
});
test('attachment size guard rejects oversized files locally and selected preview can be removed', () => {
  const state = fixture();
  const view = state.render();
  view.handleFileChange({ target: { files: [{ size: 6 * 1024 * 1024 }] } });
  assert.deepEqual(state.alerts, ['File size exceeds the 5MB limit.']);
  assert.equal(state.render().selectedFile, null);
  view.handleFileChange({ target: { files: [{ size: 10, name: 'LOCAL-preview.png' }] } });
  assert.equal(state.render().filePreviewUrl, 'blob:LOCAL-preview');
  state.render().removeSelectedFile();
  assert.equal(state.render().filePreviewUrl, null);
  assert.equal(state.requests.length, 0);
});
