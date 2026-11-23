#Requires -RunAsAdministrator
param(
  [Parameter(Mandatory=$true)][string]$CertPath,
  [Parameter(Mandatory=$true)][string]$PfxPath,
  [Parameter(Mandatory=$true)][string]$PfxPassword
)

$ErrorActionPreference = 'Stop'

function Fail($msg) {
  Write-Host "SMOKE FAIL: $msg"
  exit 1
}

# ---------- 1. Trust the cert ----------
Import-Certificate -FilePath $CertPath -CertStoreLocation Cert:\LocalMachine\TrustedPeople

# ---------- 2. Build a test MSIX ----------
$pkgDir = Join-Path $env:RUNNER_TEMP 'smokepkg'
New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null

Copy-Item 'C:\Windows\System32\whoami.exe' (Join-Path $pkgDir 'whoami.exe')

$imagesDir = 'windows\FreeKiosk.Package\Images'
Copy-Item (Join-Path $imagesDir 'StoreLogo.png') (Join-Path $pkgDir 'StoreLogo.png')
Copy-Item (Join-Path $imagesDir 'Square150x150Logo.scale-200.png') (Join-Path $pkgDir 'Square150x150Logo.png')
Copy-Item (Join-Path $imagesDir 'Square44x44Logo.scale-200.png') (Join-Path $pkgDir 'Square44x44Logo.png')

$manifest = @'
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap rescap">
  <Identity Name="FreeKioskSmokeApp" Publisher="CN=FreeKiosk" Version="1.2.3.0" ProcessorArchitecture="x64" />
  <Properties><DisplayName>Smoke App</DisplayName><PublisherDisplayName>FreeKiosk</PublisherDisplayName><Logo>StoreLogo.png</Logo></Properties>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.0" /></Dependencies>
  <Resources><Resource Language="en-us" /></Resources>
  <Applications><Application Id="App" Executable="whoami.exe" EntryPoint="Windows.FullTrustApplication"><uap:VisualElements DisplayName="Smoke App" Description="Smoke" BackgroundColor="transparent" Square150x150Logo="Square150x150Logo.png" Square44x44Logo="Square44x44Logo.png" /></Application></Applications>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
'@
[System.IO.File]::WriteAllText((Join-Path $pkgDir 'AppxManifest.xml'), $manifest, (New-Object System.Text.UTF8Encoding($false)))

$makeappx = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\makeappx.exe" | Sort-Object { $_.Directory.Name } -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $makeappx) { Fail 'makeappx.exe not found' }
$signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" | Sort-Object { $_.Directory.Name } -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $signtool) { Fail 'signtool.exe not found' }

$msixPath = Join-Path $env:RUNNER_TEMP 'smoke.msix'
& $makeappx pack /d $pkgDir /p $msixPath /o
if ($LASTEXITCODE -ne 0) { Fail "makeappx failed ($LASTEXITCODE)" }
& $signtool sign /fd SHA256 /f $PfxPath /p $PfxPassword $msixPath
if ($LASTEXITCODE -ne 0) { Fail "signtool failed ($LASTEXITCODE)" }
$sha = (Get-FileHash $msixPath -Algorithm SHA256).Hash.ToLower()

# ---------- 3. Serve it ----------
$pyServer = Start-Process python -ArgumentList '-m','http.server','8090','--bind','127.0.0.1' -WorkingDirectory $env:RUNNER_TEMP -PassThru

