# Libera 3000/3001 (next del repo), borra apps/web/.next (EPERM .next/trace).
# -Start: tras limpiar, arranca `next dev` con `node` (evita capa cmd/npm que muestra "trabajo por lotes").
param(
  [switch]$Start
)

$ErrorActionPreference = 'SilentlyContinue'
$repoRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $repoRoot 'apps\web'
$webNext = Join-Path $webRoot '.next'

function Test-RepoNextProcess {
  param([string]$CommandLine)
  if (-not $CommandLine) { return $false }
  $cl = $CommandLine.ToLowerInvariant()
  if ($cl -notmatch 'next') { return $false }
  if ($cl -match [regex]::Escape(($repoRoot.ToLowerInvariant()))) { return $true }
  if ($cl -match 'apps[\\/]web') { return $true }
  if ($cl -match 'ot-system') { return $true }
  return $false
}

foreach ($port in @(3000, 3001)) {
  $connections = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  foreach ($c in $connections) {
    $procId = $c.OwningProcess
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    if ($proc.Name -notin @('node.exe', 'Node.exe')) { continue }
    if (-not (Test-RepoNextProcess $proc.CommandLine)) { continue }
    Write-Host "Puerto $port ocupado por PID $procId (next). Terminando..."
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Milliseconds 500

if (Test-Path $webNext) {
  Write-Host 'Eliminando apps/web/.next ...'
  Remove-Item -Recurse -Force $webNext -ErrorAction SilentlyContinue
}

Write-Host 'OK: puertos 3000/3001 liberados para este repo y .next limpio.'

if (-not $Start) {
  Write-Host 'Siguiente: npm run dev --workspace=apps/web   (o npm run dev:web:reset desde la raíz con -Start ya incluido)'
  exit 0
}

$nextCli = Join-Path $repoRoot 'node_modules\next\dist\bin\next'
if (-not (Test-Path $nextCli)) {
  Write-Error "No se encontró Next en $nextCli. Ejecuta npm install en la raíz del monorepo."
  exit 1
}

if (-not $env:PORT) { $env:PORT = '3000' }

Write-Host "Arrancando Next desde apps/web en puerto $($env:PORT) (sin npm.cmd intermedio)..."
Push-Location $webRoot
try {
  & node $nextCli dev
} finally {
  Pop-Location
}
