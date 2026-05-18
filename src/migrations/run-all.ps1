# ============================================================================
# Volvix POS — run-all.ps1
# Runs every migration against $env:DATABASE_URL in order. Stops on first error.
# Usage:
#   $env:DATABASE_URL = 'postgresql://user:pwd@host:5432/db?sslmode=require'
#   .\migrations\run-all.ps1
# ============================================================================
$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL is not set. Get it from Supabase Dashboard -> Project Settings -> Database -> Connection string."
    exit 1
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Error "psql is not installed or not on PATH. Install Postgres client tools."
    exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$Files = @(
    "feature-flags.sql",
    "cuts.sql",
    "inventory-movements.sql",
    "customer-payments.sql",
    "users-tenant.sql",
    "owner-saas.sql"
)

Write-Host "=================================================================="
Write-Host "Volvix POS migrations - running $($Files.Count) files"
$DbHost = ($env:DATABASE_URL -split '@')[-1]
Write-Host "Database: ***@$DbHost"
Write-Host "=================================================================="

foreach ($f in $Files) {
    $PathToFile = Join-Path $ScriptDir $f
    if (-not (Test-Path $PathToFile)) {
        Write-Error "Missing file: $PathToFile"
        exit 1
    }
    Write-Host ""
    Write-Host ">>> Applying $f ..."
    & psql $env:DATABASE_URL `
        --set ON_ERROR_STOP=on `
        --single-transaction `
        -v ON_ERROR_STOP=1 `
        -f $PathToFile
    if ($LASTEXITCODE -ne 0) {
        Write-Error "psql failed on $f (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
    Write-Host "    OK: $f"
}

Write-Host ""
Write-Host "=================================================================="
Write-Host "All migrations applied successfully."
Write-Host "=================================================================="
