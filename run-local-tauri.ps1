$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path $cargoBin) {
  $env:PATH = "$cargoBin;$env:PATH"
}

function Assert-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "缺少命令: $Name"
  }
}

Assert-Command "node"
Assert-Command "npm"
Assert-Command "cargo"

Write-Host "== Versions ==" -ForegroundColor Cyan
python --version
node --version
npm --version
cargo --version

Write-Host "`n== Install JS deps ==" -ForegroundColor Cyan
npm install

Write-Host "`n== Rust check ==" -ForegroundColor Cyan
Set-Location (Join-Path $repoRoot "src-tauri")
cargo check

Write-Host "`n== Start Tauri Dev ==" -ForegroundColor Cyan
Set-Location $repoRoot
npm run tauri dev
