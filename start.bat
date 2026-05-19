@echo off
REM ============================================
REM  KI-Hub - Startskript
REM ============================================
setlocal

set "NODE_BIN="

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
    where node >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "NODE_BIN=node"
    )
)

if not defined NODE_BIN (
    echo.
    echo FEHLER: Node.js wurde weder ueber PATH noch ueber NODE_HOME/NODEJS_HOME gefunden.
    echo Bitte pruefen Sie Ihre Benutzerumgebungsvariablen.
    pause
    exit /b 1
)

echo Starte KI-Hub...
echo.

"%NODE_BIN%" "%~dp0src\server.js"

if %ERRORLEVEL% neq 0 (
    echo.
    echo FEHLER: Server konnte nicht gestartet werden.
    pause
)

endlocal
