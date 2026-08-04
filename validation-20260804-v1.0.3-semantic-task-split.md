# Codex Project Navigator 1.0.3 validation

- Validation date: `2026-08-04`
- Base release: `v1.0.2` (`225a106`)
- Version: `1.0.3`
- VSIX: `codex-project-navigator-1.0.3.vsix`
- Size: `64945` bytes
- SHA-256: `1965CF8A5B8CA2BA1566583536669EF4390B22DC8B8E0956423A1AFD9692D779`

## Scope

- Persist Navigator-created empty threads in local extension state when App Server omits them from `thread/list`.
- Add **Add Task by ID** for threads readable through `thread/read`, including curated semantic task splits.
- Remove local registration when a task is permanently deleted.
- Keep navigation registration separate from official Codex conversation history.

## Verification

- Static JavaScript checks: passed.
- Unit tests: `38/38` passed.
- Chinese-default and English runtime localization generation: passed with `163` source messages.
- VSIX content audit: `32` files; tests, validation records, personal task registry, Git metadata, nested VSIX files, and build-only localization script excluded.
- Isolated-profile VSIX installation: passed; enumerated `tangwang.codex-project-navigator@1.0.3`.

## Release boundary

The release is based on the already-public `v1.0.2` source and contains only the semantic-split/empty-thread discovery increment plus release metadata. It does not include Tiangong project files, personal thread IDs, or unrelated workspace changes.
