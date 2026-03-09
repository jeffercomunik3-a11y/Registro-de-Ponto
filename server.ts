import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("ponto.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cnpj TEXT NOT NULL,
    logo_url TEXT
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    cpf TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    password TEXT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies (id)
  );

  CREATE TABLE IF NOT EXISTS time_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    entry_time TEXT,
    exit_time TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees (id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migration: Add logo_url to companies if it doesn't exist
const tableInfo = db.prepare("PRAGMA table_info(companies)").all() as any[];
const hasLogoUrl = tableInfo.some(col => col.name === 'logo_url');
if (!hasLogoUrl) {
  db.exec("ALTER TABLE companies ADD COLUMN logo_url TEXT");
}

// Seed initial data if empty
const companyCount = db.prepare("SELECT COUNT(*) as count FROM companies").get() as any;
if (companyCount.count === 0) {
  const companyInfo = db.prepare("INSERT INTO companies (name, cnpj) VALUES (?, ?)").run("Empresa Padrão", "00.000.000/0001-00");
  const companyId = companyInfo.lastInsertRowid;
  
  const adminCpf = "000.000.000-00";
  const adminPassword = "ponto000";
  db.prepare(`
    INSERT INTO employees (company_id, name, role, cpf, email, is_admin, password) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(companyId, "Administrador", "Diretor", adminCpf, "admin@ponto.pro", 1, adminPassword);
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  
  // Companies
  app.get("/api/companies", (req, res) => {
    const companies = db.prepare("SELECT * FROM companies").all();
    res.json(companies);
  });

  app.post("/api/companies", (req, res) => {
    const { name, cnpj, logo_url } = req.body;
    
    // Check for duplicate CNPJ
    const existing = db.prepare("SELECT id FROM companies WHERE cnpj = ?").get(cnpj);
    if (existing) {
      return res.status(400).json({ error: "Já existe uma empresa cadastrada com este CNPJ." });
    }

    const info = db.prepare("INSERT INTO companies (name, cnpj, logo_url) VALUES (?, ?, ?)").run(name, cnpj, logo_url || null);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/companies/:id", (req, res) => {
    const { id } = req.params;
    const { name, cnpj, logo_url } = req.body;

    // Check for duplicate CNPJ (excluding current company)
    const existing = db.prepare("SELECT id FROM companies WHERE cnpj = ? AND id != ?").get(cnpj, id);
    if (existing) {
      return res.status(400).json({ error: "Já existe outra empresa cadastrada com este CNPJ." });
    }

    db.prepare("UPDATE companies SET name = ?, cnpj = ?, logo_url = ? WHERE id = ?").run(name, cnpj, logo_url, id);
    res.json({ success: true });
  });

  app.delete("/api/companies/:id", (req, res) => {
    const { id } = req.params;
    console.log(`Attempting to delete company with ID: ${id}`);
    try {
      // Check if there are employees
      const employees = db.prepare("SELECT COUNT(*) as count FROM employees WHERE company_id = ?").get(id) as any;
      if (employees.count > 0) {
        console.log(`Cannot delete company ${id}: has employees`);
        return res.status(400).json({ error: "Não é possível excluir uma empresa que possui funcionários vinculados." });
      }
      const info = db.prepare("DELETE FROM companies WHERE id = ?").run(id);
      console.log(`Delete company ${id} result:`, info);
      if (info.changes === 0) {
        return res.status(404).json({ error: "Empresa não encontrada." });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error(`Error deleting company ${id}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // Employees
  app.get("/api/employees", (req, res) => {
    const employees = db.prepare(`
      SELECT e.*, c.name as company_name 
      FROM employees e 
      JOIN companies c ON e.company_id = c.id
    `).all();
    res.json(employees);
  });

  app.post("/api/employees", (req, res) => {
    const { company_id, name, role, cpf, email, is_admin } = req.body;
    
    // Check for duplicate CPF
    const existing = db.prepare("SELECT id FROM employees WHERE cpf = ?").get(cpf);
    if (existing) {
      return res.status(400).json({ error: "Já existe um funcionário cadastrado com este CPF." });
    }

    // Password logic: "ponto" + first 3 digits of CPF
    const cpfDigits = cpf.replace(/\D/g, "");
    const password = `ponto${cpfDigits.substring(0, 3)}`;
    
    try {
      const info = db.prepare(`
        INSERT INTO employees (company_id, name, role, cpf, email, is_admin, password) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(company_id, name, role, cpf, email, is_admin ? 1 : 0, password);
      res.json({ id: info.lastInsertRowid });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/employees/:id", (req, res) => {
    const { id } = req.params;
    const { company_id, name, role, cpf, email, is_admin } = req.body;

    // Check for duplicate CPF (excluding current employee)
    const existing = db.prepare("SELECT id FROM employees WHERE cpf = ? AND id != ?").get(cpf, id);
    if (existing) {
      return res.status(400).json({ error: "Já existe outro funcionário cadastrado com este CPF." });
    }

    try {
      db.prepare(`
        UPDATE employees 
        SET company_id = ?, name = ?, role = ?, cpf = ?, email = ?, is_admin = ?
        WHERE id = ?
      `).run(company_id, name, role, cpf, email, is_admin ? 1 : 0, id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/employees/:id", (req, res) => {
    const { id } = req.params;
    console.log(`Attempting to delete employee with ID: ${id}`);
    try {
      // Delete time records first
      const recordsInfo = db.prepare("DELETE FROM time_records WHERE employee_id = ?").run(id);
      console.log(`Deleted ${recordsInfo.changes} records for employee ${id}`);
      const info = db.prepare("DELETE FROM employees WHERE id = ?").run(id);
      console.log(`Delete employee ${id} result:`, info);
      if (info.changes === 0) {
        return res.status(404).json({ error: "Funcionário não encontrado." });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error(`Error deleting employee ${id}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // Login
  app.post("/api/login", (req, res) => {
    const { cpf, password } = req.body;
    const employee = db.prepare("SELECT * FROM employees WHERE cpf = ? AND password = ?").get(cpf, password) as any;
    
    if (employee) {
      const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(employee.company_id) as any;
      res.json({ 
        ...employee, 
        company_name: company?.name,
        company_logo: company?.logo_url 
      });
    } else {
      res.status(401).json({ error: "CPF ou senha incorretos" });
    }
  });

  // Time Records
  app.get("/api/time-records/:employeeId", (req, res) => {
    const { employeeId } = req.params;
    const records = db.prepare(`
      SELECT tr.*, e.name as employee_name, e.role, c.name as company_name
      FROM time_records tr
      JOIN employees e ON tr.employee_id = e.id
      JOIN companies c ON e.company_id = c.id
      WHERE tr.employee_id = ?
      ORDER BY tr.id DESC
    `).all(employeeId);
    res.json(records);
  });

  app.get("/api/time-records/:employeeId/status", (req, res) => {
    const { employeeId } = req.params;
    // Check if there is an open record (entry_time set, exit_time null)
    const openRecord = db.prepare("SELECT * FROM time_records WHERE employee_id = ? AND exit_time IS NULL").get(employeeId);
    res.json({ hasOpenRecord: !!openRecord, record: openRecord });
  });

  app.post("/api/time-records/clock-in", (req, res) => {
    const { employeeId } = req.body;
    const now = new Date().toISOString();
    
    // Ensure no open record exists
    const openRecord = db.prepare("SELECT * FROM time_records WHERE employee_id = ? AND exit_time IS NULL").get(employeeId);
    if (openRecord) {
      return res.status(400).json({ error: "Já existe um registro de entrada aberto." });
    }

    const info = db.prepare("INSERT INTO time_records (employee_id, entry_time) VALUES (?, ?)").run(employeeId, now);
    res.json({ id: info.lastInsertRowid, entry_time: now });
  });

  app.post("/api/time-records/clock-out", (req, res) => {
    const { employeeId } = req.body;
    const now = new Date().toISOString();
    
    const openRecord = db.prepare("SELECT * FROM time_records WHERE employee_id = ? AND exit_time IS NULL").get(employeeId) as any;
    if (!openRecord) {
      return res.status(400).json({ error: "Não há registro de entrada aberto para fechar." });
    }

    db.prepare("UPDATE time_records SET exit_time = ? WHERE id = ?").run(now, openRecord.id);
    res.json({ id: openRecord.id, exit_time: now });
  });

  app.put("/api/time-records/:id", (req, res) => {
    const { id } = req.params;
    const { entry_time, exit_time } = req.body;
    db.prepare("UPDATE time_records SET entry_time = ?, exit_time = ? WHERE id = ?").run(entry_time, exit_time, id);
    res.json({ success: true });
  });

  app.delete("/api/time-records/:id", (req, res) => {
    const { id } = req.params;
    console.log(`Attempting to delete time record with ID: ${id}`);
    try {
      const info = db.prepare("DELETE FROM time_records WHERE id = ?").run(id);
      console.log(`Delete time record ${id} result:`, info);
      if (info.changes === 0) {
        return res.status(404).json({ error: "Registro não encontrado." });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error(`Error deleting time record ${id}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reports API
  app.get("/api/reports", (req, res) => {
    const { companyId, employeeId, startDate, endDate } = req.query;
    let query = `
      SELECT tr.*, e.name as employee_name, e.role, e.cpf, e.email, c.name as company_name, c.cnpj as company_cnpj
      FROM time_records tr
      JOIN employees e ON tr.employee_id = e.id
      JOIN companies c ON e.company_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (companyId) {
      query += " AND c.id = ?";
      params.push(companyId);
    }
    if (employeeId) {
      query += " AND e.id = ?";
      params.push(employeeId);
    }
    if (startDate) {
      query += " AND tr.entry_time >= ?";
      params.push(startDate);
    }
    if (endDate) {
      query += " AND tr.entry_time <= ?";
      params.push(endDate);
    }

    query += " ORDER BY tr.entry_time ASC";
    
    const records = db.prepare(query).all(...params);
    res.json(records);
  });

  // Settings
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all() as any[];
    const settingsObj = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsObj);
  });

  app.post("/api/settings", (req, res) => {
    const { key, value } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
