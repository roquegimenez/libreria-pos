# 📚 Librería Las Trillizas - Sistema POS y Gestión de Inventario

Sistema web local de Punto de Venta (POS) y Control de Stock diseñado para librerías y papelerías. Desarrollado con **Node.js**, **Express** y base de datos relacional local en **SQLite**.

---

## 🚀 Características Principales

- **Punto de Venta Rápido (POS):**
  - Soporte para lectores de código de barras USB (detección automática de Enter y foco continuo).
  - Búsqueda en tiempo real por nombre o código de barras.
  - Carrito interactivo con cálculo automático de totales.
  - Múltiples métodos de pago: Efectivo, Transferencia y QR.
  - Sonido auditivo de confirmación al escanear productos.

- **Impresión de Tickets (80mm):**
  - Formato adaptado para impresoras térmicas de 80mm vía `window.print()`.
  - Encabezado configurable con nombre del local y subtítulo.
  - Logo oficial incorporado y marca de agua sutil en el fondo del ticket.

- **Gestión de Stock y Alertas:**
  - Descuento atómico de stock en cada venta (transacciones ACID con SQLite).
  - Alerta visual de stock bajo (menor o igual a 5 unidades).
  - CRUD completo de productos (crear, editar, eliminar y búsqueda).

- **Caja y Reportes en Tiempo Real:**
  - Control de ventas y ganancias del día en **hora oficial de Buenos Aires (GMT-3)**.
  - **Cierre de Caja:** Botón para reiniciar el contador de caja activa sin afectar el inventario ni los reportes históricos.
  - Reporte imprimible y exportación a formato **CSV (Excel)**.

- **Seguridad y Roles:**
  - **Administrador:** Acceso completo al inventario, métricas financieras, reportes, cierres de caja y configuración.
  - **Empleado / Cajero:** Acceso exclusivo a la pantalla de ventas y cobros.
  - Autenticación con contraseñas encriptadas con `bcryptjs` y sesiones seguras mediante tokens JWT.

---

## 🛠️ Tecnologías Utilizadas

- **Backend:** Node.js, Express 5
- **Base de Datos:** SQLite (`better-sqlite3` con soporte WAL)
- **Seguridad:** `bcryptjs`, `jsonwebtoken`
- **Frontend:** HTML5, CSS3, JavaScript Vanilla, Tailwind CSS
- **Audio:** Web Audio API (feedback al escanear)

---

## ⚡ Inicio Rápido (Local)

### Opción 1: Un solo clic (Recomendado en Windows)
1. Clona o descarga este repositorio.
2. Haz doble clic en el archivo:
   ```cmd
   INICIAR_SISTEMA.bat
   ```
   *(El script verifica Node.js, instala las librerías automáticamente si faltan, inicia el servidor y abre el navegador).*

---

### Opción 2: Desde la terminal
1. Clonar el repositorio:
   ```bash
   git clone https://github.com/TU_USUARIO/libreria-pos.git
   cd libreria-pos
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Iniciar el servidor:
   ```bash
   npm start
   ```

4. Abrir en el navegador:
   ```text
   http://localhost:3000
   ```

---

## 🔑 Credenciales Predeterminadas

| Rol | Usuario | Contraseña |
| :--- | :--- | :--- |
| **Administrador** | `admin` | `admin123` |
| **Empleado / Cajero** | `cajero` | `cajero123` |

*(Las credenciales pueden cambiarse en cualquier momento desde la pestaña Configuración del Panel de Administrador).*

---

## 🔐 Recuperación Segura de Contraseñas

Si cambiaste las credenciales de acceso y las olvidaste, cuentas con dos mecanismos seguros:

1. **Desde la Web (Pantalla de Login):**
   - Haz clic en **"¿Olvidaste tu contraseña?"**.
   - Ingresa tu **Clave Maestra de Seguridad** (por defecto: `TRILLIZAS-RECUPERAR`, configurable desde el Panel de Administrador) y define una nueva contraseña para `admin` o `cajero`.

2. **Desde la Computadora Local (Sin contraseñas previas):**
   - En la carpeta del proyecto haz doble clic en el archivo:
     ```cmd
     RECUPERAR_ACCESO.bat
     ```
   - Este asistente te permitirá restablecer la contraseña del Administrador, del Empleado o ambas de forma instantánea directamente sobre la base de datos local.

---

## 🧹 Limpieza y Puesta a Cero de Datos

- Para reiniciar el contador de caja, ventas y tickets en **$0,00** antes de una prueba real o nuevo inicio, ejecuta con doble clic:
  ```cmd
  RESETEAR_DATOS.bat
  ```

---

## 📄 Licencia
Este proyecto es de uso libre para fines educativos y comerciales.

