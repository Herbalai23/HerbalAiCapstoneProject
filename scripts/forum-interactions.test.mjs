import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from '../herbalaifrontend/node_modules/typescript/lib/typescript.js';

const helperSource = await readFile(new URL('../herbalaifrontend/lib/forum-comments.ts', import.meta.url), 'utf8');
const source = await readFile(new URL('../herbalaifrontend/app/community/[id]/page.tsx', import.meta.url), 'utf8');
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const helpers = {};
new Function('exports', compile(helperSource))(helpers);
const { newestForumComments } = helpers;
const syntax = ts.createSourceFile('forum.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expression = predicate => {
  let found;
  const visit = node => { if (predicate(node)) found = node; ts.forEachChild(node, visit); };
  visit(syntax);
  assert.ok(found, 'Missing forum implementation');
  return found;
};
const parent = { id: 1, threadId: 7, date: '2026-10-12T00:00:00Z', parentCommentId: null, content: 'Older parent' };
const reply = { id: 2, threadId: 7, date: '2026-10-12T01:00:00Z', parentCommentId: 1, content: 'Newer reply' };

test('newest comments precede older comments without modifying stored data or losing reply context', () => {
  const comments = Object.freeze([Object.freeze(parent), Object.freeze(reply)]);
  const result = newestForumComments(comments);
  assert.deepEqual(result.map(comment => comment.id), [2, 1]);
  assert.equal(result[0].parentCommentId, result[1].id);
  assert.deepEqual(comments.map(comment => comment.id), [1, 2]);
});

test('equal timestamps use descending IDs consistently with backend ordering', () => {
  const result = newestForumComments([{ ...parent, id: 1 }, { ...parent, id: 9 }, { ...parent, id: 3 }]);
  assert.deepEqual(result.map(comment => comment.id), [9, 3, 1]);
});

test('timestamps sort by instant, not lexicographic offset spelling', () => {
  const result = newestForumComments([{ ...parent, id: 1, date: '2026-10-12T08:30:00+08:00' }, { ...parent, id: 2, date: '2026-10-12T01:00:00Z' }]);
  assert.deepEqual(result.map(comment => comment.id), [2, 1]);
  assert.deepEqual(newestForumComments([]), []);
});

test('invalid dates cannot break rendering and fall behind normal recent comments', () => {
  assert.deepEqual(newestForumComments([{ ...parent, date: 'invalid' }, reply]).map(comment => comment.id), [2, 1]);
});

test('the actual memoized render list uses newest-first sorting without changing parent lookup', () => {
  const ordered = expression(node => ts.isVariableDeclaration(node) && node.name.getText(syntax) === 'orderedComments');
  const render = new Function('React', 'newestForumComments', 'comments', compile(`const result = ${ordered.initializer.getText(syntax)};`) + '; return result;');
  assert.deepEqual(render({ useMemo: callback => callback() }, newestForumComments, [parent, reply]).map(comment => comment.id), [2, 1]);
  assert.match(source, /orderedComments\.map\(\(comment\) =>/);
  assert.match(source, /comments\.find\(\(candidate\) => candidate\.id === comment\.parentCommentId\)/);
});

test('out-of-order realtime comments render at the top and duplicate events do not increase the count', () => {
  let comments = [parent, reply];
  let thread = { replies: 2 };
  const listener = expression(node => ts.isCallExpression(node) && node.expression.getText(syntax) === 'socket.on'
    && node.arguments[0]?.text === 'forum:comment').arguments[1].getText(syntax);
  const callback = new Function('threadId', 'commentIdsRef', 'setComments', 'setThread', compile(`const listener = ${listener};`) + '; return listener;')(
    7, { current: new Set([1, 2]) }, update => { comments = update(comments); }, update => { thread = update(thread); },
  );
  const newest = { ...reply, id: 3, date: '2026-10-12T02:00:00Z' };
  callback({ threadId: 7, comment: newest });
  callback({ threadId: 7, comment: newest });
  callback({ threadId: 8, comment: { ...newest, id: 4 } });
  assert.deepEqual(newestForumComments(comments).map(comment => comment.id), [3, 2, 1]);
  assert.equal(thread.replies, 3);
});

test('a locally submitted comment is immediately shown first, without requiring a reload', async () => {
  let comments = [parent, reply];
  const declaration = expression(node => ts.isVariableDeclaration(node) && node.name.getText(syntax) === 'handleSubmitComment');
  const context = { commentContent: 'Newest comment', isSubmittingComment: false, id: '7', replyingTo: null,
    commentIdsRef: { current: new Set([1, 2]) }, setIsSubmittingComment() {}, setCommentContent() {}, setReplyingTo() {}, setThread() {},
    setComments: update => { comments = update(comments); },
    api: { post: async () => ({ data: { status: 'success', data: { comment: { ...reply, id: 3, date: '2026-10-12T02:00:00Z' } } } }) },
  };
  const submit = new Function(...Object.keys(context), compile(`const submit = ${declaration.initializer.getText(syntax)};`) + ';return submit;')(...Object.values(context));
  await submit({ preventDefault() {} });
  assert.deepEqual(newestForumComments(comments).map(comment => comment.id), [3, 2, 1]);
});
