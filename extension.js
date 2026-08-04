'use strict';

const { NavigatorController } = require('./src/controller');
const { NavigatorTreeProvider } = require('./src/treeProvider');
const { blockOnLegacyExtensionConflict } = require('./src/legacyConflict');

async function activate(context) {
  if (await blockOnLegacyExtensionConflict()) return;
  const provider = new NavigatorTreeProvider();
  const controller = new NavigatorController(context, provider);
  await controller.start();
}

function deactivate() {}

module.exports = { activate, deactivate };
