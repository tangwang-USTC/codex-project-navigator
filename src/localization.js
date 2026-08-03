'use strict';

const vscode = require('vscode');

function fallbackFormat(message, args) {
  return String(message).replace(/\{(\d+)\}/g, (match, index) => (
    Number(index) < args.length ? String(args[Number(index)]) : match
  ));
}

function t(message, ...args) {
  if (vscode.l10n && typeof vscode.l10n.t === 'function') {
    return vscode.l10n.t(message, ...args);
  }
  return fallbackFormat(message, args);
}

module.exports = { t, fallbackFormat };
