# Security Policy

## Supported version

Security updates are provided for the latest `1.x` release.

## Security boundary

The extension runs locally in the VS Code extension host, starts the locally installed official Codex App Server, and stores only navigation preferences in VS Code global state. It has no independent telemetry or remote service. It must not modify official extension files, collect publisher credentials, or silently fall back to shell execution.

Cross-project moves change only the Navigator hierarchy and do not rewrite a Codex thread's original working directory. Permanent deletion is exposed only for archived tasks, requires an explicit modal confirmation, and uses the official `thread/delete` method.

## Reporting

Use [GitHub private vulnerability reporting](https://github.com/tangwang-USTC/codex-project-navigator/security/advisories/new) for security-sensitive reports. Do not include access tokens, thread contents, scientific data, credentials, or other secrets in a public issue.

For non-sensitive defects and compatibility reports, use the public [issue tracker](https://github.com/tangwang-USTC/codex-project-navigator/issues).