try {

# ---------- 4. Seed settings ----------
# Appx cmdlets only load in Windows PowerShell 5.1 (pwsh 7 cannot import the Appx module).
function Get-AppxPkg([string]$name) {
  $out = powershell -NoProfile -NonInteractive -Command "Get-AppxPackage -Name '$name' | ForEach-Object { `$_.PackageFamilyName }" 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  $line = ($out | Where-Object { $_ -match '\S' } | Select-Object -First 1)
  if ($line) { return $line.Trim() }
  return $null
}

# Deploy step may have left the app running; kill it so it re-reads seeded settings.
Get-Process FreeKiosk -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$pfn = Get-AppxPkg 'FreeKiosk'
if (-not $pfn) { Fail 'FreeKiosk package not installed' }
$localState = Join-Path $env:LOCALAPPDATA "Packages\$pfn\LocalState"
New-Item -ItemType Directory -Force -Path $localState | Out-Null
$storageJson = '{"@kiosk_rest_api_enabled":"true","@kiosk_rest_api_allow_control":"true","@kiosk_rest_api_port":"8080"}'
[System.IO.File]::WriteAllText((Join-Path $localState 'freekiosk_storage.json'), $storageJson, (New-Object System.Text.UTF8Encoding($false)))

# ---------- 5. Launch and wait for health ----------
Start-Process "shell:AppsFolder\$pfn!App"

# Wait for the process to appear
$procSeen = $false
$procDeadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $procDeadline) {
  if (Get-Process FreeKiosk -ErrorAction SilentlyContinue) { $procSeen = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $procSeen) { Fail 'FreeKiosk process never appeared after launch' }
Write-Host 'launch OK: process running'

$healthy = $false
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/api/health' -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  } catch {
    $listening = (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) -ne $null
    $proc = (Get-Process FreeKiosk -ErrorAction SilentlyContinue) -ne $null
    Write-Host "waiting: proc=$proc port8080=$listening"
    Start-Sleep -Seconds 5
  }
}
if (-not $healthy) {
  $dbg = Join-Path $env:LOCALAPPDATA "Packages\$pfn\LocalState\freekiosk_debug.log"
  if (Test-Path $dbg) { Write-Host '--- freekiosk_debug.log ---'; Get-Content $dbg | ForEach-Object { Write-Host $_ } } else { Write-Host 'no freekiosk_debug.log' }
  $stor = Join-Path $env:LOCALAPPDATA "Packages\$pfn\LocalState\freekiosk_storage.json"
  if (Test-Path $stor) { Write-Host '--- storage ---'; Write-Host (Get-Content $stor -Raw) }
  Fail '/api/health did not respond within 120s'
}

# ---------- 6. Assertions ----------
# a. /api/health
$h = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/api/health').Content | ConvertFrom-Json
if ($h.success -ne $true) { Fail 'health success != true' }
if ($h.data.platform -ne 'windows') { Fail "health platform = $($h.data.platform)" }
Write-Host 'a OK: health'

# b. /api/status
$s = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/api/status').Content | ConvertFrom-Json
if ($s.data.device.platform -ne 'windows') { Fail "status platform = $($s.data.device.platform)" }
$w = $s.data.device.screenCapture.width
$hh = $s.data.device.screenCapture.height
if ($w -le 0 -or $hh -le 0) { Fail "screenCapture size ${w}x${hh}" }
if ([Math]::Max($w, $hh) -gt 1080) { Fail "screenCapture exceeds 1080: ${w}x${hh}" }
if ($null -eq $s.data.installedApps) { Fail 'installedApps missing' }
Write-Host 'b OK: status'

# c. /api/screenshot
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/api/screenshot' -OutFile 'smoke-screenshot.jpg'
$shotBytes = [System.IO.File]::ReadAllBytes("$PWD\smoke-screenshot.jpg")
if ($shotBytes.Length -lt 4 -or $shotBytes[0] -ne 0xFF -or $shotBytes[1] -ne 0xD8) { Fail 'screenshot is not a JPEG' }
Write-Host 'c OK: screenshot'

