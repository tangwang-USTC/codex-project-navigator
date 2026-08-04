'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { AppServerClient, isThreadActivityNotification } = require('../src/appServerClient');

function fakeSpawn(handler) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.stdin.on('data', (chunk) => {
      for (const line of String(chunk).trim().split('\n')) {
        if (!line) continue;
        const message = JSON.parse(line);
        handler(message, (response) => child.stdout.write(`${JSON.stringify(response)}\n`));
      }
    });
    child.killed = false;
    child.kill = () => { child.killed = true; };
    return child;
  };
}

test('connect initializes protocol and listThreads paginates', async () => {
  const requests = [];
  const spawnFactory = fakeSpawn((message, reply) => {
    requests.push(message);
    if (message.method === 'initialize') reply({ id: message.id, result: { userAgent: 'test' } });
    if (message.method === 'thread/list') {
      const second = Boolean(message.params.cursor);
      reply({
        id: message.id,
        result: second
          ? { data: [{ id: 'two' }], nextCursor: null }
          : { data: [{ id: 'one' }], nextCursor: 'next' },
      });
    }
  });
  const client = new AppServerClient('codex', { spawnFactory, requestTimeoutMs: 1000 });
  await client.connect();
  const result = await client.listThreads({ archived: false, sourceKinds: ['vscode'], maxTasks: 5 });
  assert.deepEqual(result.map((item) => item.id), ['one', 'two']);
  const listRequests = requests.filter((item) => item.method === 'thread/list');
  assert.equal(listRequests[0].params.sortKey, 'recency_at');
  assert.deepEqual(listRequests[0].params.sourceKinds, ['vscode']);
  assert.equal(listRequests[1].params.cursor, 'next');
  assert.ok(requests.some((item) => item.method === 'initialized' && item.id === undefined));
  client.dispose();
});

test('mutation helpers send stable App Server methods and params', async () => {
  const requests = [];
  const spawnFactory = fakeSpawn((message, reply) => {
    requests.push(message);
    if (message.id !== undefined) reply({ id: message.id, result: {} });
  });
  const client = new AppServerClient('codex', { spawnFactory, requestTimeoutMs: 1000 });
  await client.connect();
  await client.renameThread('t1', 'New name');
  await client.setPinned('t1', true);
  await client.archiveThread('t1');
  await client.unarchiveThread('t1');
  await client.deleteThread('t1');
  assert.deepEqual(
    requests.filter((item) => item.id !== undefined).slice(1).map(({ method, params }) => ({ method, params })),
    [
      { method: 'thread/name/set', params: { threadId: 't1', name: 'New name' } },
      { method: 'thread/metadata/update', params: { threadId: 't1', isPinned: true } },
      { method: 'thread/archive', params: { threadId: 't1' } },
      { method: 'thread/unarchive', params: { threadId: 't1' } },
      { method: 'thread/delete', params: { threadId: 't1' } },
    ],
  );
  client.dispose();
});

test('startThread creates a persistent Codex thread in the selected cwd', async () => {
  const requests = [];
  const spawnFactory = fakeSpawn((message, reply) => {
    requests.push(message);
    if (message.method === 'initialize') reply({ id: message.id, result: { userAgent: 'test' } });
    if (message.method === 'thread/start') {
      reply({ id: message.id, result: { thread: { id: 'new-thread', cwd: 'D:\\Workspace' } } });
    }
  });
  const client = new AppServerClient('codex', { spawnFactory, requestTimeoutMs: 1000 });
  await client.connect();
  const thread = await client.startThread({ cwd: 'D:\\Workspace' });
  assert.equal(thread.id, 'new-thread');
  assert.deepEqual(
    requests.find((item) => item.method === 'thread/start').params,
    { cwd: 'D:\\Workspace' },
  );
  client.dispose();
});

test('readThread loads a task that thread/list may omit', async () => {
  const requests = [];
  const spawnFactory = fakeSpawn((message, reply) => {
    requests.push(message);
    if (message.method === 'initialize') reply({ id: message.id, result: { userAgent: 'test' } });
    if (message.method === 'thread/read') {
      reply({ id: message.id, result: { thread: { id: 'hidden-thread', cwd: 'D:\\Workspace' } } });
    }
  });
  const client = new AppServerClient('codex', { spawnFactory, requestTimeoutMs: 1000 });
  await client.connect();
  const thread = await client.readThread('hidden-thread', false);
  assert.equal(thread.id, 'hidden-thread');
  assert.deepEqual(
    requests.find((item) => item.method === 'thread/read').params,
    { threadId: 'hidden-thread', includeTurns: false },
  );
  client.dispose();
});

test('recent activity listener covers thread and turn lifecycle notifications', () => {
  assert.equal(isThreadActivityNotification('thread/status/changed'), true);
  assert.equal(isThreadActivityNotification('thread/name/updated'), true);
  assert.equal(isThreadActivityNotification('turn/started'), true);
  assert.equal(isThreadActivityNotification('turn/completed'), true);
  assert.equal(isThreadActivityNotification('turn/plan/updated'), false);
  assert.equal(isThreadActivityNotification('item/agentMessage/delta'), false);
});
