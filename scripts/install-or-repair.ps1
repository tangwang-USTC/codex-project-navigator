[CmdletBinding()]
param(
    [string]$VsixPath,
    [switch]$RemoveLegacy,
    [string]$CodeCommand = 'code'
)

$ErrorActionPreference = 'Stop'
$canonicalId = 'tangwang.codex-project-navigator'
$legacyIds = @(
    'tangwang-local.codex-project-navigator',
    'tangwang-ustc.codex-project-navigator'
)

if (-not (Get-Command $CodeCommand -ErrorAction SilentlyContinue)) {
    throw "VS Code CLI '$CodeCommand' was not found. Open VS Code and use Extensions: Install from VSIX..., or reinstall the official Windows User/System installer so the code command is available."
}

$installed = @(& $CodeCommand --list-extensions)
$conflicts = @($legacyIds | Where-Object { $installed -contains $_ })
if ($conflicts.Count -gt 0 -and -not $RemoveLegacy) {
    throw "Legacy extension(s) detected: $($conflicts -join ', '). Re-run with -RemoveLegacy to remove only those registered legacy IDs."
}

foreach ($id in $conflicts) {
    & $CodeCommand --uninstall-extension $id
    if ($LASTEXITCODE -ne 0) { throw "Failed to uninstall legacy extension: $id" }
}

if ($VsixPath) {
    $resolved = (Resolve-Path -LiteralPath $VsixPath).Path
    & $CodeCommand --install-extension $resolved --force
} else {
    & $CodeCommand --install-extension $canonicalId --force
}
if ($LASTEXITCODE -ne 0) { throw 'Codex Project Navigator installation failed.' }

$verified = @(& $CodeCommand --list-extensions --show-versions)
if (-not ($verified -match '^tangwang\.codex-project-navigator@')) {
    throw 'Installation completed without a verifiable canonical extension entry.'
}
if ($legacyIds | Where-Object { $verified -match "^$([regex]::Escape($_))@" }) {
    throw 'A legacy extension identity is still installed.'
}

Write-Output ($verified | Where-Object { $_ -match 'codex-project-navigator' })
Write-Output 'Run Developer: Reload Window in VS Code.'
