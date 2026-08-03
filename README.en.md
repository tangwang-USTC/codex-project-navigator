# Codex Project Navigator

[中文](README.md) | [English](README.en.md)

An independent VS Code tree-view extension embedded in the official Codex sidebar. It organizes local Codex conversations in a sortable, nestable project hierarchy, connects directly to the official `codex app-server`, and does not modify `openai.chatgpt`.

> This is an independent, unofficial open-source extension. It is not affiliated with, endorsed by, or sponsored by OpenAI. Codex, OpenAI, and related marks belong to their respective owners.

Chinese is the default source language. When VS Code uses an English display language, the extension automatically loads English commands, settings, and runtime UI. GitHub does not provide a repository-wide content-language switch, so the Chinese and English READMEs link to each other and share one codebase and VSIX.

## Features

- Recent 7 tasks, pinned tasks, project tree, archived tasks, and event-driven recent activity updates
- Sortable, nestable projects that can become child projects or be promoted back to the top level
- Two levels (project → task), three levels (project → group → task), or four levels (project → group → subgroup → task)
- Search by task title, preview, ID, project path, project alias, or group
- Rename, pin/unpin, archive/restore, move, and permanently delete archived tasks from context menus
- Move tasks to any project/group without changing the thread's original working directory
- Create an empty Codex task from a project, group, or subgroup through the official App Server and open it in the native conversation editor
- Search and multi-select existing active tasks from a project, group, or subgroup context menu
- Continue a task in the official native Codex conversation editor with model selection, approval controls, and touch-friendly input
- Native conversation, terminal `codex resume`, copy-ID, and official-sidebar open modes
- Compatible hierarchy mode and exclusive hierarchy mode with a one-command toggle
- Automatic default names for new groups and subgroups: Group 1, Group 2, Subgroup 1, and so on

Example hierarchy:

```text
Project
├─ Group 1
│  ├─ Subgroup 1
│  │  ├─ Task 1
│  │  └─ Task 2
│  └─ Subgroup 2
└─ Group 2
```

Task 1 and Task 2 are documentation examples only. The extension never replaces existing Codex conversation titles with sample names.

## Installation and use

1. Download the latest `.vsix` from [GitHub Releases](https://github.com/tangwang-USTC/codex-project-navigator/releases), run **Extensions: Install from VSIX...**, then run **Developer: Reload Window**.
2. Open the official **Codex** icon in the Activity Bar.
3. Expand **Projects and Tasks** below the official chat interface.
4. Click a task to continue it in the native Codex conversation editor.
5. Use the task context menu to rename, pin, archive, move, copy its ID, or choose another open mode.
6. Permanent deletion appears only for archived tasks and requires an irreversible-action confirmation.
7. Drag a project onto another project to nest it, or drag it back to the Projects root to promote it.
8. Right-click a project, group, or subgroup to create a Codex task, add a local task folder, or move existing Codex conversations directly to that hierarchy target. Importing a folder creates a conversation with that working directory, names it after the folder, assigns it to the selected hierarchy target, and opens it.
9. Right-click a regular group to create a subgroup. The extension switches to four-level mode automatically when necessary.
10. Right-click a group to promote it, with its tasks, into an independent project.

The extension supports both the primary and secondary sidebar layouts used by the official Codex extension. It contributes an independent collapsible tree view to the same container and does not inject code into the official Webview.

## View modes

- **Exclusive hierarchy mode** (default): hides the official Codex task list and keeps Projects and Tasks as the navigation surface. Clicking a task opens the native conversation editor.
- **Compatible hierarchy mode**: shows the official Codex view and the hierarchy tree together for migration, troubleshooting, and explicit fallback.

Use the sidebar button in the Projects and Tasks title bar or run:

```text
Codex Navigator: Toggle Compatible/Exclusive Mode
```

Set `Codex Project Navigator: Grouping Depth` to `2`, `3`, or `4` to select the hierarchy depth. Switching from four levels back to three displays subgroup tasks under their parent groups without deleting subgroup data.

Recent shows the seven most recently active tasks by default. The extension listens for App Server `thread/*`, `turn/started`, and `turn/completed` notifications as well as local Codex session-storage changes. Periodic polling is disabled by default (`codexProjectNavigator.autoRefreshSeconds = 0`) and remains an optional compatibility fallback.

## Data boundary

Task titles, pinned state, archive state, and permanent deletion are synchronized through Codex App Server. Custom groups, Navigator-only cross-project assignments, project labels, project order, and project parent relationships are stored in VS Code extension global state on the local computer. Reordering, nesting, promoting, or moving a task across projects never rewrites the thread's original `cwd`.

Permanent deletion invokes the official `thread/delete` method, is available only under Archived, and cannot be undone. Descendant tasks may also be deleted, as stated in the confirmation dialog.

The official extension currently has no stable public command for opening an arbitrary task by ID in its sidebar. This extension uses the official `chatgpt.conversationEditor` and local conversation URI when available, and offers `codex resume <thread-id>` and copy-ID fallbacks without modifying official extension files.

## Compatibility

Version 1.0.0 checks the official `openai.chatgpt` extension's sidebar containers, view identifiers, tree drag-and-drop support, App Server `thread/start`/`thread/list`, thread notifications, and native conversation editor at runtime. If those integration points change, the navigator logs compatibility information and falls back safely.

## Release and versioning

Source code and installable VSIX files are published in this repository. GitHub Releases and the Visual Studio Marketplace are separate distribution channels; the initial public release uses GitHub Releases.

The project uses `MAJOR.MINOR.PATCH`:

- small compatible iterations and fixes increment `PATCH`, for example `1.0.0 → 1.0.1`;
- a completed feature stage or notable compatible capability increments `MINOR`, for example `1.0.x → 1.1.0`;
- a formal generation upgrade or intentionally incompatible change increments `MAJOR`, for example `1.x → 2.0.0`.

## Development

```powershell
npm install
npm test
npm run check
npm run package
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution requirements. Use [GitHub Issues](https://github.com/tangwang-USTC/codex-project-navigator/issues) for general support and [private vulnerability reporting](https://github.com/tangwang-USTC/codex-project-navigator/security/advisories/new) for security-sensitive reports.

## Privacy

The extension starts only the local Codex App Server and stores navigation preferences in local VS Code global state. It includes no third-party telemetry or independent network service.
