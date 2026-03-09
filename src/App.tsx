import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Users, 
  Clock, 
  LogOut, 
  Plus, 
  Shield, 
  User as UserIcon,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Download,
  Filter,
  FileSpreadsheet,
  Edit,
  Trash2,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { db } from './db';

// Types
interface Company {
  id: number;
  name: string;
  cnpj: string;
  logo_url?: string;
}

interface Employee {
  id: number;
  company_id: number;
  company_name?: string;
  company_logo?: string;
  name: string;
  role: string;
  cpf: string;
  email: string;
  is_admin: number;
  password?: string;
}

interface TimeRecord {
  id: number;
  employee_id: number;
  entry_time: string;
  exit_time: string | null;
  employee_name?: string;
  role?: string;
  company_name?: string;
}

// Utils
const maskCPF = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

const maskCNPJ = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

const formatDateTime = (isoString: string | null) => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function App() {
  const [user, setUser] = useState<Employee | null>(null);
  const [view, setView] = useState<'login' | 'dashboard' | 'companies' | 'employees' | 'records' | 'reports' | 'settings'>('login');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [settings, setSettings] = useState<any>({});

  // Form States
  const [loginCpf, setLoginCpf] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [clockStatus, setClockStatus] = useState<{ hasOpenRecord: boolean, record: TimeRecord | null }>({ hasOpenRecord: false, record: null });

  // Report States
  const [reportRecords, setReportRecords] = useState<any[]>([]);
  const [reportFilters, setReportFilters] = useState({
    companyId: '',
    employeeId: '',
    startDate: '',
    endDate: ''
  });

  // Modal States
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TimeRecord | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number, type: 'company' | 'employee' | 'record', name?: string } | null>(null);

  // New Company Form
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCnpj, setNewCompanyCnpj] = useState('');
  const [newCompanyLogo, setNewCompanyLogo] = useState('');

  // New Employee Form
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpRole, setNewEmpRole] = useState('');
  const [newEmpCpf, setNewEmpCpf] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpCompanyId, setNewEmpCompanyId] = useState('');
  const [newEmpIsAdmin, setNewEmpIsAdmin] = useState(false);

  // Edit Record Form
  const [editEntryTime, setEditEntryTime] = useState('');
  const [editExitTime, setEditExitTime] = useState('');

  const [loginLogoUrl, setLoginLogoUrl] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (user) {
      if (user.is_admin) {
        fetchCompanies();
        fetchEmployees();
      }
      fetchClockStatus();
      fetchRecords();
    }
  }, [user]);

  useEffect(() => {
    if (view === 'reports' && user?.is_admin && reportRecords.length === 0 && !loading) {
      fetchReportData();
    }
  }, [view, user]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const fetchCompanies = async () => {
    const data = db.getCompanies();
    setCompanies(data);
  };

  const fetchEmployees = async () => {
    const data = db.getEmployees();
    setEmployees(data);
  };

  const fetchSettings = async () => {
    const data = db.getSettings();
    setSettings(data);
    if (data.login_logo) setLoginLogoUrl(data.login_logo);
  };

  const updateSetting = async (key: string, value: string) => {
    setLoading(true);
    try {
      const data = db.updateSetting(key, value);
      setSettings(data);
      setMessage({ type: 'success', text: 'Configuração atualizada!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao atualizar configuração' });
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async () => {
    if (!user) return;
    const data = db.getRecords(user.id);
    setRecords(data);
  };

  const fetchClockStatus = async () => {
    if (!user) return;
    const data = db.getClockStatus(user.id);
    setClockStatus(data);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const data = db.login(loginCpf, loginPassword);
      setUser(data);
      setView('dashboard');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async () => {
    if (!user) return;
    setLoading(true);
    try {
      db.clockIn(user.id);
      fetchClockStatus();
      fetchRecords();
      setMessage({ type: 'success', text: 'Entrada registrada com sucesso!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao registrar ponto' });
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!user) return;
    setLoading(true);
    try {
      db.clockOut(user.id);
      fetchClockStatus();
      fetchRecords();
      setMessage({ type: 'success', text: 'Saída registrada com sucesso!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao registrar ponto' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setView('login');
    setLoginCpf('');
    setLoginPassword('');
    setMessage(null);
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      db.saveCompany({ 
        id: editingCompany?.id,
        name: newCompanyName, 
        cnpj: maskCNPJ(newCompanyCnpj),
        logo_url: newCompanyLogo 
      });
      
      setNewCompanyName('');
      setNewCompanyCnpj('');
      setNewCompanyLogo('');
      setEditingCompany(null);
      setShowCompanyModal(false);
      fetchCompanies();
      setMessage({ type: 'success', text: editingCompany ? 'Empresa atualizada!' : 'Empresa cadastrada!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao salvar empresa' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCompany = async (id: number) => {
    setLoading(true);
    try {
      db.deleteCompany(id);
      await fetchCompanies();
      setMessage({ type: 'success', text: 'Empresa excluída!' });
      setShowDeleteConfirm(false);
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao excluir empresa' });
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteCompany = (company: Company) => {
    setDeleteTarget({ id: company.id, type: 'company', name: company.name });
    setShowDeleteConfirm(true);
  };

  const openEditCompany = (company: Company) => {
    setEditingCompany(company);
    setNewCompanyName(company.name);
    setNewCompanyCnpj(company.cnpj);
    setNewCompanyLogo(company.logo_url || '');
    setShowCompanyModal(true);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewCompanyLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      db.saveEmployee({ 
        id: editingEmployee?.id,
        name: newEmpName, 
        role: newEmpRole, 
        cpf: maskCPF(newEmpCpf), 
        email: newEmpEmail, 
        company_id: parseInt(newEmpCompanyId), 
        is_admin: newEmpIsAdmin ? 1 : 0 
      });
      
      setNewEmpName('');
      setNewEmpRole('');
      setNewEmpCpf('');
      setNewEmpEmail('');
      setNewEmpCompanyId('');
      setNewEmpIsAdmin(false);
      setEditingEmployee(null);
      setShowEmployeeModal(false);
      fetchEmployees();
      setMessage({ type: 'success', text: editingEmployee ? 'Funcionário atualizado!' : 'Funcionário cadastrado!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao salvar funcionário' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEmployee = async (id: number) => {
    setLoading(true);
    try {
      db.deleteEmployee(id);
      await fetchEmployees();
      if (view === 'reports') await fetchReportData();
      setMessage({ type: 'success', text: 'Funcionário excluído!' });
      setShowDeleteConfirm(false);
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao excluir funcionário' });
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteEmployee = (emp: Employee) => {
    setDeleteTarget({ id: emp.id, type: 'employee', name: emp.name });
    setShowDeleteConfirm(true);
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setNewEmpName(emp.name);
    setNewEmpRole(emp.role);
    setNewEmpCpf(emp.cpf);
    setNewEmpEmail(emp.email);
    setNewEmpCompanyId(emp.company_id.toString());
    setNewEmpIsAdmin(emp.is_admin === 1);
    setShowEmployeeModal(true);
  };

  const handleDeleteRecord = async (id: number) => {
    setLoading(true);
    try {
      db.deleteRecord(id);
      await fetchRecords();
      if (view === 'reports') await fetchReportData();
      setMessage({ type: 'success', text: 'Registro excluído!' });
      setShowDeleteConfirm(false);
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao excluir registro' });
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteRecord = (record: TimeRecord) => {
    setDeleteTarget({ id: record.id, type: 'record', name: `Registro de ${record.employee_name}` });
    setShowDeleteConfirm(true);
  };

  const openEditRecord = (record: TimeRecord) => {
    setEditingRecord(record);
    // Convert ISO to local datetime-local format (YYYY-MM-DDTHH:mm)
    const entry = new Date(record.entry_time);
    const entryLocal = new Date(entry.getTime() - entry.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditEntryTime(entryLocal);
    
    if (record.exit_time) {
      const exit = new Date(record.exit_time);
      const exitLocal = new Date(exit.getTime() - exit.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setEditExitTime(exitLocal);
    } else {
      setEditExitTime('');
    }
    setShowRecordModal(true);
  };

  const handleUpdateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setLoading(true);
    try {
      db.saveRecord({
        ...editingRecord,
        entry_time: new Date(editEntryTime).toISOString(),
        exit_time: editExitTime ? new Date(editExitTime).toISOString() : null
      });
      setShowRecordModal(false);
      fetchRecords();
      if (view === 'reports') fetchReportData();
      setMessage({ type: 'success', text: 'Registro atualizado!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao atualizar registro' });
    } finally {
      setLoading(false);
    }
  };

  const fetchReportData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = db.getReportData(reportFilters);
      setReportRecords(data);
      
      if (data.length === 0) {
        setMessage({ type: 'error', text: 'Nenhum registro encontrado para estes filtros.' });
      } else {
        setMessage({ type: 'success', text: `${data.length} registros encontrados.` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao carregar relatório.' });
      setReportRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setReportFilters({
      companyId: '',
      employeeId: '',
      startDate: '',
      endDate: ''
    });
    setReportRecords([]);
    setMessage(null);
  };

  const exportToExcel = () => {
    if (reportRecords.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(reportRecords.map(r => ({
      'Funcionário': r.employee_name,
      'Cargo': r.role,
      'Empresa': r.company_name,
      'Entrada': formatDateTime(r.entry_time),
      'Saída': formatDateTime(r.exit_time)
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório de Ponto");
    XLSX.writeFile(wb, "relatorio_ponto.xlsx");
  };

  const exportToPDF = () => {
    if (reportRecords.length === 0) return;
    
    const doc = new jsPDF();
    
    // Group records by employee_id
    const grouped = reportRecords.reduce((acc: any, record) => {
      const empId = record.employee_id;
      if (!acc[empId]) {
        acc[empId] = {
          employee_name: record.employee_name,
          role: record.role,
          company_name: record.company_name,
          company_cnpj: record.company_cnpj,
          records: []
        };
      }
      acc[empId].records.push(record);
      return acc;
    }, {});

    const employeeIds = Object.keys(grouped);
    
    employeeIds.forEach((empId, index) => {
      if (index > 0) doc.addPage();
      
      const empData = grouped[empId];
      const records = empData.records;
      
      // Header
      doc.setFontSize(16);
      doc.text("FOLHA INDIVIDUAL DE PONTO", 105, 15, { align: "center" });
      
      doc.setFontSize(10);
      doc.text(`Funcionário: ${empData.employee_name}`, 15, 25);
      doc.text(`Cargo: ${empData.role}`, 15, 32);
      doc.text(`CNPJ: ${empData.company_cnpj}`, 140, 25);
      doc.text(`Empresa: ${empData.company_name}`, 140, 32);
      
      let start = reportFilters.startDate ? new Date(reportFilters.startDate + 'T00:00:00').toLocaleDateString('pt-BR') : '';
      let end = reportFilters.endDate ? new Date(reportFilters.endDate + 'T00:00:00').toLocaleDateString('pt-BR') : '';
      
      if (!start && records.length > 0) {
        start = new Date(records[0].entry_time).toLocaleDateString('pt-BR');
      }
      if (!end && records.length > 0) {
        end = new Date(records[records.length - 1].entry_time).toLocaleDateString('pt-BR');
      }
      
      doc.text(`Período: ${start || '---'} A ${end || '---'}`, 15, 40);

      // Signature line below company info
      doc.line(140, 48, 195, 48);
      doc.setFontSize(7);
      doc.text("Assinatura do Funcionário", 140, 52);

      const tableData = records.map((r: any) => {
        const date = new Date(r.entry_time);
        const day = date.getDate().toString().padStart(2, '0');
        const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' }).toUpperCase();
        const entry = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const exit = r.exit_time ? new Date(r.exit_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        
        return [
          `${day} - ${weekday}`,
          entry,
          exit,
          "", // Second entry placeholder
          ""  // Second exit placeholder
        ];
      });

      autoTable(doc, {
        startY: 60,
        head: [['DIA/SEMANA', 'ENTRADA', 'SAÍDA', 'ENTRADA', 'SAÍDA']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' }
        }
      });

      const finalY = (doc as any).lastAutoTable.finalY || 150;
      doc.setFontSize(8);
      const footerText = "De conformidade com a Portaria MTB 3.626 de 13/11/1991 art. 13, este cartão substitui, para todos os efeitos legais, o quadro de horário de trabalho, inclusive o de menores";
      doc.text(footerText, 105, finalY + 10, { align: "center", maxWidth: 180 });
    });

    const fileName = employeeIds.length === 1 
      ? `folha_ponto_${grouped[employeeIds[0]].employee_name}.pdf`
      : `folha_ponto_completa.pdf`;
    
    doc.save(fileName);
  };

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 mb-4">
              <img 
                src={settings.login_logo || "/logo.png"} 
                alt="Logo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.src = "https://picsum.photos/seed/psicodonto/200/200";
                }}
              />
            </div>
            <h1 className="text-2xl font-bold text-white">Psicodonto</h1>
            <p className="text-zinc-400 text-sm">Entre com suas credenciais</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">CPF</label>
              <input 
                type="text"
                value={loginCpf}
                onChange={(e) => setLoginCpf(maskCPF(e.target.value))}
                placeholder="000.000.000-00"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Senha</label>
              <input 
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                required
              />
            </div>

            {message && (
              <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {message.text}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 mt-2"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-zinc-900 border-b border-zinc-800 p-4 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center">
            <img 
              src={user?.company_logo || "/logo.png"} 
              alt="Psicodonto Logo" 
              className="w-full h-full object-contain"
              onError={(e) => {
                e.currentTarget.src = "https://picsum.photos/seed/psicodonto/100/100";
              }}
            />
          </div>
          <span className="font-bold text-lg tracking-tight">Psicodonto</span>
        </div>
        <button onClick={handleLogout} className="text-red-400 p-2">
          <LogOut size={20} />
        </button>
      </header>

      {/* Sidebar (Desktop) / Bottom Nav (Mobile) */}
      <aside className="fixed bottom-0 left-0 right-0 z-40 md:relative md:flex md:w-64 bg-zinc-900 border-t md:border-t-0 md:border-r border-zinc-800 flex flex-row md:flex-col">
        <div className="hidden md:flex p-6 border-b border-zinc-800 items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center">
            <img 
              src={user?.company_logo || "/logo.png"} 
              alt="Psicodonto Logo" 
              className="w-full h-full object-contain"
              onError={(e) => {
                e.currentTarget.src = "https://picsum.photos/seed/psicodonto/100/100";
              }}
            />
          </div>
          <span className="font-bold text-xl tracking-tight">Psicodonto</span>
        </div>

        <nav className="flex-1 flex md:flex-col p-2 md:p-4 gap-1 md:gap-2 overflow-x-auto md:overflow-x-visible no-scrollbar">
          <button 
            onClick={() => setView('dashboard')}
            className={`flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-xl transition-all ${view === 'dashboard' ? 'bg-emerald-500/10 text-emerald-500' : 'text-zinc-500 md:text-zinc-400 hover:bg-zinc-800'}`}
          >
            <Clock size={20} />
            <span className="text-[10px] md:text-sm font-medium">Ponto</span>
          </button>

          {user?.is_admin === 1 && (
            <>
              <div className="hidden md:block px-4 py-2 text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-4">Administração</div>
              <button 
                onClick={() => setView('companies')}
                className={`flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-xl transition-all ${view === 'companies' ? 'bg-emerald-500/10 text-emerald-500' : 'text-zinc-500 md:text-zinc-400 hover:bg-zinc-800'}`}
              >
                <Building2 size={20} />
                <span className="text-[10px] md:text-sm font-medium">Empresas</span>
              </button>
              <button 
                onClick={() => setView('employees')}
                className={`flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-xl transition-all ${view === 'employees' ? 'bg-emerald-500/10 text-emerald-500' : 'text-zinc-500 md:text-zinc-400 hover:bg-zinc-800'}`}
              >
                <Users size={20} />
                <span className="text-[10px] md:text-sm font-medium">Equipe</span>
              </button>
              <button 
                onClick={() => {
                  clearFilters();
                  setView('reports');
                }}
                className={`flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-xl transition-all ${view === 'reports' ? 'bg-emerald-500/10 text-emerald-500' : 'text-zinc-500 md:text-zinc-400 hover:bg-zinc-800'}`}
              >
                <FileText size={20} />
                <span className="text-[10px] md:text-sm font-medium">Relatórios</span>
              </button>
              <button 
                onClick={() => setView('settings')}
                className={`flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-xl transition-all ${view === 'settings' ? 'bg-emerald-500/10 text-emerald-500' : 'text-zinc-500 md:text-zinc-400 hover:bg-zinc-800'}`}
              >
                <Settings size={20} />
                <span className="text-[10px] md:text-sm font-medium">Configurações</span>
              </button>
            </>
          )}

          <button 
            onClick={() => setView('records')}
            className={`flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-xl transition-all ${view === 'records' ? 'bg-emerald-500/10 text-emerald-500' : 'text-zinc-500 md:text-zinc-400 hover:bg-zinc-800'}`}
          >
            <Clock size={20} />
            <span className="text-[10px] md:text-sm font-medium">Histórico</span>
          </button>
        </nav>

        {/* Desktop User Info */}
        <div className="hidden md:block p-4 border-t border-zinc-800">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-700">
              <UserIcon size={20} className="text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user?.name}</p>
              <p className="text-[10px] text-zinc-500 truncate uppercase tracking-wider">{user?.role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut size={20} />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-10 pb-24 md:pb-10">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto"
            >
              <div className="mb-10">
                <h2 className="text-3xl font-bold mb-2">Olá, {user?.name}</h2>
                <p className="text-zinc-400">Registre seu horário de trabalho de hoje.</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Clock size={120} />
                </div>
                
                <div className="relative z-10 flex flex-col items-center">
                  <div className="text-5xl font-mono font-bold mb-8 text-emerald-500">
                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>

                  <div className="w-full space-y-6">
                    <div className="flex justify-between items-center p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                      <div>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Empresa</p>
                        <p className="font-medium">{user?.company_name}</p>
                      </div>
                      <Building2 className="text-zinc-600" size={20} />
                    </div>

                    <div className="flex justify-between items-center p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                      <div>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Cargo</p>
                        <p className="font-medium">{user?.role}</p>
                      </div>
                      <Shield className="text-zinc-600" size={20} />
                    </div>

                    {!clockStatus.hasOpenRecord ? (
                      <button 
                        onClick={handleClockIn}
                        disabled={loading}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold py-5 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 text-lg"
                      >
                        <ChevronRight size={24} />
                        Registrar Entrada
                      </button>
                    ) : (
                      <button 
                        onClick={handleClockOut}
                        disabled={loading}
                        className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-5 rounded-2xl transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-3 text-lg"
                      >
                        <LogOut size={24} />
                        Registrar Saída
                      </button>
                    )}

                    {clockStatus.hasOpenRecord && (
                      <div className="text-center p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                        <p className="text-xs text-zinc-500 mb-1">Entrada registrada às</p>
                        <p className="text-emerald-500 font-mono font-bold">{formatDateTime(clockStatus.record?.entry_time || null)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {message && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-6 p-4 rounded-2xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}
                >
                  {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  <span className="font-medium">{message.text}</span>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div>
                <h2 className="text-3xl font-bold mb-2">Configurações do Sistema</h2>
                <p className="text-zinc-400">Personalize a aparência global da plataforma.</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-xl">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Building2 className="text-emerald-500" size={24} />
                  Identidade Visual
                </h3>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Logo da Tela de Login</label>
                    <div className="flex flex-col md:flex-row gap-6 items-start">
                      <div className="w-32 h-32 bg-zinc-800 rounded-2xl border border-zinc-700 flex items-center justify-center overflow-hidden p-4">
                        <img 
                          src={loginLogoUrl || "/logo.png"} 
                          alt="Preview Logo" 
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "https://cdn-icons-png.flaticon.com/512/2664/2664531.png";
                          }}
                        />
                      </div>
                      <div className="flex-1 w-full space-y-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-xs text-zinc-500">URL da Imagem</label>
                          <input 
                            type="url"
                            placeholder="https://exemplo.com/sua-logo.png"
                            value={loginLogoUrl}
                            onChange={(e) => setLoginLogoUrl(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          />
                        </div>
                        
                        <div className="relative">
                          <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-zinc-800"></div>
                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Ou</span>
                            <div className="h-px flex-1 bg-zinc-800"></div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-xs text-zinc-500">Upload de Arquivo</label>
                          <input 
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setLoginLogoUrl(reader.result as string);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-500 file:text-zinc-950 hover:file:bg-emerald-600 cursor-pointer"
                          />
                        </div>

                        <button 
                          onClick={() => updateSetting('login_logo', loginLogoUrl)}
                          disabled={loading}
                          className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold px-8 py-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                        >
                          {loading ? 'Salvando...' : 'Salvar Logo do Sistema'}
                        </button>
                        <p className="text-xs text-zinc-500">Você pode inserir uma URL ou fazer o upload de uma imagem do seu computador.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {message && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-2xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}
                >
                  {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  <span className="font-medium">{message.text}</span>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === 'companies' && (
            <motion.div 
              key="companies"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold mb-2">Empresas</h2>
                  <p className="text-zinc-400">Gerencie as empresas cadastradas no sistema.</p>
                </div>
                <button 
                  onClick={() => {
                    setEditingCompany(null);
                    setNewCompanyName('');
                    setNewCompanyCnpj('');
                    setNewCompanyLogo('');
                    setShowCompanyModal(true);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <Plus size={20} />
                  Nova Empresa
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {companies.map(company => (
                  <div key={company.id} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl hover:border-emerald-500/30 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center group-hover:bg-emerald-500/10 transition-all overflow-hidden">
                        {company.logo_url ? (
                          <img src={company.logo_url} alt={company.name} className="w-full h-full object-contain" />
                        ) : (
                          <Building2 className="text-zinc-400 group-hover:text-emerald-500 transition-all" />
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => openEditCompany(company)}
                          className="p-2 text-zinc-500 hover:text-emerald-500 transition-all"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => confirmDeleteCompany(company)}
                          className="p-2 text-zinc-500 hover:text-red-500 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">ID: #{company.id}</p>
                    <h3 className="text-xl font-bold mb-1">{company.name}</h3>
                    <p className="text-zinc-400 text-sm">CNPJ: {company.cnpj}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'employees' && (
            <motion.div 
              key="employees"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold mb-2">Funcionários</h2>
                  <p className="text-zinc-400">Gerencie os funcionários e seus acessos.</p>
                </div>
                <button 
                  onClick={() => {
                    setEditingEmployee(null);
                    setNewEmpName('');
                    setNewEmpRole('');
                    setNewEmpCpf('');
                    setNewEmpEmail('');
                    setNewEmpCompanyId('');
                    setNewEmpIsAdmin(false);
                    setShowEmployeeModal(true);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <Plus size={20} />
                  Novo Funcionário
                </button>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-zinc-800/50 border-b border-zinc-800">
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Funcionário</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Empresa / Cargo</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">CPF / E-mail</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {employees.map(emp => (
                      <tr key={emp.id} className="hover:bg-zinc-800/30 transition-all">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-xs font-bold text-zinc-400">
                              {emp.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold">{emp.name}</p>
                              <p className="text-[10px] text-zinc-500">ID: #{emp.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium">{emp.company_name}</p>
                          <p className="text-xs text-zinc-500">{emp.role}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-mono">{emp.cpf}</p>
                          <p className="text-xs text-zinc-500">{emp.email}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${emp.is_admin ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}>
                            {emp.is_admin ? 'Admin' : 'Func'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => openEditEmployee(emp)}
                              className="p-2 text-zinc-500 hover:text-emerald-500 transition-all"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => confirmDeleteEmployee(emp)}
                              className="p-2 text-zinc-500 hover:text-red-500 transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {view === 'records' && (
            <motion.div 
              key="records"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div>
                <h2 className="text-3xl font-bold mb-2">Meus Registros</h2>
                <p className="text-zinc-400">Histórico completo de entradas e saídas.</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-zinc-800/50 border-b border-zinc-800">
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Data</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Entrada</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Saída</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Status</th>
                      {user?.is_admin === 1 && (
                        <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">Ações</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {records.map(record => (
                      <tr key={record.id} className="hover:bg-zinc-800/30 transition-all">
                        <td className="px-6 py-4 font-medium">
                          {new Date(record.entry_time).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 font-mono text-emerald-500">
                          {new Date(record.entry_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4 font-mono text-red-400">
                          {record.exit_time ? new Date(record.exit_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </td>
                        <td className="px-6 py-4">
                          {record.exit_time ? (
                            <span className="flex items-center gap-1.5 text-emerald-500 text-xs font-medium">
                              <CheckCircle2 size={14} /> Concluído
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-amber-500 text-xs font-medium animate-pulse">
                              <Clock size={14} /> Em aberto
                            </span>
                          )}
                        </td>
                        {user?.is_admin === 1 && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => openEditRecord(record)}
                                className="p-2 text-zinc-500 hover:text-emerald-500 transition-all"
                              >
                                <Edit size={16} />
                              </button>
                              <button 
                                onClick={() => confirmDeleteRecord(record)}
                                className="p-2 text-zinc-500 hover:text-red-500 transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {records.length === 0 && (
                      <tr>
                        <td colSpan={user?.is_admin === 1 ? 5 : 4} className="px-6 py-10 text-center text-zinc-500">Nenhum registro encontrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {view === 'reports' && (
            <motion.div 
              key="reports"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div>
                <h2 className="text-3xl font-bold mb-2">Relatórios de Ponto</h2>
                <p className="text-zinc-400">Gere relatórios detalhados com filtros avançados.</p>
              </div>

              {/* Filters */}
              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-xl">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Empresa</label>
                    <select 
                      value={reportFilters.companyId}
                      onChange={(e) => setReportFilters({ ...reportFilters, companyId: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none"
                    >
                      <option value="">Todas as Empresas</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Funcionário</label>
                    <select 
                      value={reportFilters.employeeId}
                      onChange={(e) => setReportFilters({ ...reportFilters, employeeId: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none"
                    >
                      <option value="">Todos os Funcionários</option>
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Data Inicial</label>
                    <input 
                      type="date"
                      value={reportFilters.startDate}
                      onChange={(e) => setReportFilters({ ...reportFilters, startDate: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Data Final</label>
                    <input 
                      type="date"
                      value={reportFilters.endDate}
                      onChange={(e) => setReportFilters({ ...reportFilters, endDate: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>
                <div className="flex flex-col md:flex-row gap-3">
                  <button 
                    onClick={fetchReportData}
                    disabled={loading}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                  >
                    <Filter size={20} />
                    {loading ? 'Filtrando...' : 'Aplicar Filtros'}
                  </button>
                  <button 
                    onClick={clearFilters}
                    disabled={loading}
                    className="md:w-auto bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-6 py-3 rounded-xl transition-all border border-zinc-700 flex items-center justify-center gap-2"
                  >
                    <X size={20} />
                    Limpar
                  </button>
                  <button 
                    onClick={exportToExcel}
                    disabled={reportRecords.length === 0}
                    className="md:w-auto bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-6 py-3 rounded-xl transition-all border border-zinc-700 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <FileSpreadsheet size={20} />
                    Excel
                  </button>
                  <button 
                    onClick={exportToPDF}
                    disabled={reportRecords.length === 0}
                    className="md:w-auto bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-6 py-3 rounded-xl transition-all border border-zinc-700 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Download size={20} />
                    PDF
                  </button>
                </div>
              </div>

              {reportRecords.length > 0 && (
                <div className="flex justify-between items-center px-2">
                  <p className="text-zinc-400 text-sm font-medium">
                    Mostrando <span className="text-white">{reportRecords.length}</span> registros
                  </p>
                </div>
              )}

              {/* Report Results */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-zinc-800/50 border-b border-zinc-800">
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Funcionário</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Empresa</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Entrada</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Saída</th>
                      {user?.is_admin === 1 && (
                        <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">Ações</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {loading && reportRecords.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center">
                          <div className="flex items-center justify-center gap-2 text-zinc-500">
                            <Clock className="animate-spin" size={20} />
                            Carregando dados...
                          </div>
                        </td>
                      </tr>
                    ) : (
                      reportRecords.map(record => (
                        <tr key={record.id} className="hover:bg-zinc-800/30 transition-all">
                          <td className="px-6 py-4">
                            <p className="font-bold">{record.employee_name}</p>
                            <p className="text-xs text-zinc-500">{record.role}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm">{record.company_name}</p>
                          </td>
                          <td className="px-6 py-4 font-mono text-emerald-500">
                            {formatDateTime(record.entry_time)}
                          </td>
                          <td className="px-6 py-4 font-mono text-red-400">
                            {formatDateTime(record.exit_time)}
                          </td>
                          {user?.is_admin === 1 && (
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => openEditRecord(record)}
                                  className="p-2 text-zinc-500 hover:text-emerald-500 transition-all"
                                >
                                  <Edit size={16} />
                                </button>
                                <button 
                                  onClick={() => confirmDeleteRecord(record)}
                                  className="p-2 text-zinc-500 hover:text-red-500 transition-all"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                    {!loading && reportRecords.length === 0 && (
                      <tr>
                        <td colSpan={user?.is_admin === 1 ? 5 : 4} className="px-6 py-10 text-center text-zinc-500">Nenhum registro encontrado para os filtros selecionados.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="text-red-500" size={40} />
              </div>
              <h3 className="text-2xl font-bold mb-2">Confirmar Exclusão</h3>
              <p className="text-zinc-400 mb-8">
                Você tem certeza que deseja excluir <span className="text-white font-bold">{deleteTarget?.name}</span>? 
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex flex-col md:flex-row gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-2xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    if (deleteTarget?.type === 'company') handleDeleteCompany(deleteTarget.id);
                    if (deleteTarget?.type === 'employee') handleDeleteEmployee(deleteTarget.id);
                    if (deleteTarget?.type === 'record') handleDeleteRecord(deleteTarget.id);
                  }}
                  disabled={loading}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-red-500/20"
                >
                  {loading ? 'Excluindo...' : 'Confirmar Exclusão'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Company Modal */}
      <AnimatePresence>
        {showCompanyModal && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-zinc-900 border-t md:border border-zinc-800 w-full max-w-md rounded-t-3xl md:rounded-3xl p-6 md:p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">{editingCompany ? 'Editar Empresa' : 'Nova Empresa'}</h3>
                <button onClick={() => setShowCompanyModal(false)} className="text-zinc-500 hover:text-white transition-all">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleAddCompany} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Nome da Empresa</label>
                  <input 
                    type="text"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Ex: Minha Empresa LTDA"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">CNPJ</label>
                  <input 
                    type="text"
                    value={newCompanyCnpj}
                    onChange={(e) => setNewCompanyCnpj(maskCNPJ(e.target.value))}
                    placeholder="00.000.000/0001-00"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Logo da Empresa</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-zinc-800 rounded-xl border border-zinc-700 flex items-center justify-center overflow-hidden">
                      {newCompanyLogo ? (
                        <img src={newCompanyLogo} alt="Preview" className="w-full h-full object-contain" />
                      ) : (
                        <Building2 className="text-zinc-600" />
                      )}
                    </div>
                    <label className="flex-1">
                      <div className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-center cursor-pointer transition-all">
                        Selecionar Imagem
                      </div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleLogoUpload} 
                        className="hidden" 
                      />
                    </label>
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                >
                  {loading ? 'Salvando...' : editingCompany ? 'Atualizar Empresa' : 'Cadastrar Empresa'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Employee Modal */}
      <AnimatePresence>
        {showEmployeeModal && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-zinc-900 border-t md:border border-zinc-800 w-full max-w-lg rounded-t-3xl md:rounded-3xl p-6 md:p-8 shadow-2xl max-h-[95vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">{editingEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}</h3>
                <button onClick={() => setShowEmployeeModal(false)} className="text-zinc-500 hover:text-white transition-all">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleAddEmployee} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Nome Completo</label>
                    <input 
                      type="text"
                      value={newEmpName}
                      onChange={(e) => setNewEmpName(e.target.value)}
                      placeholder="Nome do funcionário"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Cargo</label>
                    <input 
                      type="text"
                      value={newEmpRole}
                      onChange={(e) => setNewEmpRole(e.target.value)}
                      placeholder="Ex: Desenvolvedor"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">CPF</label>
                    <input 
                      type="text"
                      value={newEmpCpf}
                      onChange={(e) => setNewEmpCpf(maskCPF(e.target.value))}
                      placeholder="000.000.000-00"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">E-mail</label>
                    <input 
                      type="email"
                      value={newEmpEmail}
                      onChange={(e) => setNewEmpEmail(e.target.value)}
                      placeholder="email@empresa.com"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Empresa</label>
                  <select 
                    value={newEmpCompanyId}
                    onChange={(e) => setNewEmpCompanyId(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none"
                    required
                  >
                    <option value="">Selecione uma empresa</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3 p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                  <input 
                    type="checkbox"
                    id="isAdmin"
                    checked={newEmpIsAdmin}
                    onChange={(e) => setNewEmpIsAdmin(e.target.checked)}
                    className="w-5 h-5 accent-emerald-500"
                  />
                  <label htmlFor="isAdmin" className="text-sm font-medium cursor-pointer">Definir como Administrador</label>
                </div>
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                >
                  {loading ? 'Salvando...' : editingEmployee ? 'Atualizar Funcionário' : 'Cadastrar Funcionário'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Record Modal */}
      <AnimatePresence>
        {showRecordModal && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-zinc-900 border-t md:border border-zinc-800 w-full max-w-md rounded-t-3xl md:rounded-3xl p-6 md:p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">Editar Registro</h3>
                <button onClick={() => setShowRecordModal(false)} className="text-zinc-500 hover:text-white transition-all">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleUpdateRecord} className="space-y-4">
                <div>
                  <p className="text-sm text-zinc-400 mb-4">
                    Funcionário: <span className="text-white font-bold">{editingRecord?.employee_name}</span>
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Horário de Entrada</label>
                  <input 
                    type="datetime-local"
                    value={editEntryTime}
                    onChange={(e) => setEditEntryTime(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Horário de Saída</label>
                  <input 
                    type="datetime-local"
                    value={editExitTime}
                    onChange={(e) => setEditExitTime(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">Deixe em branco se o registro ainda estiver aberto.</p>
                </div>
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                >
                  {loading ? 'Salvando...' : 'Atualizar Registro'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
