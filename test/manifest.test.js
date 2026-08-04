'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require('../package.json');
const controllerSource = fs.readFileSync(path.join(__dirname, '../src/controller.js'), 'utf8');

test('manifest embeds navigator views in both official Codex containers', () => {
  assert.equal(manifest.version, '1.0.2');
  assert.equal(manifest.publisher, 'tangwang');
  assert.equal(
    manifest.repository.url,
    'https://github.com/tangwang-USTC/codex-project-navigator.git',
  );
  assert.deepEqual(manifest.extensionDependencies, ['openai.chatgpt']);
  assert.equal(manifest.contributes.viewsContainers, undefined);

  const primary = manifest.contributes.views.codexViewContainer;
  const secondary = manifest.contributes.views.codexSecondaryViewContainer;
  assert.equal(primary[0].id, 'codexProjectNavigator.tasks.primary');
  assert.equal(primary[0].when, 'chatgpt.doesNotSupportSecondarySidebar');
  assert.equal(secondary[0].id, 'codexProjectNavigator.tasks.secondary');
  assert.equal(secondary[0].when, '!chatgpt.doesNotSupportSecondarySidebar');
});

test('manifest ships Chinese-default and English localization in one package', () => {
  const defaultMessages = require('../package.nls.json');
  const englishMessages = require('../package.nls.en.json');
  const englishRuntime = require('../l10n/bundle.l10n.en.json');
  assert.equal(manifest.l10n, './l10n');
  assert.equal(manifest.displayName, 'Codex Project Navigator');
  assert.equal(defaultMessages['extension.displayName'], 'Codex Project Navigator');
  assert.equal(englishMessages['extension.displayName'], 'Codex Project Navigator');
  assert.equal(englishRuntime['分组 {0}'], 'Group {0}');
  assert.equal(englishRuntime['子分组 {0}'], 'Subgroup {0}');
});

test('manifest defaults task clicks to the native Codex conversation UI', () => {
  const openMode = manifest.contributes.configuration.properties['codexProjectNavigator.defaultOpenMode'];
  assert.equal(openMode.default, 'native');
  assert.deepEqual(openMode.enum, ['native', 'terminal', 'menu', 'copyId']);
  assert.ok(manifest.contributes.commands.some(
    (item) => item.command === 'codexProjectNavigator.openTaskNative',
  ));
  assert.ok(manifest.contributes.menus['view/item/context'].some(
    (item) => item.command === 'codexProjectNavigator.openTaskNative' && item.group === 'inline@1',
  ));
});

test('manifest exposes compatible and exclusive modes with a quick toggle command', () => {
  const mode = manifest.contributes.configuration.properties['codexProjectNavigator.viewMode'];
  assert.equal(mode.default, 'exclusive');
  assert.deepEqual(mode.enum, ['compatible', 'exclusive']);
  assert.ok(manifest.contributes.commands.some(
    (item) => item.command === 'codexProjectNavigator.toggleViewMode',
  ));
  assert.ok(manifest.contributes.menus['view/title'].some(
    (item) => item.command === 'codexProjectNavigator.toggleViewMode',
  ));
});

