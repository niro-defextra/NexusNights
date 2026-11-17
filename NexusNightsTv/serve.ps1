# NEXUSNIGHT TV - Local Development Server
# Serves the app locally to test in browser

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     NEXUSNIGHT TV - Development Server                  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$port = 8080
$path = $PSScriptRoot

Write-Host "🚀 Starting local server..." -ForegroundColor Yellow
Write-Host "   Directory: $path" -ForegroundColor Gray
Write-Host "   Port: $port" -ForegroundColor Gray
Write-Host ""

# Check if port is available
$portInUse = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "⚠ Port $port is already in use" -ForegroundColor Yellow
    $port = 8081
    Write-Host "  Using port $port instead" -ForegroundColor Yellow
    Write-Host ""
}

# Start HTTP server using Python (if available)
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCmd) {
    Write-Host "✓ Using Python HTTP server" -ForegroundColor Green
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  🌐 Open in browser:" -ForegroundColor Green
    Write-Host "     http://localhost:$port" -ForegroundColor White
    Write-Host ""
    Write-Host "  ⌨️  Use arrow keys to navigate" -ForegroundColor Yellow
    Write-Host "  ⏎  Press Enter to select" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Press Ctrl+C to stop server" -ForegroundColor Gray
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    
    Push-Location $path
    try {
        python -m http.server $port
    } finally {
        Pop-Location
    }
    exit
}

# Fallback: Try Node.js http-server
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    # Check if http-server is installed
    $httpServer = Get-Command http-server -ErrorAction SilentlyContinue
    if (-not $httpServer) {
        Write-Host "⚠ Installing http-server..." -ForegroundColor Yellow
        npm install -g http-server
    }
    
    Write-Host "✓ Using Node.js HTTP server" -ForegroundColor Green
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  🌐 Open in browser:" -ForegroundColor Green
    Write-Host "     http://localhost:$port" -ForegroundColor White
    Write-Host ""
    Write-Host "  ⌨️  Use arrow keys to navigate" -ForegroundColor Yellow
    Write-Host "  ⏎  Press Enter to select" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Press Ctrl+C to stop server" -ForegroundColor Gray
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    
    http-server $path -p $port
    exit
}

# Last resort: PowerShell HTTP server (basic)
Write-Host "✓ Using PowerShell HTTP server" -ForegroundColor Green
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  🌐 Open in browser:" -ForegroundColor Green
Write-Host "     http://localhost:$port" -ForegroundColor White
Write-Host ""
Write-Host "  ⌨️  Use arrow keys to navigate" -ForegroundColor Yellow
Write-Host "  ⏎  Press Enter to select" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Press Ctrl+C to stop server" -ForegroundColor Gray
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Simple PowerShell HTTP server
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "Server running..." -ForegroundColor Green

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $requestedPath = $request.Url.LocalPath.TrimStart('/')
        if ($requestedPath -eq '' -or $requestedPath -eq '/') {
            $requestedPath = 'index.html'
        }
        
        $filePath = Join-Path $path $requestedPath
        
        if (Test-Path $filePath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $content.Length
            
            # Set MIME type
            $extension = [System.IO.Path]::GetExtension($filePath)
            switch ($extension) {
                '.html' { $response.ContentType = 'text/html; charset=utf-8' }
                '.css'  { $response.ContentType = 'text/css; charset=utf-8' }
                '.js'   { $response.ContentType = 'application/javascript; charset=utf-8' }
                '.json' { $response.ContentType = 'application/json; charset=utf-8' }
                '.png'  { $response.ContentType = 'image/png' }
                '.jpg'  { $response.ContentType = 'image/jpeg' }
                '.jpeg' { $response.ContentType = 'image/jpeg' }
                '.gif'  { $response.ContentType = 'image/gif' }
                '.svg'  { $response.ContentType = 'image/svg+xml' }
                default { $response.ContentType = 'application/octet-stream' }
            }
            
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
            $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $requestedPath")
            $response.OutputStream.Write($notFound, 0, $notFound.Length)
        }
        
        $response.Close()
    }
} finally {
    $listener.Stop()
    Write-Host ""
    Write-Host "Server stopped." -ForegroundColor Yellow
}
