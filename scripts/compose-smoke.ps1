param(
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
# Keep the optional tunnel disabled in local smoke runs and avoid Compose
# treating its absent token warning as a command failure in PowerShell.
if (-not $env:TUNNEL_TOKEN) { $env:TUNNEL_TOKEN = '' }

function Invoke-Check([string]$Path) {
  $response = Invoke-WebRequest -UseBasicParsing "$BaseUrl$Path" -TimeoutSec 10
  if ($response.StatusCode -ne 200) { throw "$Path returned HTTP $($response.StatusCode)" }
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $composeOutput = @(docker compose ps --format json 2>&1 | Where-Object { $_ -notmatch 'level=warning' })
  $ErrorActionPreference = $previousErrorAction
  $services = @($composeOutput | ConvertFrom-Json)
  $app = @($services | Where-Object { $_.Service -eq 'app' })
  $web = @($services | Where-Object { $_.Service -eq 'web' })
  if ($app.Count -and $web.Count -and $app[0].Health -eq 'healthy' -and $web[0].Health -eq 'healthy') { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

if (-not ($app.Count -and $web.Count -and $app[0].Health -eq 'healthy' -and $web[0].Health -eq 'healthy')) {
  throw 'Compose app/web did not become healthy before timeout'
}

Invoke-Check '/api/health'
Invoke-Check '/health/live'
Invoke-Check '/health/ready'
Write-Output 'Compose smoke checks passed.'
