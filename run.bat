@echo off
title GI Billing Software
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
echo Starting GI Billing Software...
call node_modules\electron\dist\electron.exe .
if errorlevel 1 (
  echo.
  echo App exited with an error. Press any key to close.
  pause >nul
)
