@echo off
REM ============================================
REM  KI-Hub - startup script
REM ============================================
setlocal

set "NODE_BIN="

if defined NODE20_HOME (
    if exist "%NODE20_HOME%\node.exe" (
        set "NODE_BIN=%NODE20_HOME%\node.exe"
    )
)

if defined NODEJS_HOME (
    if exist "%NODEJS_HOME%\node.exe" (
        set "NODE_BIN=%NODEJS_HOME%\node.exe"
    )
)

if not defined NODE_BIN (
    if defined NODE_HOME (
        if exist "%NODE_HOME%\node.exe" (
            set "NODE_BIN=%NODE_HOME%\node.exe"
        )
    )
)

if not defined NODE_BIN (
    where fnm >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        for /f "tokens=*" %%e in ('fnm env --shell cmd') do call %%e
        fnm use 20 >nul 2>nul
        where node >nul 2>nul
        if %ERRORLEVEL% equ 0 (
            set "NODE_BIN=node"
        )
    )
)

if not defined NODE_BIN (
    where node >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "NODE_BIN=node"
    )
)

if not defined NODE_BIN (
    echo.
    echo ERROR: Node.js was not found through PATH, NODE_HOME, or NODEJS_HOME.
    echo Please check your user environment variables.
    pause
    exit /b 1
)

echo Starting KI-Hub...
for /f "tokens=*" %%v in ('"%NODE_BIN%" -v') do set "NODE_VERSION=%%v"
echo Node: %NODE_VERSION% ^(%NODE_BIN%^)
echo.

echo %NODE_VERSION% | findstr /b /c:"v20." >nul
if %ERRORLEVEL% neq 0 (
    echo WARNING: This project is intended for Node.js v20.
    echo          Set NODE20_HOME or NODEJS_HOME to your Node 20 installation.
    echo.
)
echo.

"%NODE_BIN%" "%~dp0src\server.js"

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Server could not be started.
    pause
)

endlocal
