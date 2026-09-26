@echo off
title Libreria Las Trillizas - Recuperar Contrasenas

echo ========================================================
echo   RECUPERACION DE CONTRASE?AS - LIBRERIA LAS TRILLIZAS
echo ========================================================
echo.
echo Selecciona que deseas hacer:
echo.
echo   [1] Restablecer contrasena de ADMINISTRADOR (admin -^> admin123)
echo   [2] Restablecer contrasena de EMPLEADO (cajero -^> cajero123)
echo   [3] Restablecer AMBAS credenciales a valores iniciales de fabrica
echo   [4] Escribir una nueva clave personalizada para Administrador
echo   [5] Ver la Clave Maestra de Recuperacion Web
echo   [6] Cancelar y salir
echo.
set /p opcion=Ingresa tu opcion (1 a 6): 

if %opcion%==1 goto :OPCION1
if %opcion%==2 goto :OPCION2
if %opcion%==3 goto :OPCION3
if %opcion%==4 goto :OPCION4
if %opcion%==5 goto :OPCION5
goto :END

:OPCION1
echo.
node recuperar_acceso.js --admin
pause
goto :END

:OPCION2
echo.
node recuperar_acceso.js --cajero
pause
goto :END

:OPCION3
echo.
node recuperar_acceso.js --todo
pause
goto :END

:OPCION4
echo.
set /p nueva=Ingresa la nueva contrasena para el Administrador: 
node recuperar_acceso.js admin %nueva%
pause
goto :END

:OPCION5
echo.
node recuperar_acceso.js --ver-clave-maestra
pause
goto :END

:END
echo Saliendo...
