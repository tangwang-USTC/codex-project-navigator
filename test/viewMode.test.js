'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  VIEW_MODE_COMPATIBLE,
  VIEW_MODE_EXCLUSIVE,
  normalizeViewMode,
  viewModeLabel,
  applyCodexViewMode,
} = require('../src/viewMode');

function fakeCommands(commandIds) {
  const executed = [];
  return {
    executed,
    async getCommands() { return commandIds; },
    async executeCommand(command) { executed.push(command); },
  };
}

test('normalizes and labels view modes', () => {
  assert.equal(normalizeViewMode('exclusive'), VIEW_MODE_EXCLUSIVE);
  assert.equal(normalizeViewMode('invalid'), VIEW_MODE_COMPATIBLE);
  assert.equal(viewModeLabel('exclusive'), '层级独占模式');
  assert.equal(viewModeLabel('compatible'), '层级兼容模式');
});

test('exclusive mode hides the official view paired with the visible navigator', async () => {
  const commands = fakeCommands([
    'chatgpt.sidebarView.removeView',
    'codexProjectNavigator.tasks.primary.focus',
    'chatgpt.sidebarSecondaryView.removeView',
    'codexProjectNavigator.tasks.secondary.focus',
  ]);
  const result = await applyCodexViewMode(
    commands,
    VIEW_MODE_EXCLUSIVE,
    'codexProjectNavigator.tasks.primary',
  );
  assert.equal(result.officialViewId, 'chatgpt.sidebarView');
  assert.deepEqual(commands.executed, [
    'chatgpt.sidebarView.removeView',
    'codexProjectNavigator.tasks.primary.focus',
  ]);
});

test('compatible mode restores official Codex then returns focus to navigator', async () => {
  const commands = fakeCommands([
    'chatgpt.sidebarSecondaryView.focus',
    'codexProjectNavigator.tasks.secondary.focus',
  ]);
  const result = await applyCodexViewMode(commands, VIEW_MODE_COMPATIBLE);
  assert.equal(result.officialViewId, 'chatgpt.sidebarSecondaryView');
  assert.deepEqual(commands.executed, [
    'chatgpt.sidebarSecondaryView.focus',
    'codexProjectNavigator.tasks.secondary.focus',
  ]);
});

test('mode application fails safely when VS Code view commands are unavailable', async () => {
  const commands = fakeCommands([]);
  await assert.rejects(
    () => applyCodexViewMode(commands, VIEW_MODE_EXCLUSIVE),
    /隐藏命令/,
  );
});
