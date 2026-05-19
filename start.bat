@echo off
REM ============================================
REM  KI-Mentor Hub - Startskript
REM ============================================

set NODE_PATH=J:\dev\quellen\2025\gfosweb\xtimeweb\pep\ewbe12\ewbe12-war\node_installation\node
set PATH=%NODE_PATH%;%PATH%

echo Starte KI-Mentor Hub...
echo.

node "%~dp0src\server.js"

if %ERRORLEVEL% neq 0 (
    echo.
    echo FEHLER: Server konnte nicht gestartet werden.
    echo Bitte pruefen Sie, ob Node.js unter %NODE_PATH% verfuegbar ist.
    pause
)
