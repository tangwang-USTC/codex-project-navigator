'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDirectory = path.join(root, 'src');
const sourceFiles = fs.readdirSync(sourceDirectory)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(sourceDirectory, name));
const pattern = /\b(?:t|translate)\('((?:\\.|[^'\\])*)'/g;
const messages = new Set();

for (const filename of sourceFiles) {
  const source = fs.readFileSync(filename, 'utf8');
  for (const match of source.matchAll(pattern)) {
    const decoded = JSON.parse(`"${match[1].replace(/"/g, '\\"').replace(/\\'/g, "'")}"`);
    messages.add(decoded);
  }
}

const ordered = [...messages].sort((left, right) => left.localeCompare(right, 'zh-CN'));
const sourceBundle = Object.fromEntries(ordered.map((message) => [message, message]));
const englishPath = path.join(root, 'l10n', 'bundle.l10n.en.json');
const englishBundle = JSON.parse(fs.readFileSync(englishPath, 'utf8'));
const missing = ordered.filter((message) => !Object.hasOwn(englishBundle, message));
if (missing.length > 0) {
  throw new Error(`Missing English runtime translations:\n${missing.join('\n')}`);
}

fs.writeFileSync(
  path.join(root, 'l10n', 'bundle.l10n.json'),
  `${JSON.stringify(sourceBundle, null, 2)}\n`,
  'utf8',
);
console.log(`Generated ${ordered.length} source messages; English bundle is complete.`);
