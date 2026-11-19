$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'open-demo.ps1') -Demo
& (Join-Path $PSScriptRoot 'run-android-local.ps1') -Demo
