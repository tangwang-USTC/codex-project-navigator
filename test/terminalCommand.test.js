'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { quotePowerShell, quotePosix, buildResumeCommand } = require('../src/terminalCommand');

test('PowerShell quoting escapes apostrophes', () => {
  assert.equal(quotePowerShell("C:\\O'Brien\\codex.exe"), "'C:\\O''Brien\\codex.exe'");
});

test('POSIX quoting escapes apostrophes', () => {
  assert.equal(quotePosix("O'Brien"), `'O'"'"'Brien'`);
});

test('resume command includes cwd and thread id', () => {
  assert.equal(
    buildResumeCommand('codex.exe', { id: 'abc', cwd: 'C:\\My Work' }, 'win32'),
    "'codex.exe' --cd 'C:\\My Work' resume 'abc'",
  );
});
