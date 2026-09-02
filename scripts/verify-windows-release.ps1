[CmdletBinding()]
param(
  [string]$ArtifactPath = 'dist/SnapReceipt-Setup.exe'
)

$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
Import-Module Microsoft.PowerShell.Security -ErrorAction Stop

if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) {
  throw "Release artifact not found: $ArtifactPath"
}

$signature = Get-AuthenticodeSignature -LiteralPath $ArtifactPath
if ($signature.Status -ne 'Valid') {
  throw "Release artifact is not validly Authenticode-signed. Status: $($signature.Status). $($signature.StatusMessage)"
}
if (-not $signature.SignerCertificate) { throw 'Release artifact has no signer certificate.' }
if ($signature.SignerCertificate.NotAfter -le (Get-Date)) {
  throw "Signing certificate is expired: $($signature.SignerCertificate.NotAfter.ToUniversalTime().ToString('u'))"
}

$artifactDirectory = Split-Path -Parent (Resolve-Path -LiteralPath $ArtifactPath)
$executables = @(Get-ChildItem -LiteralPath $artifactDirectory -Filter '*.exe' -File -Recurse)
if ($executables.Count -eq 0) {
  throw "No Windows executable payloads found beside release artifact: $artifactDirectory"
}
foreach ($executable in $executables) {
  $payloadSignature = Get-AuthenticodeSignature -LiteralPath $executable.FullName
  if ($payloadSignature.Status -ne 'Valid') {
    throw "Windows executable is not validly Authenticode-signed: $($executable.FullName). Status: $($payloadSignature.Status)."
  }
  if (-not $payloadSignature.SignerCertificate) {
    throw "Windows executable has no signer certificate: $($executable.FullName)"
  }
  if ($payloadSignature.SignerCertificate.NotAfter -le (Get-Date)) {
    throw "Windows executable signing certificate is expired: $($executable.FullName)"
  }
}

$hash = (Get-FileHash -LiteralPath $ArtifactPath -Algorithm SHA256).Hash.ToUpperInvariant()
$manifestPath = Join-Path (Split-Path -Parent $ArtifactPath) 'SHA256SUMS.txt'
"$hash  $(Split-Path -Leaf $ArtifactPath)" | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Output 'Authenticode: Valid'
Write-Output "Signed Windows executables: $($executables.Count)"
Write-Output "Signer: $($signature.SignerCertificate.Subject)"
Write-Output "Certificate thumbprint: $($signature.SignerCertificate.Thumbprint)"
Write-Output "SHA256: $hash"
Write-Output "Manifest: $manifestPath"
