# Solo Metro (puerto 8082). Para emulador + APK + Metro: npm run start:android
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

Remove-Item Env:NO_COLOR -ErrorAction SilentlyContinue
Remove-Item Env:CI -ErrorAction SilentlyContinue

Write-Host 'Iniciando Metro (8082). Emulador completo: npm run start:android' -ForegroundColor Cyan
node .\scripts\start-expo.js @args
