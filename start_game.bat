@echo off
setlocal
cd /d "%~dp0"

:: Check if port 8080 server is already running
netstat -ano | findstr ":8080" | findstr "LISTENING" >nul 2>&1
if %errorlevel% neq 0 (
    start /b python -m http.server 8080 >nul 2>&1
    timeout /t 1 /nobreak >nul
)

:: Locate Microsoft Edge
set "EDGE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_PATH%" set "EDGE_PATH=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE_PATH%" (
    start "" "%EDGE_PATH%" --app=http://localhost:8080/index.html --window-size=1920,1080 --disable-pinch --autoplay-policy=no-user-gesture-required
) else (
    start "" "http://localhost:8080/index.html"
)
exit /b 0
