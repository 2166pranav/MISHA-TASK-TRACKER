@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

node -e "if (Number(process.versions.node.split('.')[0]) < 20) process.exit(1)"
if errorlevel 1 (
  echo This app requires Node.js 20 or newer. Update Node.js and try again.
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" (
  echo Installing the website's required packages...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo Starting Task Tracker. Keep this window open while you use the website.
set "APP_PORT=3001"
netstat -ano | findstr /R /C:":3001 .*LISTENING" >nul
if not errorlevel 1 set "APP_PORT=3002"
start "Task Tracker server" /b cmd /c "set PORT=%APP_PORT%&& npm start"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:%APP_PORT%/api/health'; $app='http://127.0.0.1:%APP_PORT%'; $deadline=(Get-Date).AddSeconds(60); do { try { $r=Invoke-RestMethod -Uri $url -TimeoutSec 2; if ($r.ok) { Start-Process $app; exit 0 } } catch {}; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline); Write-Host 'Task Tracker server did not start. Check the npm error shown above.'; exit 1"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Task Tracker is running at http://127.0.0.1:%APP_PORT%.
pause
