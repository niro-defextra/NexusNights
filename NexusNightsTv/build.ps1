# Build, sign, and optionally install NEXUSNIGHT TV on a Samsung Tizen TV.
[CmdletBinding()]
param(
    [string]$CertificateProfile = "",
    [switch]$Install,
    [string]$DeviceSerial = "192.168.1.3:26101"
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepositoryDir = Split-Path -Parent $ProjectDir
$AppId = "7P7lQLyuKP.NexusNightsTv"
$BuildDir = Join-Path $ProjectDir ".buildResult"

function Write-Step([string]$Message) {
    Write-Host "`n== $Message ==" -ForegroundColor Cyan
}

function Resolve-TizenCli {
    $command = Get-Command tizen -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $roots = @()
    if ($env:TIZEN_STUDIO) { $roots += $env:TIZEN_STUDIO }
    $roots += @("C:\tizen-studio-real", "C:\tizen-studio", (Join-Path $env:USERPROFILE "tizen-studio"))
    foreach ($root in ($roots | Select-Object -Unique)) {
        if (-not (Test-Path $root)) { continue }
        foreach ($relative in @(
            "tools\ide\bin\tizen.bat",
            "tools\ide\bin\tizen.exe",
            "server\sdktools\data\tools\ide\bin\tizen.bat",
            "server\sdktools\data\tools\ide\bin\tizen.exe"
        )) {
            $candidate = Join-Path $root $relative
            if (Test-Path $candidate) { return $candidate }
        }
    }
    return $null
}

Write-Host "NEXUSNIGHT TV - Samsung Tizen 5.0 target" -ForegroundColor White
Write-Host "Project: $ProjectDir" -ForegroundColor Gray

Write-Step "Checking project files"
foreach ($required in @("config.xml", "index.html", "icon.png", "js\app.js", "js\api.js", "tizen_web_project.yaml")) {
    if (-not (Test-Path (Join-Path $ProjectDir $required))) {
        throw "Required project file is missing: $required"
    }
}

Write-Step "Locating Tizen Web CLI"
$tizenCli = Resolve-TizenCli
if (-not $tizenCli) {
    throw "Tizen CLI was not found. Confirm Web App Development Web / Web CLI is installed, then add <TIZEN_STUDIO>\tools\ide\bin to PATH."
}
Write-Host "Using: $tizenCli" -ForegroundColor Green

Write-Step "Checking Samsung certificate profile"
$profileOutput = & $tizenCli security-profiles list 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Could not read Tizen certificate profiles:`n$($profileOutput | Out-String)"
}
Write-Host ($profileOutput | Out-String) -ForegroundColor Gray
if ([string]::IsNullOrWhiteSpace($CertificateProfile)) {
    $CertificateProfile = Read-Host "Enter the exact certificate profile name shown above"
}
if ([string]::IsNullOrWhiteSpace($CertificateProfile)) {
    throw "A certificate profile name is required."
}
if (-not (($profileOutput | Out-String).Contains($CertificateProfile))) {
    throw "Certificate profile '$CertificateProfile' was not found. Use the exact name shown above."
}

Write-Step "Building the Web application"
Push-Location $ProjectDir
try {
    $buildOutput = & $tizenCli build-web -- . 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Tizen Web build failed:`n$($buildOutput | Out-String)"
    }
    Write-Host ($buildOutput | Out-String) -ForegroundColor Gray
    if (-not (Test-Path $BuildDir)) {
        throw "Tizen build completed without creating .buildResult."
    }

    Write-Step "Packaging and signing the WGT"
    Get-ChildItem -Path $BuildDir -Filter "*.wgt" -File -ErrorAction SilentlyContinue | Remove-Item -Force
    $packageOutput = & $tizenCli package -t wgt -s $CertificateProfile -- $BuildDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Tizen packaging/signing failed:`n$($packageOutput | Out-String)"
    }
    Write-Host ($packageOutput | Out-String) -ForegroundColor Gray

    $wgt = Get-ChildItem -Path $BuildDir -Filter "*.wgt" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $wgt) {
        throw "Tizen CLI returned successfully but no signed .wgt package was found in .buildResult."
    }

    $distDir = Join-Path $RepositoryDir "dist"
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
    $distFile = Join-Path $distDir "NexusNightTV.wgt"
    Copy-Item $wgt.FullName $distFile -Force
    Write-Host "Signed package: $distFile" -ForegroundColor Green
    Write-Host ("Size: {0:N2} MB" -f ($wgt.Length / 1MB)) -ForegroundColor Gray
}
finally {
    Pop-Location
}

if ($Install) {
    Write-Step "Verifying the connected Samsung TV"
    $sdbCandidates = @()
    $sdbCommand = Get-Command sdb -ErrorAction SilentlyContinue
    if ($sdbCommand) { $sdbCandidates += $sdbCommand.Source }
    $sdbCandidates += @(
        "C:\tizen-studio-real\server\sdktools\data\tools\sdb.exe",
        "C:\tizen-studio-real\tools\ide\bin\sdb.exe",
        "C:\tizen-studio\tools\ide\bin\sdb.exe"
    )
    $sdb = $sdbCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if (-not $sdb) { throw "sdb.exe was not found. The WGT was built, but installation was not attempted." }

    if ($DeviceSerial) {
        Write-Host "Connecting to $DeviceSerial..." -ForegroundColor Gray
        & $sdb connect $DeviceSerial 2>&1 | Out-Null
    }

    $devicesOutput = & $sdb devices 2>&1
    Write-Host ($devicesOutput | Out-String) -ForegroundColor Gray
    if (-not (($devicesOutput | Out-String).Contains($DeviceSerial))) {
        & $sdb connect $DeviceSerial 2>&1 | Out-Null
        $devicesOutput = & $sdb devices 2>&1
    }
    if (-not (($devicesOutput | Out-String).Contains($DeviceSerial))) {
        throw "Device '$DeviceSerial' is not currently connected in SDB. The signed WGT remains available in dist."
    }

    Write-Step "Granting installation permission"
    $permitOutput = & $tizenCli install-permit -s $DeviceSerial 2>&1
    if ($LASTEXITCODE -ne 0) {
        $permitText = $permitOutput | Out-String
        if ($permitText -notmatch "Permit is not required|Install Permitted") {
            throw "Could not grant installation permission:`n$permitText"
        }
    }
    Write-Host ($permitOutput | Out-String) -ForegroundColor Gray

    Write-Step "Installing the signed WGT"
    $installOutput = & $tizenCli install -s $DeviceSerial --name $wgt.Name -- $BuildDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Installation failed:`n$($installOutput | Out-String)"
    }
    Write-Host ($installOutput | Out-String) -ForegroundColor Gray

    Write-Step "Launching NEXUSNIGHT TV"
    $launchOutput = & $tizenCli run -s $DeviceSerial -p $AppId 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "The WGT installed, but launch failed:`n$($launchOutput | Out-String)"
    }
    Write-Host ($launchOutput | Out-String) -ForegroundColor Gray
    Write-Host "Install and launch commands completed. Verify the app on the TV screen." -ForegroundColor Green
}
else {
    Write-Host "Build complete. To install on the connected TV, run: .\build.ps1 -Install" -ForegroundColor Yellow
}
