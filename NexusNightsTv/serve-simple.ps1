# Simple HTTP Server for NEXUSNIGHT TV

$port = 8080

Write-Host ""
Write-Host "Starting NEXUSNIGHT TV Development Server..." -ForegroundColor Cyan
Write-Host "Port: $port" -ForegroundColor Yellow
Write-Host ""
Write-Host "Open in browser: http://localhost:$port" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

# Use Python if available
python -m http.server $port
