@echo off
REM Launch unpacked Mira after `npm run pack:windows` (portable / win-unpacked).
setlocal
cd /d "%~dp0"

if exist "Mira-Portable-*.exe" (
  for %%F in (Mira-Portable-*.exe) do (
    start "" "%%F"
    exit /b 0
  )
)

if exist "win-unpacked\Mira.exe" (
  start "" "win-unpacked\Mira.exe"
  exit /b 0
)

if exist "Mira-Setup-*.exe" (
  echo Installer found. Run Mira-Setup-*.exe to install, then start Mira from the Start menu.
  pause
  exit /b 0
)

echo Mira Windows build not found. From repo root run: npm run pack:windows
pause
exit /b 1
