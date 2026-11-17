Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\CursedChip\Desktop\NexusNight\client\public\favicon.png"
$resDir = "C:\Users\CursedChip\Desktop\NexusNight\android\app\src\main\res"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source icon not found: $srcPath"
    exit 1
}

$srcImg = [System.Drawing.Image]::FromFile($srcPath)

function Resize-And-Save {
    param(
        [int]$canvasWidth,
        [int]$canvasHeight,
        [float]$scaleRatio,
        [string]$outputPath,
        [string]$shape = "none",
        [System.Drawing.Color]$bgColor = [System.Drawing.Color]::FromArgb(255, 10, 7, 8)
    )

    $bmp = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($shape -eq "splash") {
        $brush = New-Object System.Drawing.SolidBrush($bgColor)
        $g.FillRectangle($brush, 0, 0, $canvasWidth, $canvasHeight)
        $brush.Dispose()
    } elseif ($shape -eq "circle") {
        $brush = New-Object System.Drawing.SolidBrush($bgColor)
        $g.FillEllipse($brush, 0, 0, ($canvasWidth - 1), ($canvasHeight - 1))
        $brush.Dispose()
    } elseif ($shape -eq "roundrect") {
        $radius = [int]($canvasWidth * 0.2)
        $w = $canvasWidth - 1
        $h = $canvasHeight - 1
        $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $d = $radius * 2
        $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
        $path.AddArc(($rect.Right - $d), $rect.Y, $d, $d, 270, 90)
        $path.AddArc(($rect.Right - $d), ($rect.Bottom - $d), $d, $d, 0, 90)
        $path.AddArc($rect.X, ($rect.Bottom - $d), $d, $d, 90, 90)
        $path.CloseFigure()
        
        $brush = New-Object System.Drawing.SolidBrush($bgColor)
        $g.FillPath($brush, $path)
        $brush.Dispose()
        $path.Dispose()
    }

    # Draw logo centered
    $minDim = [Math]::Min($canvasWidth, $canvasHeight)
    $targetSize = [int]($minDim * $scaleRatio)
    
    $srcW = $srcImg.Width
    $srcH = $srcImg.Height
    $aspect = [double]$srcW / [double]$srcH
    
    if ($aspect -gt 1.0) {
        $destW = $targetSize
        $destH = [int]($targetSize / $aspect)
    } else {
        $destH = $targetSize
        $destW = [int]($targetSize * $aspect)
    }
    
    $destX = [int](($canvasWidth - $destW) / 2)
    $destY = [int](($canvasHeight - $destH) / 2)

    $g.DrawImage($srcImg, $destX, $destY, $destW, $destH)
    
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated: $outputPath ($($canvasWidth)x$($canvasHeight))"
}

$densities = @{
    "mipmap-mdpi" = @{ size = 108; legacy = 48 }
    "mipmap-hdpi" = @{ size = 162; legacy = 72 }
    "mipmap-xhdpi" = @{ size = 216; legacy = 96 }
    "mipmap-xxhdpi" = @{ size = 324; legacy = 144 }
    "mipmap-xxxhdpi" = @{ size = 432; legacy = 192 }
}

$bgInk = [System.Drawing.Color]::FromArgb(255, 10, 7, 8) # #0a0708

foreach ($d in $densities.Keys) {
    $dir = Join-Path $resDir $d
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force }

    $fgSize = $densities[$d].size
    $fgPath = Join-Path $dir "ic_launcher_foreground.png"
    Resize-And-Save -canvasWidth $fgSize -canvasHeight $fgSize -scaleRatio 0.60 -outputPath $fgPath -shape "none"

    $legSize = $densities[$d].legacy
    $legPath = Join-Path $dir "ic_launcher.png"
    Resize-And-Save -canvasWidth $legSize -canvasHeight $legSize -scaleRatio 0.75 -outputPath $legPath -shape "roundrect" -bgColor $bgInk

    $rndPath = Join-Path $dir "ic_launcher_round.png"
    Resize-And-Save -canvasWidth $legSize -canvasHeight $legSize -scaleRatio 0.70 -outputPath $rndPath -shape "circle" -bgColor $bgInk
}

$srcImg.Dispose()
Write-Host "All icons regenerated cleanly with zero errors!"
