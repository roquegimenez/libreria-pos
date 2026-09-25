@echo off
title Libreria Las Trillizas - Sistema POS

echo ========================================================
echo   Libreria Las Trillizas - Iniciando Sistema POS
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 goto :NO_NODE

if not exist node_modules goto :INSTALL_DEPS
goto :START_APP

:INSTALL_DEPS
echo [INFO] Primera ejecucion detectada. Instalando librerias...
call npm install
if %errorlevel% neq 0 goto :ERROR_NPM
echo.
echo [OK] Librerias instaladas con exito.
echo.

:START_APP
echo Abriendo navegador en http://localhost:3000 ...
start " cmd /c timeout /t 2 /nobreak >nul && start http://localhost:3000

echo ========================================================
echo Servidor en marcha en http://localhost:3000
echo (No cierres esta ventana mientras uses el sistema)
echo ========================================================
echo.

node server.js
goto :END

:NO_NODE
echo.
echo [ATENCION] Node.js no esta instalado en esta computadora.
echo Para que el sistema funcione de manera local, necesitas Node.js.
echo.
echo Abriendo la pagina de descarga oficial...
start https://nodejs.org/
echo.
echo Por favor instala Node.js (version LTS) y vuelve a abrir este archivo.
echo.
pause
goto :END

:ERROR_NPM
echo.
echo [ERROR] Ocurrio un problema al instalar las dependencias.
pause
goto :END

:END
