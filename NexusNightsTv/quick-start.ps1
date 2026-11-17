# NEXUSNIGHT TV quick start. Uses the same maintained build/install workflow.
[CmdletBinding()]
param(
    [string]$CertificateProfile = "",
    [switch]$Install,
    [string]$Device = ""
)

$script = Join-Path $PSScriptRoot "build.ps1"
if (-not (Test-Path $script)) { throw "build.ps1 was not found beside quick-start.ps1" }
& $script -CertificateProfile $CertificateProfile -Install:$Install -Device $Device
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
