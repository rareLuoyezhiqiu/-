param([string]$JavaHome, [switch]$DebugBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (!$JavaHome) {
    $jdk = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools/jdk21') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    $JavaHome = if ($jdk) { $jdk.FullName } else { $env:JAVA_HOME }
}
if (!$JavaHome -or !(Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))) { throw 'Set JAVA_HOME to JDK 21 or pass -JavaHome.' }
$env:JAVA_HOME = $JavaHome
$env:PATH = "$JavaHome/bin;$env:PATH"
Set-Location $projectRoot
npm run build
if ($LASTEXITCODE) { throw 'Web build failed' }
npx cap sync android
if ($LASTEXITCODE) { throw 'Capacitor sync failed' }
if (!$DebugBuild) {
    $secretDir = Join-Path $projectRoot '.signing'
    $secretFile = Join-Path $secretDir 'credentials.json'
    $keystore = Join-Path $secretDir 'inspiration-release.jks'
    if (!(Test-Path -LiteralPath $secretFile)) {
        if (git tag --list 'v*') { throw 'Published tags exist. Restore the original signing material before building updates.' }
        if (Test-Path -LiteralPath $keystore) { throw 'Existing keystore found without credentials. Restore credentials before building.' }
        New-Item -ItemType Directory -Force -Path $secretDir | Out-Null
        $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $bytes = New-Object byte[] 32; $random.GetBytes($bytes)
        $password = [Convert]::ToBase64String($bytes)
        @{ password=$password; alias='inspiration' } | ConvertTo-Json | Set-Content -LiteralPath $secretFile -Encoding utf8
    }
    $secret = Get-Content -LiteralPath $secretFile -Raw | ConvertFrom-Json
    $env:ANDROID_KEYSTORE = $keystore
    $env:ANDROID_STORE_PASSWORD = $secret.password
    $env:ANDROID_KEY_PASSWORD = $secret.password
    $env:ANDROID_KEY_ALIAS = $secret.alias
    if (!(Test-Path -LiteralPath $keystore)) {
        & "$JavaHome/bin/keytool.exe" -genkeypair -keystore $keystore -alias $secret.alias -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Inspiration List, OU=Personal, O=rareLuoyezhiqiu' -storepass:env ANDROID_STORE_PASSWORD -keypass:env ANDROID_KEY_PASSWORD
        if ($LASTEXITCODE) { throw 'Signing key creation failed' }
    }
}
Push-Location android
try {
    $task = if ($DebugBuild) { 'assembleDebug' } else { 'assembleRelease' }
    .\gradlew.bat $task lintRelease --no-daemon --max-workers=2
    if ($LASTEXITCODE) { throw 'Android build or validation failed' }
} finally { Pop-Location }
if (!$DebugBuild) {
    New-Item -ItemType Directory -Force release | Out-Null
    Copy-Item -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk' -Destination 'release/inspiration-list-0.2.0-alpha.1.apk' -Force
    $hash = (Get-FileHash -LiteralPath 'release/inspiration-list-0.2.0-alpha.1.apk' -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  inspiration-list-0.2.0-alpha.1.apk" | Set-Content -LiteralPath 'release/SHA256SUMS.txt' -Encoding ascii
}
