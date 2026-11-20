# Windows Smoke Test Script
# This script is run in CI to verify the Windows build works correctly.
# It tests basic functionality that doesn't require user interaction.

param(
    [int]$Port = 8080,
    [string]$BundlePath = ".\Bundle\index.windows.bundle",
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

Write-Host "=== FreeKiosk Windows Smoke Test ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check if bundle exists
Write-Host "[1/5] Checking bundle..." -ForegroundColor Yellow
if (-not (Test-Path $BundlePath)) {
    Write-Host "FAIL: Bundle not found at $BundlePath" -ForegroundColor Red
    exit 1
}
Write-Host "PASS: Bundle found" -ForegroundColor Green

# Test 2: Check if executable exists
Write-Host "[2/5] Checking executable..." -ForegroundColor Yellow
$exePath = ".\FreeKiosk.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "FAIL: Executable not found at $exePath" -ForegroundColor Red
    exit 1
}
Write-Host "PASS: Executable found" -ForegroundColor Green

# Test 3: Check if Windows manifest is correct
Write-Host "[3/5] Checking manifest..." -ForegroundColor Yellow
$manifestPath = ".\appxmanifest.xml"
if (-not (Test-Path $manifestPath)) {
    Write-Host "WARN: Manifest not found (may be embedded)" -ForegroundColor Yellow
} else {
    $manifest = Get-Content $manifestPath -Raw
    if ($manifest -match "TransactedKiosk") {
        Write-Host "PASS: TransactedKiosk enabled" -ForegroundColor Green
    } else {
        Write-Host "WARN: TransactedKiosk not found in manifest" -ForegroundColor Yellow
    }
}

# Test 4: Check if HTTP server can start (optional - requires running app)
Write-Host "[4/5] Checking HTTP server..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "PASS: HTTP server responding" -ForegroundColor Green
} catch {
    Write-Host "WARN: HTTP server not responding (app may not be running)" -ForegroundColor Yellow
}

# Test 5: Check if MQTT can connect (optional)
Write-Host "[5/5] Checking MQTT..." -ForegroundColor Yellow
Write-Host "SKIP: MQTT test requires broker configuration" -ForegroundColor Gray

Write-Host ""
Write-Host "=== Smoke Test Complete ===" -ForegroundColor Cyan
Write-Host "All critical checks passed!" -ForegroundColor Green
