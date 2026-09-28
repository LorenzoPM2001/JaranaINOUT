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
    records: [],
    requests: [],
    shifts: [],
    lateEntryThresholdMinutes: 15
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
      // Backward compatibility: ensure requests exists
      if (!data.requests) {
        data.requests = [];
      }
      // Backward compatibility: ensure shifts exists
      if (!data.shifts) {
        data.shifts = [];
      }
      if (data.lateEntryThresholdMinutes === undefined) {
        data.lateEntryThresholdMinutes = 15;
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

// Find the shift that started most recently before current time
function findCurrentShift(shifts) {
  if (!shifts || shifts.length === 0) return null;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sorted = shifts.map(s => {
    const [h, m] = s.startTime.split(':').map(Number);
    return { ...s, minutes: h * 60 + m };
  }).sort((a, b) => a.minutes - b.minutes);
  let current = sorted[sorted.length - 1];
  for (const s of sorted) {
    if (s.minutes <= nowMinutes) current = s;
  }
  return current;
}

// Find the next shift after the given one
function findNextShift(shifts, currentShift) {
  if (!shifts || shifts.length <= 1) return null;
  const sorted = shifts.map(s => {
    const [h, m] = s.startTime.split(':').map(Number);
    return { ...s, minutes: h * 60 + m };
  }).sort((a, b) => a.minutes - b.minutes);
  const idx = sorted.findIndex(s => s.id === currentShift.id);
  if (idx === -1) return null;
  return sorted[(idx + 1) % sorted.length];
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    title: 'JaranaINOUT',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
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

  // Restore archived employee (dar de alta de nuevo)
  ipcMain.handle('restore-employee', (event, id) => {
    const data = loadData();
    const empIdx = data.archivedEmployees.findIndex(e => e.id === id);
    if (empIdx === -1) return { error: 'Empleado no encontrado en archivados' };
    const employee = data.archivedEmployees[empIdx];
    delete employee.archivedAt;
    data.employees.push(employee);
    data.archivedEmployees.splice(empIdx, 1);
    saveData(data);
    return { success: true };
  });

  // Permanently delete archived employee and all their records
  ipcMain.handle('permanently-delete-employee', (event, id) => {
    const data = loadData();
    data.archivedEmployees = data.archivedEmployees.filter(e => e.id !== id);
    data.records = data.records.filter(r => r.employeeId !== id);
    saveData(data);
    return { success: true };
  });

  // Clock in
  ipcMain.handle('clock-in', (event, employeeId, options) => {
    const data = loadData();
    // Check last record GLOBALLY (not just today) for overnight shifts
    const empRecords = data.records
      .filter(r => r.employeeId === employeeId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const lastRecord = empRecords[empRecords.length - 1];
    if (lastRecord && lastRecord.type === 'in') {
      // Check if there is an active pending request for this employee
      const hasPendingRequest = (data.requests || []).some(
        r => r.employeeId === employeeId && r.status === 'pending'
      );
      if (!hasPendingRequest) {
        const elapsedMs = Date.now() - new Date(lastRecord.timestamp).getTime();
        if (elapsedMs >= 8 * 60 * 60 * 1000) {
          return {
            error: 'forgotten_exit',
            message: 'Debes indicar la hora de salida de tu turno anterior.',
            lastEntry: lastRecord
          };
        }
        return { error: 'Ya tienes una entrada registrada. Registra la salida primero.' };
      }
    }

    // Check for late entry (if shifts configured and not skipping)
    if (!(options && options.skipShiftCheck) && data.shifts && data.shifts.length > 0) {
      const currentShift = findCurrentShift(data.shifts);
      if (currentShift) {
        const threshold = data.lateEntryThresholdMinutes || 15;
        const checkNow = new Date();
        const nowMins = checkNow.getHours() * 60 + checkNow.getMinutes();
        const [sh, sm] = currentShift.startTime.split(':').map(Number);
        const shiftMins = sh * 60 + sm;
        let diff = nowMins - shiftMins;
        if (diff < 0) diff += 24 * 60;
        if (diff > threshold && diff <= 7 * 60) {
          const hasPendingEntryReq = (data.requests || []).some(
            r => r.employeeId === employeeId && r.type === 'late_entry' && r.status === 'pending'
          );
          if (!hasPendingEntryReq) {
            const nextShift = findNextShift(data.shifts, currentShift);
            let isWithinNextShiftWindow = false;
            if (nextShift) {
              const [nsh, nsm] = nextShift.startTime.split(':').map(Number);
              const nextShiftMins = nsh * 60 + nsm;
              let minsToNext = nextShiftMins - nowMins;
              if (minsToNext < 0) minsToNext += 24 * 60;
              // If within 30 minutes before next shift, employee is arriving for the next shift
              if (minsToNext <= 30) {
                isWithinNextShiftWindow = true;
              }
            }

            if (!isWithinNextShiftWindow) {
              return {
                lateEntry: true,
                message: `Tu turno "${currentShift.name}" comenzaba a las ${currentShift.startTime}.`,
                currentShift,
                nextShift,
                lateMinutes: diff
              };
            }
          }
        }
      }
    }

    const now = new Date();
    const exactMinutes = now.getMinutes() + (now.getSeconds() / 60);
    const roundedMinutes = Math.ceil(exactMinutes / 5) * 5;
    now.setMinutes(roundedMinutes, 0, 0);

    const record = {
      employeeId,
      type: 'in',
      timestamp: now.toISOString()
    };
    data.records.push(record);
    saveData(data);
    return record;
  });

  // Clock out
  ipcMain.handle('clock-out', (event, employeeId) => {
    const data = loadData();
    // Check last record GLOBALLY (not just today) for overnight shifts
    const empRecords = data.records
      .filter(r => r.employeeId === employeeId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const lastRecord = empRecords[empRecords.length - 1];
    if (!lastRecord || lastRecord.type === 'out') {
      return { error: 'No tienes una entrada registrada. Registra la entrada primero.' };
    }

    // Check if more than 8 hours have passed: if so, trigger forgotten exit prompt
    const exactCurrentTime = new Date();
    const entryTime = new Date(lastRecord.timestamp);
    const elapsedMs = exactCurrentTime.getTime() - entryTime.getTime();

    if (elapsedMs >= 8 * 60 * 60 * 1000) {
      return {
        forgottenExit: true,
        message: 'Han pasado más de 8 horas desde tu entrada. Por favor, indica a qué hora finalizó tu turno.',
        lastEntry: lastRecord
      };
    }

    // Require at least 10 minutes (600,000 ms) between the recorded entry and current time
    if (elapsedMs < 600000) {
      return { 
        confirmCancel: true, 
        message: 'Han pasado menos de 10 minutos desde tu entrada. ¿Quieres anular el fichaje de entrada?'
      };
    }

    const now = new Date();
    const exactMinutes = now.getMinutes() + (now.getSeconds() / 60);
    const roundedMinutes = Math.floor(exactMinutes / 5) * 5;
    now.setMinutes(roundedMinutes, 0, 0);

    const record = {
      employeeId,
      type: 'out',
      timestamp: now.toISOString()
    };
    data.records.push(record);
    saveData(data);
    return record;
  });

  // Cancel last entry
  ipcMain.handle('cancel-last-entry', (event, employeeId) => {
    const data = loadData();
    // Find the index of the last record for this employee
    let lastRecordIndex = -1;
    for (let i = data.records.length - 1; i >= 0; i--) {
      if (data.records[i].employeeId === employeeId) {
        lastRecordIndex = i;
        break;
      }
    }
    
    if (lastRecordIndex !== -1 && data.records[lastRecordIndex].type === 'in') {
      data.records.splice(lastRecordIndex, 1);
      saveData(data);
      return { success: true };
    }
    return { error: 'No se pudo anular la entrada.' };
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

    // Check last record GLOBALLY to handle overnight shifts
    const allEmpRecords = data.records
      .filter(r => r.employeeId === employeeId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const lastRecord = allEmpRecords[allEmpRecords.length - 1];
    let status = (lastRecord && lastRecord.type === 'in') ? 'in' : 'out';

    // Check if there is an active pending request for this employee
    const pendingRequest = (data.requests || []).find(
      r => r.employeeId === employeeId && r.status === 'pending'
    );

    let isForgotten = false;
    let lastEntry = null;

    if (status === 'in') {
      if (pendingRequest) {
        // Since there is a pending request resolving the previous entry,
        // the employee is unlocked and free to clock IN for a new shift!
        status = 'out';
      } else {
        const elapsedMs = Date.now() - new Date(lastRecord.timestamp).getTime();
        if (elapsedMs >= 8 * 60 * 60 * 1000) {
          isForgotten = true;
          status = 'forgotten_exit';
          lastEntry = lastRecord;
        }
      }
    }

    // For display: show today's records + pending entry from yesterday if still open
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    let displayRecords = allEmpRecords.filter(r => r.timestamp.startsWith(todayStr));

    // If status is 'in' or forgotten and the entry was yesterday, include it in display
    if ((status === 'in' || isForgotten) && lastRecord && !lastRecord.timestamp.startsWith(todayStr)) {
      displayRecords = [lastRecord, ...displayRecords];
    }

    return { 
      status, 
      isForgotten, 
      lastEntry, 
      hasPendingRequest: !!pendingRequest,
      pendingRequest,
      records: displayRecords 
    };
  });

  // Get all employees status
  ipcMain.handle('get-all-status', () => {
    const data = loadData();

    const statuses = {};
    data.employees.forEach(emp => {
      const empRecords = data.records
        .filter(r => r.employeeId === emp.id)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      const lastRecord = empRecords[empRecords.length - 1];
      let status = (lastRecord && lastRecord.type === 'in') ? 'in' : 'out';

      if (status === 'in') {
        const hasPendingRequest = (data.requests || []).some(
          r => r.employeeId === emp.id && r.status === 'pending'
        );
        if (hasPendingRequest) {
          status = 'out';
        } else {
          const elapsedMs = Date.now() - new Date(lastRecord.timestamp).getTime();
          if (elapsedMs >= 8 * 60 * 60 * 1000) {
            status = 'forgotten_exit';
          }
        }
      }

      statuses[emp.id] = status;
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

  // === Requests (Peticiones de Olvido de Salida) ===

  // Submit an exit request from the employee
  ipcMain.handle('submit-exit-request', (event, { employeeId, entryTimestamp, requestedExitTimestamp, shiftDay, notes }) => {
    const data = loadData();
    data.requests = data.requests || [];

    const employee = data.employees.find(e => e.id === employeeId);
    if (!employee) return { error: 'Empleado no encontrado' };

    // Apply exit rounding: floor to 5 minutes
    const exitDate = new Date(requestedExitTimestamp);
    const exactMinutes = exitDate.getMinutes() + (exitDate.getSeconds() / 60);
    const roundedMinutes = Math.floor(exactMinutes / 5) * 5;
    exitDate.setMinutes(roundedMinutes, 0, 0);

    const newRequest = {
      id: 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6),
      employeeId,
      employeeName: `${employee.name} ${employee.lastName}`,
      entryTimestamp,
      requestedExitTimestamp: exitDate.toISOString(),
      shiftDay: shiftDay || 'same_day',
      notes: notes || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    data.requests.push(newRequest);
    saveData(data);
    return { success: true, request: newRequest };
  });

  // Get all requests
  ipcMain.handle('get-requests', () => {
    const data = loadData();
    data.requests = data.requests || [];
    const sorted = [...data.requests].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return sorted;
  });

  // Get count of pending requests
  ipcMain.handle('get-pending-requests-count', () => {
    const data = loadData();
    data.requests = data.requests || [];
    return data.requests.filter(r => r.status === 'pending').length;
  });

  // Approve request (handles both exit and late_entry requests)
  ipcMain.handle('approve-request', (event, { requestId, customExitTimestamp, customEntryTimestamp }) => {
    const data = loadData();
    data.requests = data.requests || [];
    const req = data.requests.find(r => r.id === requestId);
    if (!req) return { error: 'Petición no encontrada' };

    if (req.type === 'late_entry') {
      const targetTime = customEntryTimestamp ? new Date(customEntryTimestamp) : new Date(req.requestedEntryTimestamp);
      const exactMinutes = targetTime.getMinutes() + (targetTime.getSeconds() / 60);
      const roundedMinutes = Math.ceil(exactMinutes / 5) * 5;
      targetTime.setMinutes(roundedMinutes, 0, 0);
      const recordIdx = data.records.findIndex(r => r.requestId === req.id);
      if (recordIdx !== -1) {
        data.records[recordIdx].timestamp = targetTime.toISOString();
        data.records[recordIdx].origin = 'entry_request_approved';
        delete data.records[recordIdx].actualTimestamp;
      }
      data.records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      req.status = 'approved';
      req.approvedAt = new Date().toISOString();
      req.finalEntryTimestamp = targetTime.toISOString();
      saveData(data);
      return { success: true };
    }

    // Exit request (original logic)
    const targetExitTime = customExitTimestamp ? new Date(customExitTimestamp) : new Date(req.requestedExitTimestamp);
    const exactMinutes = targetExitTime.getMinutes() + (targetExitTime.getSeconds() / 60);
    const roundedMinutes = Math.floor(exactMinutes / 5) * 5;
    targetExitTime.setMinutes(roundedMinutes, 0, 0);
    const record = {
      employeeId: req.employeeId,
      type: 'out',
      timestamp: targetExitTime.toISOString(),
      origin: 'request_approved',
      requestId: req.id
    };
    data.records.push(record);
    data.records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    req.status = 'approved';
    req.approvedAt = new Date().toISOString();
    req.finalExitTimestamp = targetExitTime.toISOString();
    saveData(data);
    return { success: true, record };
  });

  // Reject request (handles both exit and late_entry requests)
  ipcMain.handle('reject-request', (event, { requestId, reason }) => {
    const data = loadData();
    data.requests = data.requests || [];
    const req = data.requests.find(r => r.id === requestId);
    if (!req) return { error: 'Petición no encontrada' };

    if (req.type === 'late_entry') {
      const recordIdx = data.records.findIndex(r => r.requestId === req.id);
      if (recordIdx !== -1) {
        const actualTime = data.records[recordIdx].actualTimestamp || req.actualClockInTimestamp;
        if (actualTime) data.records[recordIdx].timestamp = actualTime;
        data.records[recordIdx].origin = 'entry_request_rejected';
        delete data.records[recordIdx].actualTimestamp;
      }
      data.records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    req.status = 'rejected';
    req.rejectedAt = new Date().toISOString();
    req.rejectReason = reason || '';
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
  // Supports overnight shifts (entry on day X, exit on day X+1)
  function generateMonthRows(data, employeeIds, month, year, emptyChar) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const timeFmt = { hour: '2-digit', minute: '2-digit' };

    // Get records with a buffer: include last day of prev month and first day of next month
    // to correctly pair overnight shifts at month boundaries
    const bufferStart = new Date(year, month - 1, 28); // few days before month
    const bufferEnd = new Date(year, month + 1, 2);    // few days after month

    const allRecords = data.records
      .filter(r => {
        if (!employeeIds.includes(r.employeeId)) return false;
        const d = new Date(r.timestamp);
        return d >= bufferStart && d <= bufferEnd;
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Pair each "in" with the next "out" sequentially
    const pairs = [];
    for (let i = 0; i < allRecords.length; i++) {
      if (allRecords[i].type === 'in') {
        const entry = allRecords[i];
        let exit = null;
        if (i + 1 < allRecords.length && allRecords[i + 1].type === 'out') {
          exit = allRecords[i + 1];
          i++; // skip the exit
        }
        pairs.push({ entry, exit });
      }
    }

    // Group pairs by the entry's day (assigned to the day the shift started)
    const dayPairs = {};
    for (let day = 1; day <= daysInMonth; day++) {
      dayPairs[day] = [];
    }

    pairs.forEach(pair => {
      const entryDate = new Date(pair.entry.timestamp);
      if (entryDate.getMonth() === month && entryDate.getFullYear() === year) {
        dayPairs[entryDate.getDate()].push(pair);
      }
    });

    const rows = [];
    let totalMinutes = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const pairsForDay = dayPairs[day];

      // Format entry/exit times. Add (+1) if exit is the next day
      function fmtEntry(pair) {
        return pair ? new Date(pair.entry.timestamp).toLocaleTimeString('es-ES', timeFmt) : emptyChar;
      }
      function fmtExit(pair) {
        if (!pair || !pair.exit) return emptyChar;
        const entryDay = new Date(pair.entry.timestamp).getDate();
        const exitDay = new Date(pair.exit.timestamp).getDate();
        const exitTime = new Date(pair.exit.timestamp).toLocaleTimeString('es-ES', timeFmt);
        return exitDay !== entryDay ? `${exitTime} (+1)` : exitTime;
      }

      const entry1 = fmtEntry(pairsForDay[0]);
      const exit1 = fmtExit(pairsForDay[0]);
      const entry2 = fmtEntry(pairsForDay[1]);
      const exit2 = fmtExit(pairsForDay[1]);

      // Calculate hours (works across midnight automatically with timestamps)
      let dayMinutes = 0;
      pairsForDay.forEach(pair => {
        if (pair.exit) {
          const inTime = new Date(pair.entry.timestamp);
          const outTime = new Date(pair.exit.timestamp);
          if (outTime > inTime) {
            dayMinutes += (outTime - inTime) / 60000;
          }
        }
      });
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

  // === Shifts Configuration ===

  ipcMain.handle('get-shifts', () => {
    const data = loadData();
    return { shifts: data.shifts || [], lateEntryThresholdMinutes: data.lateEntryThresholdMinutes || 15 };
  });

  ipcMain.handle('save-shifts', (event, { shifts, lateEntryThresholdMinutes }) => {
    const data = loadData();
    data.shifts = shifts || [];
    if (lateEntryThresholdMinutes !== undefined) data.lateEntryThresholdMinutes = lateEntryThresholdMinutes;
    saveData(data);
    return { success: true };
  });

  // Submit late entry request
  ipcMain.handle('submit-entry-request', (event, { employeeId, requestedEntryTimestamp, shiftName, shiftStartTime }) => {
    const data = loadData();
    data.requests = data.requests || [];
    const employee = data.employees.find(e => e.id === employeeId);
    if (!employee) return { error: 'Empleado no encontrado' };

    const now = new Date();
    const entryDate = new Date(requestedEntryTimestamp);
    const eMin = entryDate.getMinutes() + (entryDate.getSeconds() / 60);
    const rMin = Math.ceil(eMin / 5) * 5;
    entryDate.setMinutes(rMin, 0, 0);

    const requestId = 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6);

    const record = {
      employeeId,
      type: 'in',
      timestamp: entryDate.toISOString(),
      origin: 'entry_request',
      requestId: requestId,
      actualTimestamp: now.toISOString()
    };
    data.records.push(record);
    data.records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const newRequest = {
      id: requestId,
      type: 'late_entry',
      employeeId,
      employeeName: `${employee.name} ${employee.lastName}`,
      shiftName: shiftName || '',
      shiftStartTime: shiftStartTime || '',
      actualClockInTimestamp: now.toISOString(),
      requestedEntryTimestamp: entryDate.toISOString(),
      status: 'pending',
      createdAt: now.toISOString()
    };
    data.requests.push(newRequest);
    saveData(data);
    return { success: true, request: newRequest, record };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
