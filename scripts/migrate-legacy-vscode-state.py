#!/usr/bin/env python3
"""One-time, conservative migration for a Navigator publisher rename.

VS Code keys extension globalState by ``publisher.name``.  This utility copies
the legacy extension's state to the formal publisher identity only when the
formal identity has no Navigator content.  A SQLite backup is made first.
Close VS Code before running it, then reopen VS Code after it completes.
"""

import datetime
import json
import sqlite3
import sys
from pathlib import Path


LEGACY_ID = 'tangwang-local.codex-project-navigator'
FORMAL_ID = 'tangwang.codex-project-navigator'
STATE_FILE = Path.home() / 'AppData/Roaming/Code/User/globalStorage/state.vscdb'


def has_content(state):
    return any(
        bool(value)
        for key, value in state.items()
        if key != 'codexProjectNavigator.schemaVersion'
    )


def main():
    if not STATE_FILE.is_file():
        raise SystemExit(f'VS Code state database was not found: {STATE_FILE}')

    connection = sqlite3.connect(STATE_FILE, timeout=15)
    connection.execute('pragma busy_timeout=15000')
    legacy_row = connection.execute(
        'select value from ItemTable where key=?', (LEGACY_ID,),
    ).fetchone()
    formal_row = connection.execute(
        'select value from ItemTable where key=?', (FORMAL_ID,),
    ).fetchone()

    if not legacy_row:
        print('No legacy Navigator state was found; no changes made.')
        return

    legacy_state = json.loads(legacy_row[0])
    formal_state = json.loads(formal_row[0]) if formal_row else {}
    if has_content(formal_state):
        print('Formal Navigator state already contains data; no overwrite performed.')
        return

    timestamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup_path = STATE_FILE.with_name(f'{STATE_FILE.name}.navigator-migration-{timestamp}.bak')
    backup_connection = sqlite3.connect(backup_path)
    connection.backup(backup_connection)
    backup_connection.close()

    migrated_state = dict(legacy_state)
    migrated_state['codexProjectNavigator.schemaVersion'] = 1
    value = json.dumps(migrated_state, ensure_ascii=False, separators=(',', ':'))
    connection.execute('begin immediate')
    connection.execute(
        'insert into ItemTable(key,value) values(?,?) '
        'on conflict(key) do update set value=excluded.value',
        (FORMAL_ID, value),
    )
    connection.commit()
    print('Migrated legacy Navigator state to the formal extension identity.')
    print(f'Backup: {backup_path}')
    print(f'Copied fields: {len(migrated_state)}')
    print(f'Legacy subgroup projects: {len(legacy_state.get("codexProjectNavigator.subgroups", {}))}')


if __name__ == '__main__':
    main()
