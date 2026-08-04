'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'vscode') return { extensions: { getExtension: () => undefined } };
  return originalLoad.call(this, request, parent, isMain);
};
const {
  LEGACY_EXTENSION_IDS,
  findInstalledLegacyExtensions,
} = require('../src/legacyConflict');
Module._load = originalLoad;

test('legacy publisher identities are detected before activation', () => {
  assert.deepEqual(LEGACY_EXTENSION_IDS, [
    'tangwang-local.codex-project-navigator',
    'tangwang-ustc.codex-project-navigator',
  ]);
  const installed = new Set(['tangwang-local.codex-project-navigator']);
  const extensions = { getExtension: (id) => (installed.has(id) ? { id } : undefined) };
  assert.deepEqual(
    findInstalledLegacyExtensions(extensions),
    ['tangwang-local.codex-project-navigator'],
  );
});

test('the canonical publisher does not create a legacy conflict', () => {
  const extensions = {
    getExtension: (id) => (id === 'tangwang.codex-project-navigator' ? { id } : undefined),
  };
  assert.deepEqual(findInstalledLegacyExtensions(extensions), []);
});
