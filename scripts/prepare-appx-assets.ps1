$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repoRoot 'build\icon.png'
$assetDirectory = Join-Path $repoRoot 'build\appx'
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "SnapReceipt icon is missing: $sourcePath"
}

New-Item -ItemType Directory -Path $assetDirectory -Force | Out-Null
Add-Type -AssemblyName System.Drawing

$source = $null
try {
    $source = [System.Drawing.Image]::FromFile($sourcePath)
    $blue = [System.Drawing.Color]::FromArgb(37, 99, 235)
    $assets = @(
        @{ Name = 'StoreLogo.png'; Width = 50; Height = 50 },
        @{ Name = 'Square150x150Logo.png'; Width = 150; Height = 150 },
        @{ Name = 'Square44x44Logo.png'; Width = 44; Height = 44 },
        @{ Name = 'Wide310x150Logo.png'; Width = 310; Height = 150 }
    )
    foreach ($asset in $assets) {
        $bitmap = New-Object System.Drawing.Bitmap($asset.Width, $asset.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear($blue)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $side = [Math]::Min($asset.Width, $asset.Height)
            $x = [int](($asset.Width - $side) / 2)
            $y = [int](($asset.Height - $side) / 2)
            $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle($x, $y, $side, $side)))
            $bitmap.Save((Join-Path $assetDirectory $asset.Name), [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
}
finally {
    if ($null -ne $source) { $source.Dispose() }
}

Write-Output 'SnapReceipt AI AppX tile assets prepared from the checked-in brand icon.'
