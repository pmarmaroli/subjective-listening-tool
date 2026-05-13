@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ============================================================================
REM CONFIG BLOCK
REM ============================================================================
set "PROJECT_NAME=Subjective Listening Tool"
set "SERVER_PORT=3000"
set "SERVER_URL=http://localhost:%SERVER_PORT%"
set "HEALTH_ENDPOINT=%SERVER_URL%/health"
set "MAX_STARTUP_WAIT=30"
set "LOGS_DIR=%CD%\logs"

REM ============================================================================
REM PREFLIGHT CHECKS
REM ============================================================================
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist ".env" (
    echo [ERROR] .env file not found. Copy .env.example to .env and populate required variables:
    echo   - AZURE_STORAGE_CONNECTION_STRING
    echo   - WEB_PAGE_PASSWORD
    pause
    exit /b 1
)

REM ============================================================================
REM TARGETED CLEANUP
REM ============================================================================
echo [*] Cleaning up port %SERVER_PORT%...
for /f "tokens=5" %%A in ('netstat -aon ^| findstr :%SERVER_PORT%') do (
    taskkill /pid %%A /f >nul 2>&1
)

REM ============================================================================
REM DETERMINISTIC BOOTSTRAP
REM ============================================================================
if not exist "node_modules" (
    echo [*] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

REM ============================================================================
REM ORDERED STARTUP
REM ============================================================================
mkdir "%LOGS_DIR%" >nul 2>&1

echo [*] Starting %PROJECT_NAME%...
start "%PROJECT_NAME% Server" /d "%CD%" cmd /k npm start

REM ============================================================================
REM READINESS + OBSERVABILITY
REM ============================================================================
echo [*] Waiting for server to be ready (max %MAX_STARTUP_WAIT%s)...

setlocal enabledelayedexpansion
set "elapsed=0"
:wait_loop
if !elapsed! geq %MAX_STARTUP_WAIT% (
    echo [WARN] Server readiness check timed out after %MAX_STARTUP_WAIT%s.
    echo [WARN] Check %LOGS_DIR% for logs or verify .env configuration.
    goto user_handoff
)

timeout /t 1 /nobreak >nul 2>&1
powershell -Command "try { $null = Invoke-WebRequest -Uri '%HEALTH_ENDPOINT%' -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto ready
set /a elapsed=!elapsed!+1
goto wait_loop

:ready
echo [OK] Server is ready at %SERVER_URL%

REM ============================================================================
REM USER HANDOFF
REM ============================================================================
:user_handoff
echo.
echo ============================================================================
echo  %PROJECT_NAME% is running
echo ============================================================================
echo  URL:  %SERVER_URL%
echo  STOP: Close the server window or press Ctrl+C
echo ============================================================================
echo.

start "" "%SERVER_URL%"
pause
