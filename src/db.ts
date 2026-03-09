
// Local Database Service using LocalStorage

const STORAGE_KEYS = {
  COMPANIES: 'ponto_companies',
  EMPLOYEES: 'ponto_employees',
  RECORDS: 'ponto_records',
  SETTINGS: 'ponto_settings',
  CURRENT_USER: 'ponto_current_user'
};

// Initial Data
const INITIAL_SETTINGS = {
  login_logo: 'https://picsum.photos/seed/psicodonto/200/200'
};

const INITIAL_ADMIN = {
  id: 1,
  name: 'Administrador',
  role: 'Admin',
  cpf: '000.000.000-00',
  email: 'admin@psicodonto.com',
  is_admin: 1,
  password: 'admin',
  company_id: 0
};

const getStorage = (key: string, defaultValue: any = []) => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : defaultValue;
};

const setStorage = (key: string, value: any) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const db = {
  // Settings
  getSettings: () => getStorage(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS),
  updateSetting: (key: string, value: string) => {
    const settings = db.getSettings();
    settings[key] = value;
    setStorage(STORAGE_KEYS.SETTINGS, settings);
    return settings;
  },

  // Companies
  getCompanies: () => getStorage(STORAGE_KEYS.COMPANIES),
  saveCompany: (company: any) => {
    const companies = db.getCompanies();
    if (company.id) {
      const index = companies.findIndex((c: any) => c.id === company.id);
      if (index !== -1) companies[index] = { ...companies[index], ...company };
    } else {
      company.id = Date.now();
      companies.push(company);
    }
    setStorage(STORAGE_KEYS.COMPANIES, companies);
    return company;
  },
  deleteCompany: (id: number) => {
    const companies = db.getCompanies().filter((c: any) => c.id !== id);
    setStorage(STORAGE_KEYS.COMPANIES, companies);
  },

  // Employees
  getEmployees: () => {
    const employees = getStorage(STORAGE_KEYS.EMPLOYEES);
    if (employees.length === 0) {
      // Add default admin if no employees exist
      setStorage(STORAGE_KEYS.EMPLOYEES, [INITIAL_ADMIN]);
      return [INITIAL_ADMIN];
    }
    return employees;
  },
  saveEmployee: (employee: any) => {
    const employees = db.getEmployees();
    if (employee.id) {
      const index = employees.findIndex((e: any) => e.id === employee.id);
      if (index !== -1) employees[index] = { ...employees[index], ...employee };
    } else {
      employee.id = Date.now();
      // Set default password as the CPF (only numbers) if not provided
      if (!employee.password) {
        employee.password = employee.cpf.replace(/\D/g, '');
      }
      employees.push(employee);
    }
    setStorage(STORAGE_KEYS.EMPLOYEES, employees);
    return employee;
  },
  deleteEmployee: (id: number) => {
    const employees = db.getEmployees().filter((e: any) => e.id !== id);
    setStorage(STORAGE_KEYS.EMPLOYEES, employees);
  },

  // Auth
  login: (cpf: string, password?: string) => {
    const employees = db.getEmployees();
    const user = employees.find((e: any) => e.cpf === cpf);
    if (user) {
      // Check password for everyone
      if (user.password && user.password !== password) {
        throw new Error('Senha incorreta');
      }
      // If user has no password set yet (legacy), allow login but we should probably set one
      return user;
    }
    throw new Error('Usuário não encontrado');
  },

  // Time Records
  getRecords: (employeeId?: number) => {
    const records = getStorage(STORAGE_KEYS.RECORDS);
    if (employeeId) {
      return records.filter((r: any) => r.employee_id === employeeId);
    }
    return records;
  },
  getClockStatus: (employeeId: number) => {
    const records = db.getRecords(employeeId);
    const openRecord = records.find((r: any) => r.exit_time === null);
    return {
      hasOpenRecord: !!openRecord,
      record: openRecord || null
    };
  },
  clockIn: (employeeId: number) => {
    const status = db.getClockStatus(employeeId);
    if (status.hasOpenRecord) throw new Error('Já existe um ponto aberto');
    
    const records = db.getRecords();
    const newRecord = {
      id: Date.now(),
      employee_id: employeeId,
      entry_time: new Date().toISOString(),
      exit_time: null
    };
    records.push(newRecord);
    setStorage(STORAGE_KEYS.RECORDS, records);
    return newRecord;
  },
  clockOut: (employeeId: number) => {
    const status = db.getClockStatus(employeeId);
    if (!status.hasOpenRecord || !status.record) throw new Error('Não há ponto aberto');
    
    const records = db.getRecords();
    const index = records.findIndex((r: any) => r.id === status.record.id);
    if (index !== -1) {
      records[index].exit_time = new Date().toISOString();
      setStorage(STORAGE_KEYS.RECORDS, records);
    }
    return records[index];
  },
  saveRecord: (record: any) => {
    const records = db.getRecords();
    if (record.id) {
      const index = records.findIndex((r: any) => r.id === record.id);
      if (index !== -1) records[index] = { ...records[index], ...record };
    } else {
      record.id = Date.now();
      records.push(record);
    }
    setStorage(STORAGE_KEYS.RECORDS, records);
    return record;
  },
  deleteRecord: (id: number) => {
    const records = db.getRecords().filter((r: any) => r.id !== id);
    setStorage(STORAGE_KEYS.RECORDS, records);
  },

  // Reports
  getReportData: (filters: any) => {
    let records = db.getRecords();
    const employees = db.getEmployees();
    const companies = db.getCompanies();

    // Join data
    records = records.map((r: any) => {
      const emp = employees.find((e: any) => e.id === r.employee_id);
      const comp = companies.find((c: any) => c.id === emp?.company_id);
      return {
        ...r,
        employee_name: emp?.name,
        role: emp?.role,
        company_name: comp?.name,
        company_cnpj: comp?.cnpj,
        company_id: emp?.company_id
      };
    });

    if (filters.companyId) {
      records = records.filter((r: any) => r.company_id === parseInt(filters.companyId));
    }
    if (filters.employeeId) {
      records = records.filter((r: any) => r.employee_id === parseInt(filters.employeeId));
    }
    if (filters.startDate) {
      const start = new Date(filters.startDate + 'T00:00:00');
      records = records.filter((r: any) => new Date(r.entry_time) >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate + 'T23:59:59');
      records = records.filter((r: any) => new Date(r.entry_time) <= end);
    }

    return records;
  }
};
