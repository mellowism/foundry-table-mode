# Build release zip with forward-slash entry paths (Linux-extraction-safe).
# Includes: dist/, src/, module.json, README.md, LICENSE, CHANGELOG.md.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$zip = Join-Path $root 'foundry-table-mode.zip'

if (Test-Path $zip) { Remove-Item $zip -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($zip, 'Create')

try {
  $entries = @()

  # Bundled output + sourcemap
  $entries += Get-ChildItem -Path (Join-Path $root 'dist') -File -Recurse | ForEach-Object {
    @{ Path = $_.FullName; Rel = ($_.FullName.Substring($root.Length + 1) -replace '\\', '/') }
  }

  # Source assets shipped to clients (referenced from module.json)
  $entries += Get-ChildItem -Path (Join-Path $root 'src') -File -Recurse | ForEach-Object {
    @{ Path = $_.FullName; Rel = ($_.FullName.Substring($root.Length + 1) -replace '\\', '/') }
  }

  # Top-level metadata
  foreach ($f in @('module.json', 'README.md', 'LICENSE', 'CHANGELOG.md')) {
    $entries += @{ Path = (Join-Path $root $f); Rel = $f }
  }

  foreach ($e in $entries) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $e.Path, $e.Rel) | Out-Null
  }
}
finally {
  $archive.Dispose()
}

Write-Host "✓ zip $((Get-Item $zip).Length) bytes — $(($entries).Count) entries"