# d. /api/screenshot/stream
$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromSeconds(10)
$resp = $http.GetAsync('http://127.0.0.1:8080/api/screenshot/stream', [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).Result
$ct = $resp.Content.Headers.ContentType.MediaType
if (-not $ct.StartsWith('multipart/x-mixed-replace')) { Fail "stream content-type $ct" }
$ms = New-Object System.IO.MemoryStream
$stream = $resp.Content.ReadAsStreamAsync().Result
$buf = New-Object byte[] 8192
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt 5 -and $ms.Length -lt 2MB) {
  $read = $stream.ReadAsync($buf, 0, $buf.Length)
  if (-not $read.Wait(2000)) { break }
  if ($read.Result -le 0) { break }
  $ms.Write($buf, 0, $read.Result)
}
$streamBytes = $ms.ToArray()
[System.IO.File]::WriteAllBytes('smoke-stream.bin', $streamBytes)
$streamText = [System.Text.Encoding]::ASCII.GetString($streamBytes)
$frameCount = ([regex]::Matches($streamText, '--freekiosk-frame')).Count
if ($frameCount -lt 2) { Fail "stream had $frameCount frames" }
Write-Host "d OK: stream ($frameCount frames)"
$http.Dispose()

# e. /api/remote/tap
$tapBody = '{"x":5,"y":5}'
$tap = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/api/remote/tap' -Method POST -Body $tapBody -ContentType 'application/json').Content | ConvertFrom-Json
if ($tap.success -ne $true) { Fail 'tap success != true' }
if ($tap.data.executed -ne $true) { Fail 'tap executed != true' }
Write-Host 'e OK: tap'

# f. /api/app/install
$installBody = (@{appId='';downloadUrl='http://127.0.0.1:8090/smoke.msix';fileName='smoke.msix';packageName='FreeKioskSmokeApp';sha256=$sha;versionCode=1002003} | ConvertTo-Json -Compress)
$install = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/api/app/install' -Method POST -Body $installBody -ContentType 'application/json' -TimeoutSec 180).Content | ConvertFrom-Json
if ($install.data.status -ne 'installed') { Fail "install status = $($install.data.status) error=$($install.data.error)" }
$installed = Get-AppxPkg 'FreeKioskSmokeApp'
if ($null -eq $installed) { Fail 'FreeKioskSmokeApp not found after install' }
Write-Host 'f OK: install'

# g. /api/status inventory
$s2 = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/api/status').Content | ConvertFrom-Json
$entry = $s2.data.installedApps | Where-Object { $_.packageName -eq 'FreeKioskSmokeApp' }
if ($null -eq $entry) { Fail 'FreeKioskSmokeApp missing from installedApps' }
if ($entry.versionCode -ne 1002003) { Fail "versionCode = $($entry.versionCode)" }
if ($entry.versionName -ne '1.2.3.0') { Fail "versionName = $($entry.versionName)" }
Write-Host 'g OK: inventory'

# h. /api/app/uninstall
$uninstallBody = '{"packageName":"FreeKioskSmokeApp"}'
$uninstall = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/api/app/uninstall' -Method POST -Body $uninstallBody -ContentType 'application/json' -TimeoutSec 120).Content | ConvertFrom-Json
if ($uninstall.data.status -ne 'uninstalled') { Fail "uninstall status = $($uninstall.data.status)" }
$still = Get-AppxPkg 'FreeKioskSmokeApp'
if ($null -ne $still) { Fail 'FreeKioskSmokeApp still installed after uninstall' }
Write-Host 'h OK: uninstall'

# i. sha256 mismatch
$badBody = (@{appId='';downloadUrl='http://127.0.0.1:8090/smoke.msix';fileName='smoke.msix';packageName='FreeKioskSmokeApp';sha256=('0' * 64);versionCode=1002003} | ConvertTo-Json -Compress)
$bad = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/api/app/install' -Method POST -Body $badBody -ContentType 'application/json' -TimeoutSec 180).Content | ConvertFrom-Json
if ($bad.data.status -ne 'failed') { Fail "bad sha status = $($bad.data.status)" }
if ($bad.data.error -ne 'SHA-256 checksum mismatch') { Fail "bad sha error = $($bad.data.error)" }
Write-Host 'i OK: sha256 mismatch'

Write-Host 'SMOKE PASS'

} finally {
  # ---------- 7. Cleanup ----------
  Get-Process FreeKiosk -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  if ($pyServer) { Stop-Process -Id $pyServer.Id -Force -ErrorAction SilentlyContinue }
}
