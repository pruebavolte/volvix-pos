# ============================================================
# Volvix POS — seed-all (PowerShell, Windows)
# ============================================================
# Usage:
#   $env:DATABASE_URL="postgres://..."; .\seeds\seed-all.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$seedsDir    = Join-Path $projectRoot "seeds"
Set-Location $projectRoot

# Load .env.production if present
$envFile = Join-Path $projectRoot ".env.production"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*([^#=]+?)\s*=\s*(.+?)\s*$") {
      [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2])
    }
  }
}

if (-not $env:DATABASE_URL) {
  if ($env:SUPABASE_DB_URL) {
    $env:DATABASE_URL = $env:SUPABASE_DB_URL
  } else {
    Write-Host "ERROR: DATABASE_URL not set" -ForegroundColor Red
    exit 1
  }
}

function Run-Sql {
  param([string]$file, [string]$label)
  Write-Host "[seed] $label" -ForegroundColor White
  $output = & psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f $file 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ $label failed:" -ForegroundColor Red
    $output | Select-Object -Last 30 | Write-Host
    exit 1
  } else {
    Write-Host "  ✓ $label" -ForegroundColor Green
  }
}

Write-Host "════════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "   Volvix POS — Seeding 10 industry demo tenants" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor White

$start = Get-Date

Run-Sql "$seedsDir\_shared\helpers.sql" "Shared helpers (functions)"
Run-Sql "$seedsDir\tenants-10-industries.sql" "10 tenants + 30 users"

$verticals = @("abarrotes","panaderia","farmacia","restaurant","cafe","barberia","gasolinera","ropa","electronica","fitness")
foreach ($v in $verticals) {
  Run-Sql "$seedsDir\tenant-$v\products.sql" "Products: $v"
}

Run-Sql "$seedsDir\customers-all.sql" "Customers (all tenants)"
Run-Sql "$seedsDir\sales-all.sql" "Sales history (last 30 days)"
Run-Sql "$seedsDir\cuts-and-inventory-all.sql" "Cash cuts + inventory + payments"
Run-Sql "$seedsDir\industry-configs-all.sql" "Industry-specific configs"

$elapsed = (Get-Date) - $start
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "   ✓ Seed complete in $([int]$elapsed.TotalSeconds)s" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor White
Write-Host ""
Write-Host "Demo logins (password = Demo2026!):"
Write-Host "  • demo-abarrotes@volvix.test"
Write-Host "  • demo-panaderia@volvix.test"
Write-Host "  • demo-farmacia@volvix.test"
Write-Host "  • demo-restaurant@volvix.test"
Write-Host "  • demo-cafe@volvix.test"
Write-Host "  • demo-barberia@volvix.test"
Write-Host "  • demo-gasolinera@volvix.test"
Write-Host "  • demo-ropa@volvix.test"
Write-Host "  • demo-electronica@volvix.test"
Write-Host "  • demo-fitness@volvix.test"
