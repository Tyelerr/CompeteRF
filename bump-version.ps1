# bump-version.ps1 — run before each EAS build
$path = "$PSScriptRoot\app.json"
$json = Get-Content $path -Raw | ConvertFrom-Json

# Bump patch version (1.0.1 -> 1.0.2)
$parts = $json.expo.version -split '\.'
$parts[2] = [int]$parts[2] + 1
$json.expo.version = $parts -join '.'

# Bump iOS build number
$json.expo.ios.buildNumber = [string]([int]$json.expo.ios.buildNumber + 1)

$json | ConvertTo-Json -Depth 20 | Set-Content $path -Encoding UTF8

Write-Host "Version bumped to $($json.expo.version) (build $($json.expo.ios.buildNumber))" -ForegroundColor Green
