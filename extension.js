'use strict';

const { NavigatorController } = require('./src/controller');
const { NavigatorTreeProvider } = require('./src/treeProvider');

async function activate(context) {
  const provider = new NavigatorTreeProvider();
  const controller = new NavigatorController(context, provider);
  await controller.start();
}

function deactivate() {}

module.exports = { activate, deactivate };
