'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  NATIVE_VIEW_TYPE,
  nativeThreadUriParts,
  supportsNativeConversationEditor,
  openNativeThread,
} = require('../src/nativeConversation');

test('builds the official Codex local conversation URI', () => {
  assert.deepEqual(nativeThreadUriParts('abc-123'), {
    scheme: 'openai-codex',
    authority: 'route',
    path: '/local/abc-123',
  });
  assert.throws(() => nativeThreadUriParts('  '), /不能为空/);
});

test('detects the official native conversation editor contribution', () => {
  const extension = {
    packageJSON: { contributes: { customEditors: [{ viewType: NATIVE_VIEW_TYPE }] } },
  };
  assert.equal(supportsNativeConversationEditor(extension), true);
  assert.equal(supportsNativeConversationEditor({ packageJSON: {} }), false);
});

test('opens a thread in the native Codex editor with touch-friendly UI', async () => {
  const calls = [];
  const uri = { toString: () => 'openai-codex://route/local/abc-123' };
  const vscode = {
    Uri: { from: (parts) => (calls.push(['uri', parts]), uri) },
    ViewColumn: { Active: -1 },
    window: { activeTextEditor: undefined },
    commands: {
      executeCommand: async (...args) => calls.push(['command', ...args]),
    },
  };
  const extension = {
    isActive: false,
    activate: async () => calls.push(['activate']),
    packageJSON: { contributes: { customEditors: [{ viewType: NATIVE_VIEW_TYPE }] } },
  };

  const result = await openNativeThread(vscode, extension, 'abc-123');

  assert.equal(result, uri);
  assert.deepEqual(calls[0], ['activate']);
  assert.deepEqual(calls[1], ['uri', nativeThreadUriParts('abc-123')]);
  assert.equal(calls[2][1], 'vscode.openWith');
  assert.equal(calls[2][3], NATIVE_VIEW_TYPE);
  assert.deepEqual(calls[2][4], {
    viewColumn: -1,
    preserveFocus: false,
    preview: false,
  });
});
