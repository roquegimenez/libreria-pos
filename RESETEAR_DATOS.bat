@echo off
title Libreria Las Trillizas - Limpiar Datos

echo ========================================================
echo   LIMPIEZA DE DATOS - LIBRERIA LAS TRILLIZAS
echo ========================================================
echo.
echo Selecciona que deseas limpiar:
echo.
echo   [1] Limpiar SOLO ventas, tickets y caja
echo       (Recomendado: Mantiene tus productos y usuarios, pone ventas en )
echo.
echo   [2] Restablecer estado inicial de fabrica
echo       (Borra ventas y restaura los 10 productos de muestra originales)
echo.
echo   [3] Vaciar TODO el catalogo y ventas
echo       (Deja 0 ventas y 0 productos, listo para cargar inventario real)
echo.
echo   [4] Cancelar y salir
echo.
set /p opcion=Ingresa tu opcion (1, 2, 3 o 4): 

if %opcion%==1 goto :OPCION1
if %opcion%==2 goto :OPCION2
if %opcion%==3 goto :OPCION3
goto :END

:OPCION1
echo.
node reset.js --ventas
pause
goto :END

:OPCION2
echo.
node reset.js --todo
pause
goto :END

:OPCION3
echo.
node reset.js --vacio
pause
goto :END

:END
echo Saliendo...
