@echo off
setlocal
pushd "%~dp0"
node server.mjs
set "EXITCODE=%ERRORLEVEL%"
popd
exit /b %EXITCODE%