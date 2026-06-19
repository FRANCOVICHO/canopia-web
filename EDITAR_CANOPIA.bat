@echo off
cd /d "%~dp0"
start "Canopia servidor" /min python -m http.server 4173
timeout /t 2 /nobreak > nul
start "" "http://127.0.0.1:4173/admin.html"
echo.
echo Panel admin local: http://127.0.0.1:4173/admin.html
echo La API y la base D1 solo funcionan cuando el sitio esta en Cloudflare Pages.
