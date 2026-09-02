param(
    [switch]$Qa
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    & npm.cmd run prepare:win:store
    if ($LASTEXITCODE -ne 0) { throw "Store metadata preparation failed with exit code $LASTEXITCODE." }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\prepare-appx-assets.ps1')
    if ($LASTEXITCODE -ne 0) { throw "AppX asset preparation failed with exit code $LASTEXITCODE." }

    # electron-builder's bundled legacy makeappx can fail on machines whose side-by-side
    # runtime is different from the builder bundle. Prefer the installed Windows SDK.
    # The SDK directory is used in place; no system files are modified.
    if ([string]::IsNullOrWhiteSpace($env:ELECTRON_BUILDER_WINDOWS_KITS_PATH)) {
        $kitsRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
        $makeAppx = Get-ChildItem -LiteralPath $kitsRoot -Recurse -Filter 'makeappx.exe' -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Directory.Name -eq 'x64' } |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($null -eq $makeAppx) {
            throw 'Windows SDK makeappx.exe was not found. Install the Windows 10/11 SDK, then rerun this command.'
        }

        $sdkDirectory = $makeAppx.Directory.FullName
        $env:ELECTRON_BUILDER_WINDOWS_KITS_PATH = $sdkDirectory
    }

    $builderArgs = @(
        'electron-builder',
        '--win', 'appx',
        '-c', 'store-build-config.json',
        '-c.forceCodeSigning=false'
    )
    if ($Qa) {
        $builderArgs += '-c.win.signExecutable=false'
    }

    & npx.cmd @builderArgs
    if ($LASTEXITCODE -ne 0) { throw "AppX packaging failed with exit code $LASTEXITCODE." }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\verify-windows-store-package.ps1')
    if ($LASTEXITCODE -ne 0) { throw "Store package verification failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
}
