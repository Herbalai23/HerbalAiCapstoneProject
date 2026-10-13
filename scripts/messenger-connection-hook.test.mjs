import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from '../herbalaifrontend/node_modules/typescript/lib/typescript.js';

const source = await readFile(new URL('../herbalaifrontend/src/features/messenger/useMessengerConnection.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const fixture = overrides => {
  const handlers = new Map();
  const registered = [];
  const removed = [];
  const windowEvents = new Map();
  const documentEvents = new Map();
  const calls = { io: [], token: [], applied: [], synced: 0, session: 0, recovery: 0, stopped: 0, cancelled: 0 };
  let effect;
  let dependencies;
  let options;
  let cleanup;
  const socket = {
    connected: false,
    on(name, callback) { handlers.set(name, callback); registered.push([name, callback]); },
    off(name, callback) { removed.push([name, callback]); if (handlers.get(name) === callback) handlers.delete(name); },
  };
  const window = {
    addEventListener: (name, callback) => windowEvents.set(name, callback),
    removeEventListener: (name, callback) => { if (windowEvents.get(name) === callback) windowEvents.delete(name); },
  };
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, callback) => documentEvents.set(name, callback),
    removeEventListener: (name, callback) => { if (documentEvents.get(name) === callback) documentEvents.delete(name); },
  };
  let now = 10_000;
  const exports = {};
  const require = name => {
    if (name === 'react') return { useEffect: (callback, deps) => { effect = callback; dependencies = deps; } };
    if (name === 'socket.io-client') return { __esModule: true, default: (...args) => { calls.io.push(args); return socket; } };
    if (name === '@/lib/axios') return { __esModule: true, default: {
      get: async (...args) => { calls.token.push(args); return { data: { data: { token: 'LOCAL-fixture-token' } } }; },
    } };
    if (name === './messenger-sync') return {
      startMessengerConnection: (connectedSocket, callbacks) => {
        assert.equal(connectedSocket, socket);
        options = callbacks;
        return { recover: () => calls.recovery++, stop: () => calls.stopped++ };
      },
    };
    throw Error('Unexpected runtime dependency: ' + name);
  };
  new Function('require', 'exports', 'window', 'document', 'process', 'Date', compiled)(
    require, exports, window, document,
    { env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:55442/api' } },
    { now: () => now },
  );
  const input = {
    isAuthenticated: true, user: { id: 'LOCAL-self' }, socketRef: { current: null },
    applyMessage: (...args) => calls.applied.push(args),
    checkSession: async () => { calls.session++; return null; },
    historyRequests: { cancel: () => calls.cancelled++ },
    synchronizeRef: { current: async () => { calls.synced++; } },
    conversationQueryRef: { current: 3 },
    conversationEventsRef: { current: new Map() },
    ...overrides,
  };
  exports.useMessengerConnection(input);
  const activate = () => { cleanup = effect(); return cleanup; };
  return {
    calls, socket, input, windowEvents, documentEvents, handlers, registered, removed, document,
    activate, stop: () => cleanup?.(), options: () => options, dependencies: () => dependencies,
    setTime: value => { now = value; },
  };
};
test('signed-out or missing-user sessions register no socket or browser listeners', () => {
  for (const overrides of [{ isAuthenticated: false }, { user: null }]) {
    const state = fixture(overrides);
    assert.equal(state.activate(), undefined);
    assert.equal(state.calls.io.length, 0);
    assert.equal(state.windowEvents.size, 0);
    assert.equal(state.documentEvents.size, 0);
  }
});
test('connection hook wires private events without treating edits/deletions as new messages', () => {
  const state = fixture();
  state.activate();
  assert.deepEqual(state.calls.io, [['http://127.0.0.1:55442', { autoConnect: false, transports: ['websocket', 'polling'] }]]);
  const message = { id: 7 };
  state.handlers.get('private_message')(message);
  state.handlers.get('message_edited')(message);
  state.handlers.get('message_deleted')(message);
  assert.deepEqual(state.calls.applied, [[message], [message, false], [message, false]]);
  state.stop();
});
test('socket authentication and recovery preserve token budget and session callbacks', async () => {
  const state = fixture();
  state.activate();
  assert.equal(await state.options().getToken(), 'LOCAL-fixture-token');
  assert.deepEqual(state.calls.token, [['/auth/socket-token', { timeout: 10000 }]]);
  state.options().onConnected();
  state.options().onAuthorizationFailure();
  assert.equal(state.calls.synced, 1);
  assert.equal(state.calls.session, 1);
  state.stop();
});
test('focus/online recovery is throttled and ignores hidden tabs', () => {
  const state = fixture();
  state.activate();
  state.windowEvents.get('focus')();
  state.windowEvents.get('online')();
  assert.equal(state.calls.recovery, 1);
  state.setTime(11_000);
  state.socket.connected = true;
  state.documentEvents.get('visibilitychange')();
  assert.equal(state.calls.synced, 1);
  state.setTime(12_000);
  state.document.visibilityState = 'hidden';
  state.windowEvents.get('focus')();
  assert.equal(state.calls.synced, 1);
  assert.equal(state.calls.recovery, 1);
  state.stop();
});
test('cleanup removes exact handlers, stops recovery and invalidates pending history state', () => {
  const state = fixture();
  state.activate();
  assert.deepEqual([...state.windowEvents.keys()], ['focus', 'online']);
  assert.deepEqual([...state.documentEvents.keys()], ['visibilitychange']);
  state.stop();
  assert.deepEqual(state.removed, state.registered);
  assert.equal(state.handlers.size, 0);
  assert.equal(state.windowEvents.size, 0);
  assert.equal(state.documentEvents.size, 0);
  assert.equal(state.calls.stopped, 1);
  assert.equal(state.calls.cancelled, 1);
  assert.equal(state.input.conversationQueryRef.current, 4);
  assert.equal(state.input.conversationEventsRef.current, null);
});
test('dependency list retains identity guards and the stable ref objects supplied by state', () => {
  const state = fixture();
  assert.deepEqual(state.dependencies(), [
    state.input.isAuthenticated, state.input.user, state.input.applyMessage, state.input.checkSession,
    state.input.historyRequests, state.input.socketRef, state.input.synchronizeRef,
    state.input.conversationQueryRef, state.input.conversationEventsRef,
  ]);
});
