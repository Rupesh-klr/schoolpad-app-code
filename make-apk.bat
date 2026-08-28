@echo off
REM ---------------------------------------------------------------------------
REM  Double-click this to build a shareable release APK.
REM
REM  Nothing to type and nothing to edit. The script finds this machine's Wi-Fi
REM  address on its own and bakes it into the build, so the APK reaches your API
REM  from a phone on the same network.
REM
REM  From a terminal you can still override anything:
REM      make-apk.bat -ApiBase https://api.myagemap.com
REM      make-apk.bat -ApiPort 8080
REM      make-apk.bat -Bump patch
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

echo.
echo   Building the Learning App release APK...
echo   (first build takes 10-20 minutes; later ones are much faster)
echo.

REM -ExecutionPolicy Bypass because Windows blocks unsigned local scripts by
REM default. It applies to this one process - nothing is changed system-wide.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\build-apk.ps1" %*

REM Hold the window open either way. On failure the error stays readable; on
REM success the path to the APK does.
if errorlevel 1 (
  echo.
  echo   The build FAILED. The error is above.
  echo.
) else (
  echo.
  echo   Done. The release folder should have opened in Explorer.
  echo.
)

pause
