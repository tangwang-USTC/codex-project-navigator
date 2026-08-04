'use strict';

const vscode = require('vscode');

const LEGACY_EXTENSION_IDS = [
  'tangwang-local.codex-project-navigator',
  'tangwang-ustc.codex-project-navigator',
];

function findInstalledLegacyExtensions(extensions = vscode.extensions) {
  return LEGACY_EXTENSION_IDS.filter((id) => Boolean(extensions.getExtension(id)));
}

async function blockOnLegacyExtensionConflict() {
  const conflicts = findInstalledLegacyExtensions();
  if (conflicts.length === 0) return false;

  const detail = conflicts.join(', ');
  const openExtensions = 'Open Extensions';
  const choice = await vscode.window.showErrorMessage(
    `Codex Project Navigator detected a legacy installation (${detail}). `
      + 'VS Code treats different publishers as different extensions, so both copies can register the same views and commands. '
      + 'Uninstall the legacy copy, keep tangwang.codex-project-navigator, and reload the window.',
    { modal: true },
    openExtensions,
  );
  if (choice === openExtensions) {
    await vscode.commands.executeCommand(
      'workbench.extensions.search',
      '@installed codex-project-navigator',
    );
  }
  return true;
}

module.exports = {
  LEGACY_EXTENSION_IDS,
  findInstalledLegacyExtensions,
  blockOnLegacyExtensionConflict,
};
