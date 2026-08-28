<#
.SYNOPSIS
  One command to a shareable release APK on Windows.

.DESCRIPTION
  Produces release\<yyyy-MM-dd>_v<version>\app-release.apk — a file you can send
  straight to a tester over WhatsApp, email or a link, plus a README.txt beside
  it recording what that build points at.

  An APK installs directly on a phone. An AAB (what Play wants) does not, which
  is why this builds the APK and `npm run build:android:aab` exists separately.

  Modes:

    -Mode auto   (default) Local Gradle if the Android SDK and a JDK are here,
                 otherwise Expo's cloud.

    -Mode local  Gradle on this machine. Needs ANDROID_HOME and a JDK 17+. No
                 Expo account. First run creates a release signing key in
                 ~/.keys/<slug>/ and wires it in.

    -Mode eas    Expo's cloud. Needs an Expo account and `eas init` once. No
                 Android SDK required.

.EXAMPLE
  npm run apk
  npm run apk -- -ApiBase https://api.myagemap.com
  npm run apk -- -Bump patch
  npm run apk -- -Mode eas
#>

[CmdletBinding()]
param(
  [ValidateSet('auto', 'eas', 'local')]
  [string]$Mode = 'auto',

  # Baked into the bundle at build time. A tester's phone cannot reach your
  # laptop's localhost, so this must be a hostname the device can resolve.
  [string]$ApiBase = '',

  [ValidateSet('none', 'patch', 'minor', 'major')]
  [string]$Bump = 'none',

  # Skip `expo prebuild`. Faster on a rebuild, but any app.json change is
  # ignored — prebuild is what turns app.json into the native project.
  [switch]$NoPrebuild,

  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Say($m)  { Write-Host "  $m" }
function Step($m) { Write-Host ""; Write-Host "  == $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "  ! $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host ""; Write-Host "  x $m" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Learning App - release APK" -ForegroundColor White

# ── Prerequisites ─────────────────────────────────────────────────────────────

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Die "Node.js is not on PATH." }
if (-not (Test-Path (Join-Path $Root 'app.json')))          { Die "Run this from the app-code folder." }

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { $env:ANDROID_SDK_ROOT }
$hasSdk  = -not [string]::IsNullOrWhiteSpace($sdk) -and (Test-Path $sdk)
$hasJava = [bool](Get-Command java -ErrorAction SilentlyContinue)

if ($Mode -eq 'auto') {
  if ($hasSdk -and $hasJava) { $Mode = 'local' } else { $Mode = 'eas' }
  Say "mode: $Mode (auto-detected)"
} else {
  Say "mode: $Mode"
}

# Gradle and the Android plugin look at JAVA_HOME before PATH, and report its
# absence as an unrelated toolchain error.
if ($Mode -eq 'local' -and -not $env:JAVA_HOME) {
  $javaExe = (Get-Command java -ErrorAction SilentlyContinue).Source
  if ($javaExe) {
    $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $javaExe)
    Say "JAVA_HOME was unset - using $($env:JAVA_HOME)"
  }
}

if (-not $SkipInstall -and -not (Test-Path (Join-Path $Root 'node_modules'))) {
  Step "Installing dependencies"
  npm install
  if ($LASTEXITCODE -ne 0) { Die "npm install failed." }
  npm run setup
  if ($LASTEXITCODE -ne 0) { Die "npm run setup failed." }
}

# ── Version ───────────────────────────────────────────────────────────────────

if ($Bump -ne 'none') {
  Step "Bumping version ($Bump)"
  node scripts/bump-version.mjs $Bump
  if ($LASTEXITCODE -ne 0) { Die "Version bump failed." }
}

$appJson     = Get-Content (Join-Path $Root 'app.json') -Raw | ConvertFrom-Json
$Version     = $appJson.expo.version
$VersionCode = $appJson.expo.android.versionCode
$Stamp       = Get-Date -Format 'yyyy-MM-dd'

$OutDir  = Join-Path $Root "release\${Stamp}_v${Version}"
$OutFile = Join-Path $OutDir 'app-release.apk'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Say "version: $Version (versionCode $VersionCode)"
Say "output:  $OutDir"

if ($ApiBase -ne '') {
  $env:EXPO_PUBLIC_API_BASE = $ApiBase
  Say "api:     $ApiBase"
} else {
  # localhost in a shared APK is the single most common "it doesn't work on my
  # phone" - the device resolves localhost to itself, not to your machine.
  Warn "No -ApiBase given. The APK will use whatever .env or eas.json sets."
  Warn "If that is localhost, testers' phones will reach nothing."
}

# ── Build ─────────────────────────────────────────────────────────────────────

