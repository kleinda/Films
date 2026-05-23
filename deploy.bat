@echo off
title Deploy – DAVID FILMS
cd /d "%~dp0"

echo.
echo ================================
echo  DAVID FILMS - Deploy to GitHub
echo ================================
echo.

git status --short
echo.

set /p COMMITMSG=Commit message (default: update):
if "%COMMITMSG%"=="" set COMMITMSG=update

echo.
git add .
git commit -m "%COMMITMSG%"
git push

echo.
echo ================================
echo  Done! Site updates in ~1 min:
echo  https://kleinda.github.io/Films/
echo ================================
echo.
pause
