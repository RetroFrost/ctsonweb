@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run dev -- --host 0.0.0.0
