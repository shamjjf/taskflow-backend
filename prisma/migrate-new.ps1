param(
    [Parameter(Mandatory = $true)]
    [string]$Name
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$slug = ($Name.ToLower() -replace '[^a-z0-9]+', '_').Trim('_')
if ([string]::IsNullOrWhiteSpace($slug)) {
    Write-Error "Name must contain at least one alphanumeric character."
    exit 1
}

Write-Host "[1/4] Diffing live DB against schema..." -ForegroundColor Cyan
$diff = & npx --no-install prisma migrate diff `
    --from-schema-datasource prisma/schema.prisma `
    --to-schema-datamodel prisma/schema.prisma `
    --script
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$sql = ($diff -join "`n").Trim()
if ([string]::IsNullOrWhiteSpace($sql) -or $sql -match '^-- This is an empty migration\.?$') {
    Write-Host "No schema changes detected. Nothing to do." -ForegroundColor Yellow
    exit 0
}

$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$folder = Join-Path $root "prisma\migrations\${timestamp}_$slug"
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$file = Join-Path $folder "migration.sql"

Write-Host "[2/4] Writing $file (UTF-8, no BOM)..." -ForegroundColor Cyan
[System.IO.File]::WriteAllText($file, $sql + "`n", (New-Object System.Text.UTF8Encoding $false))

Write-Host "[3/4] Applying migrations..." -ForegroundColor Cyan
& npx --no-install prisma migrate deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[4/4] Regenerating Prisma client..." -ForegroundColor Cyan
& npx --no-install prisma generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done: ${timestamp}_$slug" -ForegroundColor Green
