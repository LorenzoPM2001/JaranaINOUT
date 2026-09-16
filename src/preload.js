const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Employees
  getEmployees: () => ipcRenderer.invoke('get-employees'),
  getArchivedEmployees: () => ipcRenderer.invoke('get-archived-employees'),
  addEmployee: (employee) => ipcRenderer.invoke('add-employee', employee),
  editEmployee: (id, updates) => ipcRenderer.invoke('edit-employee', { id, updates }),
  deleteEmployee: (id) => ipcRenderer.invoke('delete-employee', id),
  restoreEmployee: (id) => ipcRenderer.invoke('restore-employee', id),
  permanentlyDeleteEmployee: (id) => ipcRenderer.invoke('permanently-delete-employee', id),

  // Clock in/out
  clockIn: (employeeId) => ipcRenderer.invoke('clock-in', employeeId),
  clockOut: (employeeId) => ipcRenderer.invoke('clock-out', employeeId),
  cancelLastEntry: (employeeId) => ipcRenderer.invoke('cancel-last-entry', employeeId),

  // Records & Status
  getRecords: (employeeId, month, year) => ipcRenderer.invoke('get-records', { employeeId, month, year }),
  getEmployeeStatus: (employeeId) => ipcRenderer.invoke('get-employee-status', employeeId),
  getAllStatus: () => ipcRenderer.invoke('get-all-status'),

  // Admin
  adminLogin: (username, password) => ipcRenderer.invoke('admin-login', { username, password }),
  changeAdminCredentials: (username, password) => ipcRenderer.invoke('change-admin-credentials', { username, password }),

  // Excel
  exportExcel: (employeeId, month, year) => ipcRenderer.invoke('export-excel', { employeeId, month, year }),
  exportExcelAll: (month, year) => ipcRenderer.invoke('export-excel-all', { month, year }),

  // Requests (Peticiones)
  submitExitRequest: (data) => ipcRenderer.invoke('submit-exit-request', data),
  getRequests: () => ipcRenderer.invoke('get-requests'),
  getPendingRequestsCount: () => ipcRenderer.invoke('get-pending-requests-count'),
  approveRequest: (data) => ipcRenderer.invoke('approve-request', data),
  rejectRequest: (data) => ipcRenderer.invoke('reject-request', data)
});