if ($Mode -eq 'local') {

  if (-not $hasSdk)  { Die "ANDROID_HOME is not set. Install Android Studio, or use -Mode eas." }
  if (-not $hasJava) { Die "No JDK on PATH. Install one (17 or newer), or use -Mode eas." }
  Say "sdk:     $sdk"

  if (-not $NoPrebuild) {
    Step "Generating the native project (expo prebuild)"
    npx expo prebuild --platform android --clean
    if ($LASTEXITCODE -ne 0) { Die "expo prebuild failed." }
  } elseif (-not (Test-Path (Join-Path $Root 'android'))) {
    Die "-NoPrebuild was given but there is no android\ folder yet."
  }

  # prebuild --clean regenerates android/, so this must run after it, every time.
  Step "Setting up release signing"
  node scripts/ensure-signing.mjs
  if ($LASTEXITCODE -ne 0) { Die "Signing setup failed." }

  Step "gradlew assembleRelease"
  Say "First run downloads Gradle and the Android toolchain - expect 10-20 minutes."
  Push-Location (Join-Path $Root 'android')
  try {
    .\gradlew.bat assembleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) { Die "Gradle build failed. Scroll up for the first error." }
  } finally {
    Pop-Location
  }

  $built    = Join-Path $Root 'android\app\build\outputs\apk\release\app-release.apk'
  $unsigned = Join-Path $Root 'android\app\build\outputs\apk\release\app-release-unsigned.apk'

  if (Test-Path $built) {
    Copy-Item $built $OutFile -Force
  } elseif (Test-Path $unsigned) {
    # Installing this fails with "There was a problem parsing the package",
    # which says nothing about signing - so stop here instead.
    Die "Gradle produced an UNSIGNED apk. Signing setup did not take effect."
  } else {
    Die "No APK at $built"
  }

} else {

  Step "Building in Expo's cloud"

  $projectId = $appJson.expo.extra.eas.projectId
  if ($projectId -like 'REPLACE_*' -or [string]::IsNullOrWhiteSpace($projectId)) {
    Warn "No EAS project linked yet. Running 'eas init'..."
    npx eas init
    if ($LASTEXITCODE -ne 0) { Die "eas init failed. Sign in with 'npx eas login' first." }
  }

  npx eas whoami 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Warn "Not signed in to Expo. Running 'npx eas login'..."
    npx eas login
    if ($LASTEXITCODE -ne 0) { Die "Expo login failed." }
  }

  # --profile preview is the APK profile in eas.json; production builds an AAB,
  # which cannot be installed on a device.
  Say "This runs on Expo's servers and usually takes 10-20 minutes."
  $json = npx eas build --platform android --profile preview --non-interactive --wait --json
  if ($LASTEXITCODE -ne 0) { Die "EAS build failed." }

  Step "Downloading the APK"
  $build = ($json | ConvertFrom-Json)
  if ($build -is [array]) { $build = $build[0] }

  # eas-cli has used both names for this field across versions.
  $url = $build.artifacts.buildUrl
  if (-not $url) { $url = $build.artifacts.applicationArchiveUrl }
  if ([string]::IsNullOrWhiteSpace($url)) { Die "The build finished but no download URL came back." }

  Say "from: $url"
  Invoke-WebRequest -Uri $url -OutFile $OutFile
}

# ── Report ────────────────────────────────────────────────────────────────────

if (-not (Test-Path $OutFile)) { Die "The build finished but no APK arrived at $OutFile" }

$sizeMb = [math]::Round((Get-Item $OutFile).Length / 1MB, 1)
$sha    = (Get-FileHash $OutFile -Algorithm SHA256).Hash.Substring(0, 16)
$api    = if ($ApiBase -ne '') { $ApiBase } else { '(from .env / eas.json)' }

# A note beside the APK, so whoever finds this folder in three months knows what
# it is and which server it talks to.
@"
Learning App - Android release
------------------------------
version      : $Version (versionCode $VersionCode)
built        : $(Get-Date -Format 'yyyy-MM-dd HH:mm')
build mode   : $Mode
api base     : $api
size         : $sizeMb MB
sha256 (16)  : $sha

To install on an Android phone:
  1. Copy app-release.apk to the device (WhatsApp, email, USB, a link).
  2. Open it. Android will ask to allow installs from this source - allow it.
  3. If "App not installed" appears, an older copy signed with a different key
     is already there. Uninstall that first.

This APK is for direct sharing and testing. The Play Store needs an AAB:
  npm run build:android:aab
"@ | Out-File -FilePath (Join-Path $OutDir 'README.txt') -Encoding utf8

Write-Host ""
Write-Host "  Done" -ForegroundColor Green
Write-Host "  $OutFile"
Write-Host "  $sizeMb MB - share this file directly with testers"
Write-Host ""

Start-Process explorer.exe $OutDir
