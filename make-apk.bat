@echo off
REM ---------------------------------------------------------------------------
REM  Double-click this to build a shareable release APK.
REM
REM  Exists because "open a terminal, cd to the folder, run npm run apk" is
REM  three steps that go wrong in different ways. This is one.
REM
REM  From a terminal you can pass the same options through:
REM      make-apk.bat -ApiBase https://api.myagemap.com
REM      make-apk.bat -Bump patch
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

echo.
echo   Building the Learning App release APK...
echo.

REM -ExecutionPolicy Bypass because the default Windows policy blocks unsigned
REM local scripts, and it applies to this process only - nothing is changed
REM system-wide.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\build-apk.ps1" %*

REM Hold the window open on failure so the error is readable. Without this a
REM double-click that fails just closes, showing nothing.
if errorlevel 1 (
  echo.
  echo   The build failed. The error is above.
  echo.
  pause
  exit /b 1
)

pause
