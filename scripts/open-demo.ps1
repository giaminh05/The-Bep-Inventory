param([switch]$NoBrowser, [switch]$Demo)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $project 'data'
$live = !$Demo -and (Test-Path -LiteralPath (Join-Path $logs 'inventory.sqlite'))
$port = if ($live) { '4171' } else { '4170' }
$origin = "http://127.0.0.1:$port"
$profile = if ($live) { 'inventory' } else { 'demo' }

function Test-Backend {
    try {
        return (Invoke-RestMethod "$origin/api/health" -TimeoutSec 1).ok -eq $true
    } catch {
        return $false
    }
}

if (!(Test-Backend)) {
    $installedNode = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    $nodeOnPath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    $node = @($installedNode, $nodeOnPath, $bundledNode) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (!$node) { throw 'Node.js 24+ is required.' }

    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $env:BEP_HOST = '127.0.0.1'
    $env:BEP_PORT = $port
    $env:BEP_LIVE = if ($live) { '1' } else { $null }
    $env:BEP_DB = Join-Path $logs "$profile.sqlite"
    $logFile = Join-Path $logs "$profile-error.log"
    $start = @{
        FilePath = $node
        ArgumentList = 'server/http.mjs'
        WorkingDirectory = $project
        WindowStyle = 'Hidden'
        RedirectStandardOutput = (Join-Path $logs "$profile-output.log")
        RedirectStandardError = $logFile
        PassThru = $true
    }
    $process = Start-Process @start

    $deadline = (Get-Date).AddSeconds(15)
    while (!(Test-Backend)) {
        if ($process.HasExited -or (Get-Date) -gt $deadline) {
            throw "The inventory backend did not start. See $logFile"
        }
        Start-Sleep -Milliseconds 250
    }
}

if (!$NoBrowser) {
    Start-Process "$origin/"
}
