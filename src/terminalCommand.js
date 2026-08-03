'use strict';

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quotePosix(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function buildResumeCommand(executable, thread, platform = process.platform) {
  const quote = platform === 'win32' ? quotePowerShell : quotePosix;
  const parts = [quote(executable)];
  if (thread.cwd) parts.push('--cd', quote(thread.cwd));
  parts.push('resume', quote(thread.id));
  return parts.join(' ');
}

module.exports = { quotePowerShell, quotePosix, buildResumeCommand };
