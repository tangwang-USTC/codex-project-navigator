# Privacy

Codex Project Navigator 1.0.0 is an offline local extension. It does not include third-party telemetry, advertising, analytics, or an independent network service.

The extension communicates with the locally installed official Codex App Server to create, list and manage Codex threads. Depending on the user's official Codex configuration, the official Codex product may communicate with its own services under its own terms and privacy policy; this extension does not change or proxy that relationship.

The extension may process thread identifiers, titles, previews, timestamps, original project paths, pinned/archive state, custom groups, Navigator-only project assignments, and project display aliases. Custom groups, project assignments, and aliases are stored in VS Code extension global state on the local machine. It does not intentionally collect passwords, access tokens, publisher credentials, document contents, or scientific datasets.

No data is sent by this extension to the extension author. Permanently deleting an archived task invokes the official Codex App Server `thread/delete` method and cannot be undone; the confirmation dialog also warns that descendant threads may be deleted. Disabling or uninstalling the extension stops its processing but does not delete official Codex threads.

GitHub source and VSIX releases are public. Visual Studio Marketplace publication remains a separate release channel and is not implied by a GitHub release.
