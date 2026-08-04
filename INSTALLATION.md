# Codex Project Navigator installation and migration

Canonical product name: **Codex Project Navigator**  
Canonical extension ID: `tangwang.codex-project-navigator`

## Recommended installation

```powershell
code --install-extension tangwang.codex-project-navigator --force
```

For a downloaded package:

```powershell
code --install-extension "C:\full\path\codex-project-navigator-1.0.1.vsix" --force
```

The Marketplace website launches `vscode:extension/tangwang.codex-project-navigator`. If Windows or the browser reports that this address format cannot be resolved, use the VS Code Extensions view, **Extensions: Install from VSIX...**, or the CLI command above. The URL-protocol association belongs to the VS Code installation, not to this extension. The official Windows User/System installer is preferred when browser-to-VS Code links are required; portable ZIP installations can use the CLI/VSIX path directly.

## Diagnose duplicate identities

```powershell
code --list-extensions --show-versions | Select-String codex-project-navigator
```

Only the canonical entry should remain. These are legacy identities:

- `tangwang-local.codex-project-navigator`
- `tangwang-ustc.codex-project-navigator`

```powershell
code --uninstall-extension tangwang-local.codex-project-navigator
code --uninstall-extension tangwang-ustc.codex-project-navigator
code --install-extension tangwang.codex-project-navigator --force
```

Repository users can run the audited helper. It refuses to remove legacy copies unless `-RemoveLegacy` is explicitly supplied:

```powershell
.\scripts\install-or-repair.ps1 -RemoveLegacy
```

Use `-VsixPath <path>` for an offline package. The helper does not delete Codex threads or Navigator global-state data.

## 中文说明

统一产品名为 **Codex Project Navigator**，正式扩展 ID 为 `tangwang.codex-project-navigator`。网页 Install 按钮依赖 Windows 的 `vscode:` 协议关联；出现“无法解析的链接格式”时，直接在 VS Code 中搜索正式 ID、使用 **Extensions: Install from VSIX...**，或运行上面的 `code --install-extension` 命令。

旧 publisher 会形成不同扩展身份而不是升级覆盖。只保留正式 ID；卸载两个旧 ID 后执行 **Developer: Reload Window**。
