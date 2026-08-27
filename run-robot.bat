@echo off
REM One-click launcher for the Safe Robot (no exe build needed).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-robot.ps1" %*
