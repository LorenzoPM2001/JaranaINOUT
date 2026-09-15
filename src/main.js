const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Determine data path - use app.getPath('userData') in production
function getDataPath() {
  const userDataPath = app.getPath('userData');
  const dataDir = path.join(userDataPath, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'data.json');
}

function getDefaultData() {
  return {
    admin: {
      username: 'admin',
      password: 'admin'
    },
    employees: [],
    archivedEmployees: [],
    records: []
  };
}

function loadData() {
  const dataPath = getDataPath();
  try {
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf-8');
      const data = JSON.parse(raw);
      // Backward compatibility: ensure archivedEmployees exists
      if (!data.archivedEmployees) {
        data.archivedEmployees = [];
      }
      return data;
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
  const defaultData = getDefaultData();
  saveData(defaultData);
  return defaultData;
}

function saveData(data) {
  const dataPath = getDataPath();
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
}

// Generate a simple UUID
function generateId() {
  return 'emp-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
}

// Generate a random color for employee avatar
function generateColor() {
  const colors = [
    '#6C5CE7', '#A29BFE', '#0984E3', '#00B894', '#00CEC9',
    '#FDCB6E', '#E17055', '#D63031', '#E84393', '#2D3436',
    '#636E72', '#74B9FF', '#55EFC4', '#FFEAA7', '#FAB1A0',
    '#FD79A8', '#6C5CE7', '#81ECEC', '#DFE6E9', '#B2BEC3'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    title: 'JaranaINOUT',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    backgroundColor: '#0a0a1a'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();

  // --- IPC Handlers ---

  // Get all employees
  ipcMain.handle('get-employees', () => {
    const data = loadData();
    return data.employees;
  });

  // Add employee
  ipcMain.handle('add-employee', (event, employee) => {
    const data = loadData();
    const newEmployee = {
      id: generateId(),
      name: employee.name,
      lastName: employee.lastName,
      dni: employee.dni || '',
      color: generateColor()
    };
    data.employees.push(newEmployee);
    saveData(data);
    return newEmployee;
  });

  // Edit employee
  ipcMain.handle('edit-employee', (event, { id, updates }) => {
    const data = loadData();
    const idx = data.employees.findIndex(e => e.id === id);
    if (idx === -1) return { error: 'Empleado no encontrado' };
    data.employees[idx] = { ...data.employees[idx], ...updates };
    saveData(data);
    return data.employees[idx];
  });

  // Delete employee (archive - keeps records)
  ipcMain.handle('delete-employee', (event, id) => {
    const data = loadData();
    const employee = data.employees.find(e => e.id === id);
    if (!employee) return { error: 'Empleado no encontrado' };
    // Move to archived
    employee.archivedAt = new Date().toISOString();
    data.archivedEmployees.push(employee);
    data.employees = data.employees.filter(e => e.id !== id);
    // Records are kept intact
    saveData(data);
    return { success: true };
  });

  // Get archived employees
  ipcMain.handle('get-archived-employees', () => {
    const data = loadData();
    return data.archivedEmployees;
  });

  // Clock in
  ipcMain.handle('clock-in', (event, employeeId) => {
    const data = loadData();
    const record = {
      employeeId,
      type: 'in',
      timestamp: new Date().toISOString()
    };
    data.records.push(record);
    saveData(data);
    return record;
  });

  // Clock out
  ipcMain.handle('clock-out', (event, employeeId) => {
    const data = loadData();
    const record = {
      employeeId,
      type: 'out',
      timestamp: new Date().toISOString()
    };
    data.records.push(record);
    saveData(data);
    return record;
  });

  // Get records for an employee
  ipcMain.handle('get-records', (event, { employeeId, month, year }) => {
    const data = loadData();
    return data.records.filter(r => {
      if (r.employeeId !== employeeId) return false;
      const d = new Date(r.timestamp);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  });

  // Get employee status (is currently clocked in?)
  ipcMain.handle('get-employee-status', (event, employeeId) => {
    const data = loadData();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const todayRecords = data.records
      .filter(r => {
        if (r.employeeId !== employeeId) return false;
        return r.timestamp.startsWith(todayStr);
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (todayRecords.length === 0) return { status: 'out', records: [] };
    
    const lastRecord = todayRecords[todayRecords.length - 1];
    return {
      status: lastRecord.type === 'in' ? 'in' : 'out',
      records: todayRecords
    };
  });

  // Get all employees status
  ipcMain.handle('get-all-status', () => {
    const data = loadData();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const statuses = {};
    data.employees.forEach(emp => {
      const todayRecords = data.records
        .filter(r => r.employeeId === emp.id && r.timestamp.startsWith(todayStr))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      if (todayRecords.length === 0) {
        statuses[emp.id] = 'out';
      } else {
        const last = todayRecords[todayRecords.length - 1];
        statuses[emp.id] = last.type === 'in' ? 'in' : 'out';
      }
    });
    return statuses;
  });

  // Admin login
  ipcMain.handle('admin-login', (event, { username, password }) => {
    const data = loadData();
    if (data.admin.username === username && data.admin.password === password) {
      return { success: true };
    }
    return { success: false, error: 'Usuario o contraseña incorrectos' };
  });

  // Change admin credentials
  ipcMain.handle('change-admin-credentials', (event, { username, password }) => {
    const data = loadData();
    data.admin.username = username;
    data.admin.password = password;
    saveData(data);
    return { success: true };
  });

  // Helper: find all employee IDs that share the same DNI
  function findAllIdsForDni(data, dni) {
    if (!dni) return [];
    const allEmps = [...data.employees, ...data.archivedEmployees];
    return allEmps.filter(e => e.dni && e.dni === dni).map(e => e.id);
  }

  // Helper: generate rows for a set of employee IDs for a given month
  function generateMonthRows(data, employeeIds, month, year, emptyChar) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthRecords = data.records
      .filter(r => {
        if (!employeeIds.includes(r.employeeId)) return false;
        const d = new Date(r.timestamp);
        return d.getMonth() === month && d.getFullYear() === year;
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const rows = [];
    let totalMinutes = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayRecords = monthRecords.filter(r => r.timestamp.startsWith(dayStr));

      const ins = dayRecords.filter(r => r.type === 'in');
      const outs = dayRecords.filter(r => r.type === 'out');

      const entry1 = ins[0] ? new Date(ins[0].timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : emptyChar;
      const exit1 = outs[0] ? new Date(outs[0].timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : emptyChar;
      const entry2 = ins[1] ? new Date(ins[1].timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : emptyChar;
      const exit2 = outs[1] ? new Date(outs[1].timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : emptyChar;

      let dayMinutes = 0;
      for (let i = 0; i < Math.min(ins.length, outs.length); i++) {
        const inTime = new Date(ins[i].timestamp);
        const outTime = new Date(outs[i].timestamp);
        if (outTime > inTime) {
          dayMinutes += (outTime - inTime) / 60000;
        }
      }
      totalMinutes += dayMinutes;

      const dayHours = dayMinutes > 0
        ? `${Math.floor(dayMinutes / 60)}:${String(Math.round(dayMinutes % 60)).padStart(2, '0')}`
        : emptyChar;

      const dayOfWeek = new Date(year, month, day).toLocaleDateString('es-ES', { weekday: 'short' });

      rows.push({
        'Día': `${dayOfWeek} ${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`,
        'Entrada 1': entry1,
        'Salida 1': exit1,
        'Entrada 2': entry2,
        'Salida 2': exit2,
        'Horas Totales': dayHours
      });
    }

    const totalHours = `${Math.floor(totalMinutes / 60)}:${String(Math.round(totalMinutes % 60)).padStart(2, '0')}`;
    rows.push({
      'Día': 'TOTAL MES',
      'Entrada 1': '',
      'Salida 1': '',
      'Entrada 2': '',
      'Salida 2': '',
      'Horas Totales': totalHours
    });

    return rows;
  }

  // Export Excel (single employee)
  ipcMain.handle('export-excel', async (event, { employeeId, month, year }) => {
    const data = loadData();
    const allEmps = [...data.employees, ...data.archivedEmployees];
    const employee = allEmps.find(e => e.id === employeeId);
    if (!employee) return { error: 'Empleado no encontrado' };

    const XLSX = require('xlsx');
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Find all IDs sharing the same DNI to merge records
    let employeeIds = [employeeId];
    if (employee.dni) {
      const dniIds = findAllIdsForDni(data, employee.dni);
      if (dniIds.length > 0) employeeIds = dniIds;
    }

    const rows = generateMonthRows(data, employeeIds, month, year, '—');

    const wb = XLSX.utils.book_new();
    const headerData = [
      [`Registro de Horas - ${employee.name} ${employee.lastName}`],
      [`${monthNames[month]} ${year}`],
      [employee.dni ? `DNI: ${employee.dni}` : ''],
      []
    ];

    const ws = XLSX.utils.aoa_to_sheet(headerData);
    XLSX.utils.sheet_add_json(ws, rows, { origin: 'A5' });

    ws['!cols'] = [
      { wch: 22 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Horas');

    const defaultName = `Horas_${employee.lastName}_${employee.name}_${monthNames[month]}_${year}.xlsx`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar Excel de horas',
      defaultPath: defaultName,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });

    if (result.canceled) return { canceled: true };

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, path: result.filePath };
  });

  // Export Excel for ALL employees (grouped by DNI to avoid duplicates)
  ipcMain.handle('export-excel-all', async (event, { month, year }) => {
    const data = loadData();
    const allEmployees = [...data.employees, ...data.archivedEmployees];
    if (allEmployees.length === 0) return { error: 'No hay empleados registrados' };

    const XLSX = require('xlsx');
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const wb = XLSX.utils.book_new();

    // Group employees by DNI to avoid duplicate sheets
    const processedDnis = new Set();
    const processedIds = new Set();

    for (const employee of allEmployees) {
      // Skip if we already processed this person (by DNI)
      if (employee.dni && processedDnis.has(employee.dni)) continue;
      if (processedIds.has(employee.id)) continue;

      let employeeIds = [employee.id];
      if (employee.dni) {
        const dniIds = findAllIdsForDni(data, employee.dni);
        if (dniIds.length > 0) employeeIds = dniIds;
        processedDnis.add(employee.dni);
      }
      employeeIds.forEach(id => processedIds.add(id));

      const rows = generateMonthRows(data, employeeIds, month, year, '');

      const headerData = [
        [`Registro de Horas - ${employee.name} ${employee.lastName}`],
        [`${monthNames[month]} ${year}`],
        [employee.dni ? `DNI: ${employee.dni}` : ''],
        []
      ];

      const ws = XLSX.utils.aoa_to_sheet(headerData);
      XLSX.utils.sheet_add_json(ws, rows, { origin: 'A5' });

      ws['!cols'] = [
        { wch: 22 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }
      ];

      const sheetName = `${employee.name} ${employee.lastName}`.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const defaultName = `Horas_Todos_${monthNames[month]}_${year}.xlsx`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar Excel de todos los empleados',
      defaultPath: defaultName,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });

    if (result.canceled) return { canceled: true };

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, path: result.filePath };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
