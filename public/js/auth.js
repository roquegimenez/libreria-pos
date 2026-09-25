// Manejo de Autenticación y Sesión del Cliente
const Auth = {
  getToken() {
    return localStorage.getItem('pos_token');
  },

  getUser() {
    const userStr = localStorage.getItem('pos_user');
    try {
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },

  setSession(token, user) {
    localStorage.setItem('pos_token', token);
    localStorage.setItem('pos_user', JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
  },

  logout() {
    this.clearSession();
    window.location.href = 'index.html';
  },

  // Obtener cabeceras con Bearer token
  getHeaders() {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  },

  // Wrapper para fetch con validación de expiración de sesión
  async apiFetch(url, options = {}) {
    const headers = {
      ...this.getHeaders(),
      ...(options.headers || {})
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 || response.status === 403) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        alert(data.error || 'Su sesión ha expirado. Por favor ingrese de nuevo.');
        Auth.logout();
        throw new Error('No autenticado');
      }
    }

    return response;
  },

  // Validar acceso según rol en las pantallas
  checkAccess(requiredRole = null) {
    const token = this.getToken();
    const user = this.getUser();

    if (!token || !user) {
      window.location.href = 'index.html';
      return false;
    }

    if (requiredRole && user.rol !== requiredRole) {
      alert(`Acceso no autorizado. Se requiere rol de ${requiredRole}.`);
      if (user.rol === 'empleado') {
        window.location.href = 'pos.html';
      } else {
        window.location.href = 'admin.html';
      }
      return false;
    }

    return true;
  },

  // Formateador exacto en Zona Horaria Buenos Aires (GMT-3)
  formatDateTimeBA(dateStr) {
    if (!dateStr) return '';
    let iso = dateStr;
    if (typeof dateStr === 'string') {
      if (!dateStr.includes('T') && dateStr.includes(' ')) {
        iso = dateStr.replace(' ', 'T') + 'Z';
      } else if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        iso = dateStr + 'Z';
      }
    }
    const d = new Date(iso);
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      dateStyle: 'short',
      timeStyle: 'medium'
    }).format(d);
  }
};
