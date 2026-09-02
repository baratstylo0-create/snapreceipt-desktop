$ErrorActionPreference = 'Stop'

$distPath = Join-Path $PSScriptRoot '..\dist'
$packages = @(Get-ChildItem -LiteralPath $distPath -Filter '*.appx' -File | Sort-Object LastWriteTime -Descending)
if ($packages.Count -eq 0) { throw "No .appx package found under $distPath." }

$identityName = [string]$env:WINDOWS_STORE_IDENTITY_NAME
$publisher = [string]$env:WINDOWS_STORE_PUBLISHER
$applicationId = [string]$env:WINDOWS_STORE_APPLICATION_ID
if ([string]::IsNullOrWhiteSpace($identityName) -or [string]::IsNullOrWhiteSpace($publisher) -or [string]::IsNullOrWhiteSpace($applicationId)) {
    throw 'Store identity environment is missing; refusing to verify an unbound package.'
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$package = $packages[0]
$archive = $null
$reader = $null
try {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($package.FullName)
    $entry = $archive.GetEntry('AppxManifest.xml')
    if ($null -eq $entry) { throw 'AppxManifest.xml is missing from the package.' }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    [xml]$manifest = $reader.ReadToEnd()
    $identity = $manifest.SelectSingleNode("/*[local-name()='Package']/*[local-name()='Identity']")
    $application = $manifest.SelectSingleNode("/*[local-name()='Package']/*[local-name()='Applications']/*[local-name()='Application']")
    if ($null -eq $identity -or $null -eq $application) { throw 'Expected package Identity and Application entries are missing.' }
    if ($identity.Name -cne $identityName) { throw 'Identity.Name does not match WINDOWS_STORE_IDENTITY_NAME.' }
    if ($identity.Publisher -cne $publisher) { throw 'Identity.Publisher does not match WINDOWS_STORE_PUBLISHER.' }
    if ($application.Id -cne $applicationId) { throw 'Application.Id does not match WINDOWS_STORE_APPLICATION_ID.' }

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($package.FullName)
    try { $hash = [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha256.Dispose() }
    Write-Output "Store package preflight passed: $($package.Name)"
    Write-Output "SHA-256: $hash"
    Write-Output 'This is a Store submission artifact. Microsoft must sign it for end-user distribution; do not publish this local package directly.'
}
finally {
    if ($null -ne $reader) { $reader.Dispose() }
    if ($null -ne $archive) { $archive.Dispose() }
}
