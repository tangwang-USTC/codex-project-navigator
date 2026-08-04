#!/usr/bin/env python3
"""One-time, conservative migration for a Navigator publisher rename.

VS Code keys extension globalState by ``publisher.name``. This utility merges
the legacy extension's state into the formal publisher identity, preserving
the formal identity's entries if both identities changed the same item. A
SQLite backup is made first. Close VS Code before running it, then reopen it.
"""

import datetime
import json
import sqlite3
from pathlib import Path


LEGACY_ID = 'tangwang-local.codex-project-navigator'
FORMAL_ID = 'tangwang.codex-project-navigator'
STATE_FILE = Path.home() / 'AppData/Roaming/Code/User/globalStorage/state.vscdb'


def merge_unique(current, legacy):
    merged = []
    for value in [*(current if isinstance(current, list) else []), *(legacy if isinstance(legacy, list) else [])]:
        if value not in merged:
            merged.append(value)
    return merged


def merge_keyed_lists(current, legacy):
    merged = dict(legacy) if isinstance(legacy, dict) else {}
    for key, value in (current.items() if isinstance(current, dict) else []):
        merged[key] = merge_unique(value, merged.get(key, []))
    return merged


def merge_subgroups(current, legacy):
    merged = dict(legacy) if isinstance(legacy, dict) else {}
    for project, groups in (current.items() if isinstance(current, dict) else []):
        merged[project] = merge_keyed_lists(groups, merged.get(project, {}))
    return merged


def merge_state(legacy, formal):
    merged = dict(legacy)
    # Formal values take precedence for the same thread, project, or label.
    for key, value in formal.items():
        if key == 'codexProjectNavigator.groups':
            merged[key] = merge_keyed_lists(value, legacy.get(key, {}))
        elif key == 'codexProjectNavigator.subgroups':
            merged[key] = merge_subgroups(value, legacy.get(key, {}))
        elif key == 'codexProjectNavigator.projectOrder':
            merged[key] = merge_unique(value, legacy.get(key, []))
        elif isinstance(value, dict):
            merged[key] = {**legacy.get(key, {}), **value}
        else:
            merged[key] = value
    merged['codexProjectNavigator.schemaVersion'] = 1
    return merged


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

    timestamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup_path = STATE_FILE.with_name(f'{STATE_FILE.name}.navigator-migration-{timestamp}.bak')
    backup_connection = sqlite3.connect(backup_path)
    connection.backup(backup_connection)
    backup_connection.close()

    migrated_state = merge_state(legacy_state, formal_state)
    value = json.dumps(migrated_state, ensure_ascii=False, separators=(',', ':'))
    connection.execute('begin immediate')
    connection.execute(
        'insert into ItemTable(key,value) values(?,?) '
        'on conflict(key) do update set value=excluded.value',
        (FORMAL_ID, value),
    )
    connection.commit()
    print('Merged legacy Navigator state into the formal extension identity.')
    print(f'Backup: {backup_path}')
    print(f'Copied fields: {len(migrated_state)}')
    print(f'Legacy subgroup projects: {len(legacy_state.get("codexProjectNavigator.subgroups", {}))}')


if __name__ == '__main__':
    main()