test('manifest exposes safe move, pin and archived-delete actions with seven recent tasks', () => {
  const commands = new Set(manifest.contributes.commands.map((item) => item.command));
  assert.ok(commands.has('codexProjectNavigator.moveToProjectGroup'));
  assert.ok(commands.has('codexProjectNavigator.pinTask'));
  assert.ok(commands.has('codexProjectNavigator.unpinTask'));
  assert.ok(commands.has('codexProjectNavigator.deleteTask'));
  assert.ok(commands.has('codexProjectNavigator.moveProject'));
  assert.ok(commands.has('codexProjectNavigator.moveProjectUp'));
  assert.ok(commands.has('codexProjectNavigator.moveProjectDown'));
  assert.ok(commands.has('codexProjectNavigator.promoteProject'));
  assert.ok(commands.has('codexProjectNavigator.promoteGroupToProject'));
  assert.ok(commands.has('codexProjectNavigator.createSubgroup'));
  assert.ok(commands.has('codexProjectNavigator.createTask'));
  assert.ok(commands.has('codexProjectNavigator.addTaskFolder'));
  assert.ok(commands.has('codexProjectNavigator.addExistingTask'));
  assert.ok(commands.has('codexProjectNavigator.renameSubgroup'));
  assert.ok(commands.has('codexProjectNavigator.removeSubgroup'));

  const menus = manifest.contributes.menus['view/item/context'];
  assert.ok(menus.some((item) => (
    item.command === 'codexProjectNavigator.moveToProjectGroup'
    && item.when.includes('viewItem =~ /^task\\./')
  )));
  assert.ok(menus.some((item) => (
    item.command === 'codexProjectNavigator.deleteTask'
    && item.when.includes('task\\.archived')
  )));
  assert.ok(menus.some((item) => (
    item.command === 'codexProjectNavigator.promoteProject'
    && item.when.includes('project.nested')
  )));
  assert.ok(menus.some((item) => (
    item.command === 'codexProjectNavigator.promoteGroupToProject'
    && item.when.includes('viewItem == group')
  )));
  assert.ok(menus.some((item) => (
    item.command === 'codexProjectNavigator.createTask'
    && item.when.includes('project\\.')
    && item.when.includes('subgroup')
  )));
  assert.ok(menus.some((item) => (
    item.command === 'codexProjectNavigator.addTaskFolder'
    && item.when.includes('project\\.')
    && item.when.includes('subgroup')
  )));
  assert.ok(menus.some((item) => (
    item.command === 'codexProjectNavigator.addExistingTask'
    && item.when.includes('project\\.')
    && item.when.includes('subgroup')
  )));
  assert.ok(menus.some((item) => (
    item.command === 'codexProjectNavigator.createSubgroup'
    && item.when.includes('viewItem == group')
    && !item.when.includes('groupingDepth')
  )));
  assert.equal(
    manifest.contributes.configuration.properties['codexProjectNavigator.recentLimit'].default,
    7,
  );
  assert.deepEqual(
    manifest.contributes.configuration.properties['codexProjectNavigator.groupingDepth'].enum,
    [2, 3, 4],
  );
  assert.equal(
    manifest.contributes.configuration.properties['codexProjectNavigator.autoRefreshSeconds'].default,
    0,
  );
});

test('all navigator view menus target both embedded view ids', () => {
  for (const location of ['view/title', 'view/item/context']) {
    for (const menu of manifest.contributes.menus[location]) {
      assert.match(menu.when, /view =~ \/\^codexProjectNavigator\\\.tasks\//);
    }
  }
});

test('recent activity is event-driven with polling disabled by default', () => {
  assert.match(controllerSource, /isThreadActivityNotification\(message\.method\)/);
  assert.match(controllerSource, /createFileSystemWatcher/);
  assert.match(controllerSource, /sessions\/\*\*\/\*\.jsonl/);
  assert.match(controllerSource, /get\('autoRefreshSeconds', 0\)/);
});

test('controller protects persisted hierarchy state across compatible upgrades', () => {
  assert.match(controllerSource, /CURRENT_STATE_SCHEMA_VERSION/);
  assert.match(controllerSource, /await this\._repairPersistedState\(\)/);
  assert.match(controllerSource, /_normalizeSubgroups\(rawSubgroups\)/);
});

test('controller creates native threads and supports searchable multi-add placement', () => {
  assert.match(controllerSource, /client\.startThread\(\{ cwd \}\)/);
  assert.match(controllerSource, /addTaskFolder\(node\)/);
  assert.match(controllerSource, /path\.basename\(path\.normalize\(cwd\)\)/);
  assert.match(controllerSource, /client\.renameThread\(raw\.id, folderName\)/);
  assert.match(controllerSource, /canPickMany: true/);
  assert.match(controllerSource, /matchOnDescription: true/);
  assert.match(controllerSource, /matchOnDetail: true/);
  assert.match(controllerSource, /update\('groupingDepth', 4, vscode\.ConfigurationTarget\.Global\)/);
});
