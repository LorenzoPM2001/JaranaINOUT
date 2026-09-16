// ===== JaranaINOUT - Main Application Logic =====

(function () {
  'use strict';

  // === State ===
  let currentView = 'main';
  let selectedEmployee = null;
  let employees = [];
  let editingEmployeeId = null;

  // === DOM References ===
  const views = {
    main: document.getElementById('view-main'),
    clockin: document.getElementById('view-clockin'),
    admin: document.getElementById('view-admin')
  };

  // Main view
  const employeesGrid = document.getElementById('employees-grid');
  const noEmployees = document.getElementById('no-employees');
  const mainClock = document.getElementById('main-clock');
  const btnAdmin = document.getElementById('btn-admin');

  // Clockin view
  const btnBack = document.getElementById('btn-back');
  const clockinAvatar = document.getElementById('clockin-avatar');
  const clockinName = document.getElementById('clockin-name');
  const clockinClock = document.getElementById('clockin-clock');
  const clockinDate = document.getElementById('clockin-date');
  const clockinStatus = document.getElementById('clockin-status');
  const btnClockin = document.getElementById('btn-clockin');
  const btnClockout = document.getElementById('btn-clockout');
  const clockinFeedback = document.getElementById('clockin-feedback');
  const feedbackText = document.getElementById('feedback-text');
  const todayRecords = document.getElementById('today-records');

  // Admin view
  const btnBackAdmin = document.getElementById('btn-back-admin');
  const loginForm = document.getElementById('login-form');
  const loginUser = document.getElementById('login-user');
  const loginPass = document.getElementById('login-pass');
  const loginError = document.getElementById('login-error');
  const adminLogin = document.getElementById('admin-login');
  const adminDashboard = document.getElementById('admin-dashboard');
  const btnLogout = document.getElementById('btn-logout');
  const btnAddEmployee = document.getElementById('btn-add-employee');
  const adminEmployeesList = document.getElementById('admin-employees-list');
  const exportEmployee = document.getElementById('export-employee');
  const exportMonth = document.getElementById('export-month');
  const exportYear = document.getElementById('export-year');
  const btnExport = document.getElementById('btn-export');
  const btnExportAll = document.getElementById('btn-export-all');
  const exportAllMonth = document.getElementById('export-all-month');
  const exportAllYear = document.getElementById('export-all-year');
  const btnChangeCreds = document.getElementById('btn-change-creds');
  const newAdminUser = document.getElementById('new-admin-user');
  const newAdminPass = document.getElementById('new-admin-pass');

  // Modal
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const employeeForm = document.getElementById('employee-form');
  const empName = document.getElementById('emp-name');
  const empLastname = document.getElementById('emp-lastname');
  const empDni = document.getElementById('emp-dni');
  const empId = document.getElementById('emp-id');
  const btnModalClose = document.getElementById('btn-modal-close');
  const btnModalCancel = document.getElementById('btn-modal-cancel');

  // Toast container
  const toastContainer = document.getElementById('toast-container');

  // === Navigation ===
  function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
    currentView = viewName;
  }

  // === Clock ===
  function updateClocks() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const dateStr = now.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Capitalize first letter
    const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    if (mainClock) mainClock.textContent = timeStr;
    if (clockinClock && currentView === 'clockin') clockinClock.textContent = timeStr;
    if (clockinDate && currentView === 'clockin') clockinDate.textContent = capitalizedDate;
  }

  setInterval(updateClocks, 1000);
  updateClocks();

  // === Toast Notifications ===
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // === Confirm Dialog ===
  function showConfirm(title, message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML = `
        <div class="confirm-dialog">
          <h3>${title}</h3>
          <p>${message}</p>
          <div class="confirm-actions">
            <button class="btn-cancel" id="confirm-cancel">Cancelar</button>
            <button class="btn-confirm-danger" id="confirm-ok">Confirmar</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#confirm-ok').addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });

      overlay.querySelector('#confirm-cancel').addEventListener('click', () => {
        overlay.remove();
        resolve(false);
      });
    });
  }

  // === Utility ===
  function getInitials(name, lastName) {
    return (name.charAt(0) + (lastName ? lastName.charAt(0) : '')).toUpperCase();
  }

  // === MAIN VIEW: Employee Grid ===
  async function loadEmployees() {
    employees = await window.api.getEmployees();
    const statuses = await window.api.getAllStatus();

    if (employees.length === 0) {
      employeesGrid.classList.add('hidden');
      noEmployees.classList.remove('hidden');
      return;
    }

    employeesGrid.classList.remove('hidden');
    noEmployees.classList.add('hidden');

    employeesGrid.innerHTML = '';
    employees.forEach(emp => {
      const status = statuses[emp.id] || 'out';
      const initials = getInitials(emp.name, emp.lastName);

      const card = document.createElement('div');
      card.className = 'employee-card';
      card.innerHTML = `
        <div class="employee-avatar" style="background: ${emp.color}">
          ${initials}
          <div class="status-dot ${status}"></div>
        </div>
        <div class="employee-name">${emp.name} ${emp.lastName}</div>
        <div class="employee-status-text ${status}">
          ${status === 'in' ? '● Fichado' : '○ Sin fichar'}
        </div>
      `;
      card.addEventListener('click', () => openClockIn(emp));
      employeesGrid.appendChild(card);
    });
  }

  // === CLOCKIN VIEW ===
  async function openClockIn(employee) {
    selectedEmployee = employee;
    const initials = getInitials(employee.name, employee.lastName);

    clockinAvatar.textContent = initials;
    clockinAvatar.style.background = employee.color;
    clockinName.textContent = `${employee.name} ${employee.lastName}`;

    showView('clockin');
    await updateClockInStatus();
  }

  async function updateClockInStatus() {
    if (!selectedEmployee) return;

    const result = await window.api.getEmployeeStatus(selectedEmployee.id);

    // Update status badge
    clockinStatus.className = `clockin-status ${result.status}`;
    clockinStatus.textContent = result.status === 'in' ? '● Fichado actualmente' : '○ Sin fichar';

    // Enable/disable buttons based on status
    if (result.status === 'in') {
      btnClockin.disabled = true;
      btnClockin.style.opacity = '0.3';
      btnClockin.style.pointerEvents = 'none';
      btnClockout.disabled = false;
      btnClockout.style.opacity = '1';
      btnClockout.style.pointerEvents = 'auto';
    } else {
      btnClockin.disabled = false;
      btnClockin.style.opacity = '1';
      btnClockin.style.pointerEvents = 'auto';
      btnClockout.disabled = true;
      btnClockout.style.opacity = '0.3';
      btnClockout.style.pointerEvents = 'none';
    }

    // Update today records
    todayRecords.innerHTML = '';
    if (result.records.length === 0) {
      todayRecords.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; padding: 8px;">Sin registros hoy</p>';
    } else {
      result.records.forEach(record => {
        const time = new Date(record.timestamp).toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        const item = document.createElement('div');
        item.className = 'record-item';
        item.innerHTML = `
          <div class="record-dot ${record.type}"></div>
          <span class="record-type ${record.type}">${record.type === 'in' ? 'Entrada' : 'Salida'}</span>
          <span class="record-time">${time}</span>
        `;
        todayRecords.appendChild(item);
      });
    }
  }

  // Clock in button
  btnClockin.addEventListener('click', async () => {
    if (!selectedEmployee) return;

    const record = await window.api.clockIn(selectedEmployee.id);

    if (record.error) {
      showToast(record.error, 'error');
      return;
    }

    const time = new Date(record.timestamp).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Show feedback
    clockinFeedback.className = 'clockin-feedback entry';
    clockinFeedback.classList.remove('hidden');
    feedbackText.textContent = `Entrada registrada a las ${time}`;

    setTimeout(() => {
      clockinFeedback.classList.add('hidden');
    }, 3000);

    await updateClockInStatus();
  });

  // Clock out button
  btnClockout.addEventListener('click', async () => {
    if (!selectedEmployee) return;

    const record = await window.api.clockOut(selectedEmployee.id);

    if (record.confirmCancel) {
      const confirmed = await showConfirm('Anular fichaje', record.message);
      if (confirmed) {
        const cancelResult = await window.api.cancelLastEntry(selectedEmployee.id);
        if (cancelResult.success) {
          showToast('Fichaje de entrada anulado', 'success');
          await updateClockInStatus();
        } else {
          showToast(cancelResult.error || 'Error al anular', 'error');
        }
      }
      return;
    }

    if (record.error) {
      showToast(record.error, 'error');
      return;
    }

    const time = new Date(record.timestamp).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Show feedback
    clockinFeedback.className = 'clockin-feedback exit';
    clockinFeedback.classList.remove('hidden');
    feedbackText.textContent = `Salida registrada a las ${time}`;

    setTimeout(() => {
      clockinFeedback.classList.add('hidden');
    }, 3000);

    await updateClockInStatus();
  });

  // Back button
  btnBack.addEventListener('click', () => {
    showView('main');
    loadEmployees();
  });

  // === ADMIN VIEW ===
  btnAdmin.addEventListener('click', () => {
    showView('admin');
    adminLogin.classList.remove('hidden');
    adminDashboard.classList.add('hidden');
    loginUser.value = '';
    loginPass.value = '';
    loginError.classList.add('hidden');
    loginUser.focus();
  });

  btnBackAdmin.addEventListener('click', () => {
    showView('main');
    loadEmployees();
  });

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const result = await window.api.adminLogin(loginUser.value, loginPass.value);

    if (result.success) {
      adminLogin.classList.add('hidden');
      adminDashboard.classList.remove('hidden');
      await loadAdminEmployees();
      updateExportDefaults();
    } else {
      loginError.textContent = result.error;
      loginError.classList.remove('hidden');
      loginPass.value = '';
      loginPass.focus();
    }
  });

  // Logout
  btnLogout.addEventListener('click', () => {
    showView('main');
    loadEmployees();
  });

  // === Admin: Tabs Logic ===
  const adminNavItems = document.querySelectorAll('.admin-nav-item');
  const adminTabs = document.querySelectorAll('.admin-tab');

  adminNavItems.forEach(item => {
    item.addEventListener('click', () => {
      adminNavItems.forEach(nav => nav.classList.remove('active'));
      adminTabs.forEach(tab => tab.classList.add('hidden'));

      item.classList.add('active');
      const targetId = item.getAttribute('data-target');
      document.getElementById(targetId).classList.remove('hidden');
    });
  });

  // === Admin: Employee Management ===
  async function loadAdminEmployees() {
    employees = await window.api.getEmployees();
    const archivedEmployees = await window.api.getArchivedEmployees();
    adminEmployeesList.innerHTML = '';

    if (employees.length === 0 && archivedEmployees.length === 0) {
      adminEmployeesList.innerHTML = '<p style="color: var(--text-muted); font-size: 14px; padding: 16px; text-align: center;">No hay empleados registrados</p>';
      updateExportSelect(archivedEmployees);
      return;
    }

    employees.forEach(emp => {
      const initials = getInitials(emp.name, emp.lastName);
      const row = document.createElement('div');
      row.className = 'admin-employee-row';
      row.innerHTML = `
        <div class="admin-emp-avatar" style="background: ${emp.color}">${initials}</div>
        <div class="admin-emp-info">
          <span class="admin-emp-name">${emp.name} ${emp.lastName}</span>
          <span class="admin-emp-dni">${emp.dni || 'Sin DNI'}</span>
        </div>
        <div class="admin-emp-actions">
          <button class="btn-edit" data-id="${emp.id}">✏️ Editar</button>
          <button class="btn-delete" data-id="${emp.id}">🗑️ Dar de baja</button>
        </div>
      `;

      row.querySelector('.btn-edit').addEventListener('click', () => openEditEmployee(emp));
      row.querySelector('.btn-delete').addEventListener('click', () => deleteEmployee(emp));

      adminEmployeesList.appendChild(row);
    });

    // Show archived employees
    if (archivedEmployees.length > 0) {
      const separator = document.createElement('div');
      separator.style.cssText = 'margin: 16px 0 8px; padding: 8px 0; border-top: 1px solid var(--border-glass); color: var(--text-muted); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;';
      separator.textContent = `📁 Empleados dados de baja (${archivedEmployees.length})`;
      adminEmployeesList.appendChild(separator);

      archivedEmployees.forEach(emp => {
        const initials = getInitials(emp.name, emp.lastName);
        const archivedDate = new Date(emp.archivedAt).toLocaleDateString('es-ES');
        const row = document.createElement('div');
        row.className = 'admin-employee-row';
        row.style.opacity = '0.5';
        row.innerHTML = `
          <div class="admin-emp-avatar" style="background: ${emp.color}; filter: grayscale(50%);">${initials}</div>
          <div class="admin-emp-info">
            <span class="admin-emp-name">${emp.name} ${emp.lastName}</span>
            <span class="admin-emp-dni">Baja: ${archivedDate} · ${emp.dni || 'Sin DNI'}</span>
          </div>
          <div class="admin-emp-actions">
            <button class="btn-restore" data-id="${emp.id}">🔄 Dar de alta</button>
            <button class="btn-delete" data-id="${emp.id}">🗑️ Eliminar</button>
          </div>
        `;

        row.querySelector('.btn-restore').addEventListener('click', () => restoreEmployee(emp));
        row.querySelector('.btn-delete').addEventListener('click', () => permanentlyDeleteEmployee(emp));

        adminEmployeesList.appendChild(row);
      });
    }

    // Update export select
    updateExportSelect(archivedEmployees);
  }

  function updateExportSelect(archivedEmployees = []) {
    exportEmployee.innerHTML = '';
    const allForExport = [...employees, ...archivedEmployees];
    if (allForExport.length === 0) {
      exportEmployee.innerHTML = '<option value="">No hay empleados</option>';
      return;
    }
    employees.forEach(emp => {
      const option = document.createElement('option');
      option.value = emp.id;
      option.textContent = `${emp.name} ${emp.lastName}`;
      exportEmployee.appendChild(option);
    });
    if (archivedEmployees.length > 0) {
      const group = document.createElement('optgroup');
      group.label = '— Dados de baja —';
      archivedEmployees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.id;
        option.textContent = `${emp.name} ${emp.lastName} (baja)`;
        group.appendChild(option);
      });
      exportEmployee.appendChild(group);
    }
  }

  function updateExportDefaults() {
    const now = new Date();
    exportMonth.value = now.getMonth();
    exportYear.value = now.getFullYear();
    exportAllMonth.value = now.getMonth();
    exportAllYear.value = now.getFullYear();
  }

  // Restore archived employee
  async function restoreEmployee(emp) {
    const confirmed = await showConfirm(
      'Dar de alta',
      `¿Quieres volver a dar de alta a ${emp.name} ${emp.lastName}? Se conservarán todos sus registros anteriores.`
    );

    if (confirmed) {
      await window.api.restoreEmployee(emp.id);
      showToast(`${emp.name} ${emp.lastName} dado de alta de nuevo`, 'success');
      await loadAdminEmployees();
    }
  }

  // Permanently delete archived employee
  async function permanentlyDeleteEmployee(emp) {
    const confirmed = await showConfirm(
      'Eliminar permanentemente',
      `¿Seguro que quieres eliminar PERMANENTEMENTE a ${emp.name} ${emp.lastName}? Se borrarán todos sus registros de horas. Esta acción NO se puede deshacer.`
    );

    if (confirmed) {
      await window.api.permanentlyDeleteEmployee(emp.id);
      showToast(`${emp.name} ${emp.lastName} eliminado permanentemente`, 'success');
      await loadAdminEmployees();
    }
  }

  // Add Employee
  btnAddEmployee.addEventListener('click', () => {
    editingEmployeeId = null;
    modalTitle.textContent = 'Añadir Empleado';
    empName.value = '';
    empLastname.value = '';
    empDni.value = '';
    empId.value = '';
    modalOverlay.classList.remove('hidden');
    empName.focus();
  });

  // Edit Employee
  function openEditEmployee(emp) {
    editingEmployeeId = emp.id;
    modalTitle.textContent = 'Editar Empleado';
    empName.value = emp.name;
    empLastname.value = emp.lastName;
    empDni.value = emp.dni || '';
    empId.value = emp.id;
    modalOverlay.classList.remove('hidden');
    empName.focus();
  }

  // Delete Employee (archive)
  async function deleteEmployee(emp) {
    const confirmed = await showConfirm(
      'Dar de baja',
      `¿Seguro que quieres dar de baja a ${emp.name} ${emp.lastName}? Sus registros de horas se conservarán para futuras exportaciones.`
    );

    if (confirmed) {
      await window.api.deleteEmployee(emp.id);
      showToast(`${emp.name} ${emp.lastName} dado de baja`, 'success');
      await loadAdminEmployees();
    }
  }

  // Modal close
  function closeModal() {
    modalOverlay.classList.add('hidden');
    editingEmployeeId = null;
  }

  btnModalClose.addEventListener('click', closeModal);
  btnModalCancel.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Employee form submit
  employeeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const employeeData = {
      name: empName.value.trim(),
      lastName: empLastname.value.trim(),
      dni: empDni.value.trim()
    };

    if (!employeeData.name || !employeeData.lastName) {
      showToast('Nombre y apellidos son obligatorios', 'error');
      return;
    }

    if (editingEmployeeId) {
      await window.api.editEmployee(editingEmployeeId, employeeData);
      showToast(`${employeeData.name} ${employeeData.lastName} actualizado`, 'success');
    } else {
      await window.api.addEmployee(employeeData);
      showToast(`${employeeData.name} ${employeeData.lastName} añadido`, 'success');
    }

    closeModal();
    await loadAdminEmployees();
  });

  // Export Excel
  btnExport.addEventListener('click', async () => {
    const empId = exportEmployee.value;
    const month = parseInt(exportMonth.value);
    const year = parseInt(exportYear.value);

    if (!empId) {
      showToast('Selecciona un empleado', 'error');
      return;
    }

    if (!year || year < 2020) {
      showToast('Introduce un año válido', 'error');
      return;
    }

    const result = await window.api.exportExcel(empId, month, year);

    if (result.error) {
      showToast(result.error, 'error');
    } else if (result.canceled) {
      // User cancelled the save dialog
    } else if (result.success) {
      showToast('Excel descargado correctamente', 'success');
    }
  });

  // Export Excel ALL employees
  btnExportAll.addEventListener('click', async () => {
    const month = parseInt(exportAllMonth.value);
    const year = parseInt(exportAllYear.value);

    if (!year || year < 2020) {
      showToast('Introduce un año válido', 'error');
      return;
    }

    const result = await window.api.exportExcelAll(month, year);

    if (result.error) {
      showToast(result.error, 'error');
    } else if (result.canceled) {
      // User cancelled the save dialog
    } else if (result.success) {
      showToast('Excel de todos los empleados descargado', 'success');
    }
  });

  // Change admin credentials
  btnChangeCreds.addEventListener('click', async () => {
    const username = newAdminUser.value.trim();
    const password = newAdminPass.value.trim();

    if (!username || !password) {
      showToast('Introduce usuario y contraseña', 'error');
      return;
    }

    await window.api.changeAdminCredentials(username, password);
    showToast('Credenciales actualizadas', 'success');
    newAdminUser.value = '';
    newAdminPass.value = '';
  });

  // === Keyboard shortcuts ===
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!modalOverlay.classList.contains('hidden')) {
        closeModal();
      } else if (currentView === 'clockin') {
        showView('main');
        loadEmployees();
      } else if (currentView === 'admin') {
        if (!adminDashboard.classList.contains('hidden')) {
          showView('main');
          loadEmployees();
        } else {
          showView('main');
          loadEmployees();
        }
      }
    }
  });

  // === Initialize ===
  loadEmployees();

})();
