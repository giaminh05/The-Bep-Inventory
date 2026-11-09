param([switch]$BuildOnly, [string]$Serial, [switch]$Demo)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$studioJava = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
$nodeHome = Join-Path $env:ProgramFiles 'nodejs'
$node = Join-Path $nodeHome 'node.exe'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$apk = Join-Path $project 'android\app\build\outputs\apk\debug\app-debug.apk'

if (!(Test-Path -LiteralPath $adb)) { throw 'Install Android SDK Platform-Tools in Android Studio.' }
if (!$env:JAVA_HOME) { $env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User') }
if (!$env:JAVA_HOME) {
    $jdk = Get-ChildItem -LiteralPath (Join-Path $env:ProgramFiles 'Microsoft') -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
}
if (!$env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $studioJava 'bin\java.exe'))) { $env:JAVA_HOME = $studioJava }
if (!$env:JAVA_HOME) { throw 'Install Android Studio or set JAVA_HOME to JDK 21.' }
if (!(Test-Path -LiteralPath $node)) {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $nodeHome = Split-Path -Parent $node
}
$env:ANDROID_HOME = $sdk
$env:Path = "$nodeHome;$env:Path"

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program exited with code $LASTEXITCODE." }
}

function Test-DeviceBooted {
    param([string[]]$Selector)
    try {
        return (& $adb @Selector shell getprop sys.boot_completed 2>$null) -eq '1'
    } catch {
        return $false
    }
}

Push-Location -LiteralPath $project
try {
    $cap = 'node_modules/@capacitor/cli/bin/capacitor'
    if (!(Test-Path -LiteralPath $cap)) {
        Invoke-Checked (Join-Path $nodeHome 'npm.cmd') @('install', '--no-package-lock')
    }
    Invoke-Checked $node @('scripts/build-mobile.mjs', 'https://inventory.example.com')
    Invoke-Checked $node @($cap, 'sync', 'android')
    Push-Location -LiteralPath (Join-Path $project 'android')
    try {
        Invoke-Checked '.\gradlew.bat' @('-PbepLocal', ':app:assembleDebug')
    } finally {
        Pop-Location
    }
    Write-Output "APK: $apk"
    if ($BuildOnly) { return }

    & (Join-Path $PSScriptRoot 'open-demo.ps1') -NoBrowser -Demo:$Demo
    $backendPort = if (!$Demo -and (Test-Path -LiteralPath (Join-Path $project 'data\inventory.sqlite'))) { 4171 } else { 4170 }
    $device = if ($Serial) { @('-s', $Serial) } else { @() }
    $connected = @((& $adb devices) -match '^\S+\s+device\s*$')
    if (!$Serial -and $connected.Count -gt 1) { throw 'More than one Android device is attached. Specify -Serial.' }
    if (!$Serial -and !$connected.Count) {
        $emulator = Join-Path $sdk 'emulator\emulator.exe'
        if (!(Test-Path -LiteralPath $emulator) -or !((& $emulator -list-avds) -contains 'Bep_API_36')) {
            throw 'Start an Android virtual device or connect an Android phone with USB debugging enabled.'
        }
        $logs = Join-Path $project 'data'
        New-Item -ItemType Directory -Path $logs -Force | Out-Null
        $start = @{
            FilePath = $emulator
            ArgumentList = @('-avd', 'Bep_API_36', '-gpu', 'swiftshader', '-feature', '-Vulkan',
                '-no-snapshot-load', '-no-boot-anim', '-memory', '3072')
            WorkingDirectory = Split-Path -Parent $emulator
            RedirectStandardOutput = Join-Path $logs 'emulator-output.log'
            RedirectStandardError = Join-Path $logs 'emulator-error.log'
        }
        Start-Process @start
        $device = @('-e')
    }
    $deadline = (Get-Date).AddMinutes(5)
    while (!(Test-DeviceBooted $device)) {
        if ((Get-Date) -gt $deadline) { throw 'Android did not finish booting. For the emulator, see data/emulator-error.log.' }
        Start-Sleep -Seconds 3
    }
    Invoke-Checked $adb ($device + @('reverse', 'tcp:4170', "tcp:$backendPort"))
    Invoke-Checked $adb ($device + @('install', '-r', $apk))
    Invoke-Checked $adb ($device + @('shell', 'am', 'start', '-n',
        'com.thebepteahouse.inventory/.MainActivity'))
} finally {
    Pop-Location
}
