@echo off
setlocal
cd /d "%~dp0apps\desktop"
node "..\..\scripts\dev-electron.mjs"
endlocal
