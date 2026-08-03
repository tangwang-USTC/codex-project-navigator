'use strict';

const { AppServerClient } = require('../src/appServerClient');

async function main() {
  const executable = process.argv[2] || 'codex';
  const client = new AppServerClient(executable, {
    requestTimeoutMs: 30000,
    log: (line) => process.stderr.write(`${line}\n`),
  });
  try {
    await client.connect();
    const [active, archived] = await Promise.all([
      client.listThreads({ archived: false, sourceKinds: ['vscode', 'cli', 'appServer'], maxTasks: 5 }),
      client.listThreads({ archived: true, sourceKinds: ['vscode', 'cli', 'appServer'], maxTasks: 5 }),
    ]);
    process.stdout.write(JSON.stringify({
      activeCount: active.length,
      archivedCount: archived.length,
      sample: active[0] ? {
        id: active[0].id,
        cwd: active[0].cwd,
        hasName: Boolean(active[0].name),
        isPinned: Boolean(active[0].isPinned),
        recencyAt: active[0].recencyAt,
      } : null,
    }, null, 2));
  } finally {
    client.dispose();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
