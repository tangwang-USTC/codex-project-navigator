# Contributing

Thank you for contributing to Codex Project Navigator.

## Development

```powershell
npm ci
npm test
npm run check
npm run package
```

Keep navigation-only state separate from Codex thread data. Changes must not modify files inside the official `openai.chatgpt` extension or silently change a thread's original working directory.

User-facing source strings are written in Chinese and localized through `vscode.l10n`. Run `npm run l10n:generate`; packaging fails when an English runtime translation is missing.

## Versioning

The project uses `MAJOR.MINOR.PATCH`:

- `PATCH`: small compatible iterations and fixes;
- `MINOR`: a completed feature stage or notable compatible capability;
- `MAJOR`: a formal generation upgrade or intentionally incompatible change.

Pull requests should include a concise explanation, relevant tests, and user-facing documentation when behavior changes.
