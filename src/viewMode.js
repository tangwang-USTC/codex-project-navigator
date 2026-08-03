'use strict';

const VIEW_MODE_COMPATIBLE = 'compatible';
const VIEW_MODE_EXCLUSIVE = 'exclusive';

const VIEW_PAIRS = [
  {
    navigator: 'codexProjectNavigator.tasks.secondary',
    official: 'chatgpt.sidebarSecondaryView',
  },
  {
    navigator: 'codexProjectNavigator.tasks.primary',
    official: 'chatgpt.sidebarView',
  },
];

function normalizeViewMode(value) {
  return value === VIEW_MODE_EXCLUSIVE ? VIEW_MODE_EXCLUSIVE : VIEW_MODE_COMPATIBLE;
}

function viewModeLabel(mode, translate = (message) => message) {
  return normalizeViewMode(mode) === VIEW_MODE_EXCLUSIVE
    ? translate('层级独占模式')
    : translate('层级兼容模式');
}

async function applyCodexViewMode(commands, mode, preferredNavigatorId, translate = (message) => message) {
  const normalized = normalizeViewMode(mode);
  const available = new Set(await commands.getCommands(true));
  const pairs = orderPairs(preferredNavigatorId);
  const suffix = normalized === VIEW_MODE_EXCLUSIVE ? '.removeView' : '.focus';
  const pair = pairs.find((item) => available.has(`${item.official}${suffix}`));

  if (!pair) {
    throw new Error(
      normalized === VIEW_MODE_EXCLUSIVE
        ? translate('当前 VS Code 未提供官方 Codex View 的隐藏命令')
        : translate('当前 VS Code 未提供官方 Codex View 的恢复命令'),
    );
  }

  const actionCommand = `${pair.official}${suffix}`;
  await commands.executeCommand(actionCommand);

  const navigatorFocusCommand = `${pair.navigator}.focus`;
  if (available.has(navigatorFocusCommand)) {
    await commands.executeCommand(navigatorFocusCommand);
  }

  return {
    mode: normalized,
    officialViewId: pair.official,
    navigatorViewId: pair.navigator,
    actionCommand,
  };
}

function orderPairs(preferredNavigatorId) {
  if (!preferredNavigatorId) return [...VIEW_PAIRS];
  return [...VIEW_PAIRS].sort((a, b) => {
    if (a.navigator === preferredNavigatorId) return -1;
    if (b.navigator === preferredNavigatorId) return 1;
    return 0;
  });
}

module.exports = {
  VIEW_MODE_COMPATIBLE,
  VIEW_MODE_EXCLUSIVE,
  VIEW_PAIRS,
  normalizeViewMode,
  viewModeLabel,
  applyCodexViewMode,
};
