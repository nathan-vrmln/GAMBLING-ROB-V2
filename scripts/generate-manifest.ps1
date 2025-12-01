# Generates assets/img/manifest.json with the list of image filenames
$ErrorActionPreference = 'Stop'

# Resolve project root relative to this script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$imgDir = Join-Path $root 'assets/img'
$manifestPath = Join-Path $imgDir 'manifest.json'

if (-not (Test-Path $imgDir)) {
  Write-Error "Images folder not found: $imgDir"
}

# Allowed image extensions
$exts = @('.png','.jpg','.jpeg','.gif','.webp')

# Get files and keep relative filenames only
$files = Get-ChildItem -Path $imgDir -File | Where-Object { $exts -contains ([System.IO.Path]::GetExtension($_.Name).ToLower()) } | ForEach-Object { $_.Name }

# Sort for stable order
$files = $files | Sort-Object

# Write JSON array
$json = ($files | ConvertTo-Json -Depth 2)
Set-Content -Path $manifestPath -Encoding UTF8 -Value $json

Write-Host "Wrote $(($files).Count) entries to $manifestPath"