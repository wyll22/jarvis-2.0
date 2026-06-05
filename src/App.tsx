import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Terminal,
  Calendar,
  Briefcase,
  Users,
  Brain,
  Mic,
  Send,
  User,
  Cpu,
  QrCode,
  Power,
  RefreshCw,
  Cloud,
  Settings,
  RotateCcw,
  Shield,
  Palette,
  Globe,
  HelpCircle,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { io as ioClient } from 'socket.io-client';
import { HUDModule, SystemStatus } from './components/HUD';
import { LoginScreen, BootSequence, Particles } from './components/LoginBoot';
import { ArcReactorDashboard } from './components/ArcReactorCenter';
import { JarvisChat } from './components/JarvisChat';
import { THEMES, LANGUAGES, CONFIG_TOOLTIPS, getSavedTheme, getSavedLanguage, saveTheme, saveLanguage, type ThemeId, type LanguageId } from './config/themes';
import { cn } from './lib/utils';
import { format } from 'date-fns';
import { DashboardTabs } from './components/DashboardTabs';
import {
  fetchAppointments,
  fetchContacts,
  fetchMemories,
  fetchProjects,
  fetchWhatsAppStatus,
  sendChatMessage,
  startWhatsApp,
  stopWhatsApp,
  resetWhatsApp,
  saveSystemConfig,
  fetchSystemConfig,
  fetchClients,
  updateClientStatus,
  deleteClient,
  updateClientName,
  registerClient,
  upgradeClient,
  API_BASE_URL,
} from './services/api';

type Client = {
  id: string;
  name?: string | null;
  phone_number: string;
  whatsapp_jid: string;
  status: string;
  trial_ends_at?: string | null;
};

// Retorna quantas horas/minutos restam no trial (ou null se não for trial)
function getTrialCountdown(trialEndsAt?: string | null): string | null {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  if (diff <= 0) return 'EXPIRADO';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m restantes`;
  return `${minutes}m restantes`;
}

type Message = {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
};

type Appointment = {
  id: string;
  title: string;
  description?: string;
  scheduled_at?: string;
  date?: string | Date;
  status?: string;
};

type ProjectSummary = {
  progressText?: string;
  progressPercent?: number;
  height?: string | null;
  initialWeight?: string | null;
  currentWeight?: string | null;
  targetWeight?: string | null;
  measurementsCount?: number;
};

type Project = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  goal?: string | null;
  status?: string | null;
  summary?: ProjectSummary;
};

type Contact = {
  id: string;
  name: string;
  phone?: string;
};

type Memory = {
  id: string;
  content?: string;
  fact?: string;
  category?: string;
};

type WhatsAppStatus = {
  status: 'stopped' | 'starting' | 'qr' | 'connected' | 'disconnected' | 'error';
  qr: string | null;
  phone: string | null;
  lastError: string | null;
};

type Toast = {
  id: number;
  message: string;
};

const MOCK_USER = {
  displayName: 'Wylberty',
};

const MOCK_APPOINTMENTS: Appointment[] = [];
const MOCK_PROJECTS: Project[] = [];
const MOCK_CONTACTS: Contact[] = [];
const MOCK_MEMORIES: Memory[] = [];

const INITIAL_WHATSAPP_STATUS: WhatsAppStatus = {
  status: 'stopped',
  qr: null,
  phone: null,
  lastError: null,
};

function formatStatus(status?: string | null) {
  if (!status) return 'ACTIVE';

  const normalized = status.toLowerCase();

  if (normalized === 'active') return 'ACTIVE';
  if (normalized === 'pending') return 'PENDING';
  if (normalized === 'paused') return 'PAUSED';
  if (normalized === 'done') return 'DONE';

  return status.toUpperCase();
}

function formatProjectGoal(project: Project) {
  if (project.goal) return project.goal;
  if (project.description) return project.description;
  if (project.summary?.progressText) return project.summary.progressText;

  return 'Projeto ativo sem meta detalhada.';
}

function getAppointmentRawDate(item: Appointment): string | Date | undefined {
  return item.scheduled_at || item.date;
}

function parseAppointmentDate(item: Appointment): Date | null {
  const rawDate = getAppointmentRawDate(item);

  if (!rawDate) return null;

  if (rawDate instanceof Date) {
    return Number.isNaN(rawDate.getTime()) ? null : rawDate;
  }

  const text = String(rawDate).trim();

  if (!text) return null;

  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function isPastAppointment(item: Appointment): boolean {
  const parsedDate = parseAppointmentDate(item);

  if (!parsedDate) return false;

  // Buffer de 30 minutos: considera passado apenas depois de 30min do horário marcado
  // Isso evita que compromissos "de hoje" sumam assim que o horário passa
  const thirtyMinLater = new Date(parsedDate.getTime() + 30 * 60 * 1000);
  return thirtyMinLater.getTime() < Date.now();
}

function isVisiblePanelAppointment(item: Appointment): boolean {
  const normalizedStatus = String(item.status || '').toLowerCase();

  if (['cancelado', 'cancelled', 'canceled', 'done', 'completed'].includes(normalizedStatus)) {
    return false;
  }

  // Se não tem data, mostra mesmo assim (não filtrar dados sem data)
  const rawDate = item.scheduled_at || item.date;
  if (!rawDate) return true;

  return !isPastAppointment(item);
}

function sortAppointmentsByDate(items: Appointment[]): Appointment[] {
  return [...items].sort((a, b) => {
    const dateA = parseAppointmentDate(a)?.getTime() || 0;
    const dateB = parseAppointmentDate(b)?.getTime() || 0;

    return dateA - dateB;
  });
}

function getWhatsAppStatusLabel(status: WhatsAppStatus['status']) {
  if (status === 'connected') return 'CONECTADO';
  if (status === 'qr') return 'AGUARDANDO QR';
  if (status === 'starting') return 'INICIANDO';
  if (status === 'disconnected') return 'DESCONECTADO';
  if (status === 'error') return 'ERRO';
  return 'PARADO';
}

function getWhatsAppStatusClass(status: WhatsAppStatus['status']) {
  if (status === 'connected') return 'text-green-400 border-green-400/40 bg-green-400/10';
  if (status === 'qr') return 'text-yellow-300 border-yellow-300/40 bg-yellow-300/10';
  if (status === 'error') return 'text-red-400 border-red-400/40 bg-red-400/10';

  return 'text-hud-cyan border-hud-cyan/40 bg-hud-cyan/10';
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('javis_chat_history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('javis_chat_history', JSON.stringify(messages));
  }, [messages]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);

  // Fluxo de autenticação: login → boot → dashboard
  const [authPhase, setAuthPhase] = useState<'login' | 'boot' | 'ready'>(() => {
    // localStorage persiste entre reloads do Vite (diferente do sessionStorage que é apagado)
    return localStorage.getItem('javis_auth') === 'true' ? 'ready' : 'login';
  });

  const [appointments, setAppointments] = useState<Appointment[]>(MOCK_APPOINTMENTS);
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);
  const [contacts, setContacts] = useState<Contact[]>(MOCK_CONTACTS);
  const [memories, setMemories] = useState<Memory[]>(MOCK_MEMORIES);
  const [clients, setClients] = useState<Client[]>([]);
  const [whatsappStatus, setWhatsAppStatus] =
    useState<WhatsAppStatus>(INITIAL_WHATSAPP_STATUS);
  const [isWhatsAppLoading, setIsWhatsAppLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  // Modo do painel central: 'hud' = Arc Reactor fullscreen | 'chat' = Chat fullscreen | 'dashboard' = layout 3 colunas
  const [centerMode, setCenterMode] = useState<'hud' | 'chat' | 'dashboard'>('hud');
  const [dashboardTab, setDashboardTab] = useState<'clientes' | 'contatos' | 'agenda' | 'projetos' | 'sistema'>('clientes');
  const [clientSearch, setClientSearch] = useState('');
  // isResetting removed — reset is admin-only via CLI script

  // Formulário de novo cliente e ações
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientPlan, setNewClientPlan] = useState<'active' | 'trial'>('active');
  const [newClientTrialHours, setNewClientTrialHours] = useState('24');
  const [isRegisteringClient, setIsRegisteringClient] = useState(false);

  const handleRegisterClient = async () => {
    if (!newClientName.trim() || !newClientPhone.trim()) {
      alert("Preencha nome e número do cliente.");
      return;
    }
    setIsRegisteringClient(true);
    try {
      await registerClient({ 
        name: newClientName, 
        phone_number: newClientPhone, 
        plan: newClientPlan,
        trialHours: newClientPlan === 'trial' ? Number(newClientTrialHours) : undefined
      });
      setNewClientName('');
      setNewClientPhone('');
      await loadClients();
    } catch (err) {
      console.error(err);
      alert("Erro ao cadastrar cliente.");
    } finally {
      setIsRegisteringClient(false);
    }
  };

  const handleRenameClient = async (id: string, currentName: string | null | undefined) => {
    const newName = window.prompt("Novo nome do cliente:", currentName || "");
    if (newName !== null && newName.trim() !== "") {
      try {
        await updateClientName(id, newName.trim());
        await loadClients();
      } catch (err) {
        console.error(err);
        alert("Erro ao renomear cliente");
      }
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (window.confirm("ATENÇÃO! Deseja EXCLUIR DEFINITIVAMENTE este cliente? Isso apagará todos os projetos, compromissos e dados dele.")) {
      try {
        await deleteClient(id);
        await loadClients();
      } catch (err) {
        console.error(err);
        alert("Erro ao excluir cliente");
      }
    }
  };

  const handleUpgradeClient = async (id: string, name: string | null | undefined) => {
    const firstName = String(name || 'este cliente').split(' ')[0];
    if (window.confirm(`Converter ${firstName} para cliente ATIVO permanente?\n\nO trial será encerrado e todos os dados serão preservados.`)) {
      try {
        await upgradeClient(id);
        await loadClients();
        showToast(`${firstName} convertido para cliente ativo.`);
      } catch (err) {
        console.error(err);
        alert('Erro ao converter cliente');
      }
    }
  };

  // Tema e Idioma
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(getSavedTheme);
  const [currentLang, setCurrentLang] = useState<LanguageId>(getSavedLanguage);
  const t = LANGUAGES[currentLang];
  const theme = THEMES[currentTheme];

  // Aplicar tema via CSS custom properties e class no body
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', theme.primary);
    root.style.setProperty('--theme-rgb', theme.primaryRgb);
    root.style.setProperty('--theme-glow', theme.glowColor);
    root.style.setProperty('--theme-accent', theme.accent);
    
    // Adiciona o tema
    document.body.classList.add(`theme-jarvis`);
  }, [currentTheme, theme]);

  const [isDayMode, setIsDayMode] = useState(false);

  useEffect(() => {
    const checkTime = () => {
      const hour = new Date().getHours();
      setIsDayMode(hour >= 6 && hour < 18);
    };
    checkTime();
    const interval = setInterval(checkTime, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const audioContextRef = useRef<AudioContext | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const visibleAppointments = sortAppointmentsByDate(
    appointments.filter(isVisiblePanelAppointment),
  );

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadAppointments = async () => {
    try {
      const result = await fetchAppointments();

      if (result?.data) {
        setAppointments(result.data);
      }
    } catch (error) {
      console.error('Erro ao carregar compromissos do backend:', error);
    }
  };

  const loadProjects = async () => {
    try {
      const result = await fetchProjects();

      if (result?.data) {
        setProjects(result.data);
      }
    } catch (error) {
      console.error('Erro ao carregar projetos do backend:', error);
    }
  };

  const loadContacts = async () => {
    try {
      const result = await fetchContacts();

      if (result?.data) {
        setContacts(result.data);
      }
    } catch (error) {
      console.error('Erro ao carregar contatos do backend:', error);
    }
  };

  const loadMemories = async () => {
    try {
      const result = await fetchMemories();

      if (result?.data) {
        setMemories(result.data);
      }
    } catch (error) {
      console.error('Erro ao carregar memórias do backend:', error);
    }
  };

  const loadWhatsAppStatus = async () => {
    try {
      const result = await fetchWhatsAppStatus();

      if (result?.whatsapp) {
        setWhatsAppStatus(result.whatsapp);
      }
    } catch (error) {
      console.error('Erro ao carregar status do WhatsApp:', error);
    }
  };

  const loadClients = async () => {
    try {
      const result = await fetchClients();
      if (result?.data) {
        setClients(result.data);
      }
    } catch (error) {
      console.error('Erro ao carregar clientes do backend:', error);
    }
  };

  const loadDashboardData = async () => {
    await Promise.allSettled([
      loadAppointments(),
      loadProjects(),
      loadContacts(),
      loadMemories(),
      loadWhatsAppStatus(),
      loadClients(),
    ]);
  };

  useEffect(() => {
    if (authPhase === 'ready') {
      loadDashboardData();
    }
  }, [authPhase]);

  // ─── Listener de logout global (disparado pelo api.ts quando recebe 401) ─────────────────────
  useEffect(() => {
    const handleLogout = () => setAuthPhase('login');
    window.addEventListener('javis:logout', handleLogout);
    return () => window.removeEventListener('javis:logout', handleLogout);
  }, []);

  // ─── Socket.io — QR Code e status WhatsApp em tempo real ─────────────────────
  useEffect(() => {
    const socket = ioClient(API_BASE_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.log('[Socket.io] Conectado ao backend J.A.R.V.I.S.');
    });

    socket.on('whatsapp:status', (data: WhatsAppStatus) => {
      console.log('[Socket.io] whatsapp:status recebido:', data);
      setWhatsAppStatus((prev) => ({ ...prev, ...data }));
    });

    socket.on('whatsapp:qr', (data: { qr: string }) => {
      console.log('[Socket.io] QR Code recebido via socket.');
      setWhatsAppStatus((prev) => ({ ...prev, status: 'qr', qr: data.qr }));
    });

    socket.on('disconnect', () => {
      console.log('[Socket.io] Desconectado do backend.');
    });

    // ── database:updated — refetch automático quando o WhatsApp altera dados ──
    socket.on('database:updated', (data: { type: string; timestamp: number }) => {
      console.log(`[Socket.io] database:updated recebido → ${data.type}`);
      switch (data.type) {
        case 'appointments':
          loadAppointments();
          break;
        case 'finances':
          // finances não tem widget próprio, recarrega tudo
          loadDashboardData();
          break;
        case 'todos':
          loadDashboardData();
          break;
        case 'contacts':
          loadContacts();
          break;
        case 'memories':
          loadMemories();
          break;
        case 'projects':
          loadProjects();
          break;
        case 'clients':
          loadClients();
          break;
        default:
          loadDashboardData();
      }
    });

    // Polling de fallback leve para dados gerais (30s)
    const interval = window.setInterval(() => {
      loadWhatsAppStatus();
    }, 30000);

    return () => {
      socket.disconnect();
      window.clearInterval(interval);
    };
  }, []);


  const handleStartWhatsApp = async () => {
    setIsWhatsAppLoading(true);

    try {
      const result = await startWhatsApp();

      if (result?.whatsapp) {
        setWhatsAppStatus(result.whatsapp);
      }

      await loadWhatsAppStatus();
    } catch (error) {
      console.error('Erro ao iniciar WhatsApp:', error);
    } finally {
      setIsWhatsAppLoading(false);
    }
  };

  const handleStopWhatsApp = async () => {
    setIsWhatsAppLoading(true);

    try {
      const result = await stopWhatsApp();

      if (result?.whatsapp) {
        setWhatsAppStatus(result.whatsapp);
      }

      await loadWhatsAppStatus();
    } catch (error) {
      console.error('Erro ao parar WhatsApp:', error);
    } finally {
      setIsWhatsAppLoading(false);
    }
  };

  const getAudioContext = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }

      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      return audioContextRef.current;
    } catch (e) {
      console.error('AudioContext check failed', e);
      return null;
    }
  };

  const calibrateAudio = () => {
    const ctx = getAudioContext();

    if (ctx) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);

      console.log('JAVIS: Sistemas de áudio calibrados.');
    }
  };

  const speakFallback = (text: string) => {
    if (!isVoiceEnabled) return;
    try {
      setIsSpeaking(true);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.0;
      utterance.pitch = 0.8;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('Erro ao usar speechSynthesis', error);
      setIsSpeaking(false);
    }
  };

  const speakJavisTTS = async (text: string) => {
    if (!isVoiceEnabled) return;
    
    // Remove as tags e formatações pesadas pro locutor
    const cleanText = text.replace(/\[AUDIO\]/g, "").replace(/\*/g, "").trim();

    try {
      setIsSpeaking(true);
      const response = await fetch(`${API_BASE_URL}/api/tts/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText }),
      });
      
      if (!response.ok) throw new Error("TTS Backend Falhou");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };
      
      audio.play().catch((err) => {
        console.error("Erro ao reproduzir áudio (Autoplay block?):", err);
        speakFallback(cleanText);
      });
    } catch (error) {
      console.error("Erro ao usar TTS backend, caindo para locutor nativo", error);
      speakFallback(cleanText);
    }
  };

  const showToast = (message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleSend = async (overrideMessage?: string) => {
    getAudioContext();
    const userMsg = overrideMessage || input;
    if (!userMsg.trim()) return;

    if (!overrideMessage) setInput('');

    setMessages((prev) => [...prev, { role: 'user', content: userMsg, timestamp: Date.now() }]);
    setIsProcessing(true);

    try {
      const result = await sendChatMessage(userMsg);
      let response = result?.reply || 'Comando processado, Senhor.';

      const wantsAudio = response.includes("[AUDIO]");
      response = response.replace(/\[AUDIO\]/g, "").trim();

      setMessages((prev) => [...prev, { role: 'model', content: response, timestamp: Date.now() }]);
      await loadDashboardData();
      showToast(t.operationComplete);

      if (isVoiceEnabled) {
        // No painel, podemos falar tudo ou apenas o que tem a tag. Como é HUD, falaremos o que for gerado.
        speakJavisTTS(response);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: 'model', content: 'SYSTEM ERROR: Protocol failed to initialize.', timestamp: Date.now() },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // ==========================================
  // WAKE WORD (JARVIS / JAVIS)
  // ==========================================
  useEffect(() => {
    if (!isVoiceEnabled) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript.trim().toLowerCase();
      
      // Se a frase começar com "Javis" ou "Jarvis"
      if (transcript.startsWith("javis") || transcript.startsWith("jarvis")) {
        // Toca um bipe curto de confirmação
        const ctx = getAudioContext();
        if (ctx) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880; // Nota musical A5
          gain.gain.setValueAtTime(0.05, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        }

        // Extrai o comando retirando a palavra de ativação
        let command = transcript.replace(/^(javis|jarvis)[,\s]*/i, "").trim();
        if (command) {
          handleSend(command);
        }
      }
    };

    recognition.onend = () => {
      if (isVoiceEnabled) {
        try { recognition.start(); } catch (e) {}
      }
    };

    try { recognition.start(); } catch (e) {}

    return () => {
      recognition.onend = null;
      recognition.stop();
    };
  }, [isVoiceEnabled, input]); // Recria se o input mudar para não ficar com estado antigo no handleSend? 
  // Na verdade handleSend usa a versão mais recente via prev no setMessages, mas input pode ser lido errado.

  const toggleListening = () => {
    // Agora o botão serve como gatilho manual além do Wake Word
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Seu navegador não suporta reconhecimento de voz.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.onresult = (event: any) => {
      handleSend(event.results[0][0].transcript);
      setIsListening(false);
    };
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  // LOGIN SCREEN
  if (authPhase === 'login') {
    return (
      <LoginScreen
        onAuthenticated={() => {
          localStorage.setItem('javis_auth', 'true');
          setAuthPhase('boot');
        }}
      />
    );
  }

  // BOOT SEQUENCE
  if (authPhase === 'boot') {
    return (
      <BootSequence
        onComplete={() => {
          setAuthPhase('ready');
          setLoading(false);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black">
        <Cpu className="w-12 h-12 text-hud-cyan hud-pulse" />
      </div>
    );
  }

  return (
    <div className={cn(
      "h-screen w-screen flex flex-col bg-hud-black relative overflow-hidden page-transition hud-grid hex-pattern",
      isDayMode ? 'brightness-125 saturate-125' : 'brightness-90 saturate-100'
    )}>
      {/* Efeitos visuais cinematográficos baseados no tema */}
      <div className="hud-scanline" />
      <Particles count={15} />
      
      <SystemStatus
        voiceEnabled={isVoiceEnabled}
        onToggleVoice={() => setIsVoiceEnabled(!isVoiceEnabled)}
        isSpeaking={isSpeaking}
        onCalibrate={calibrateAudio}
      />

      {/* TOASTS NOTIFICATIONS */}
      <div className="absolute top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className="bg-hud-cyan/10 border border-hud-cyan/40 backdrop-blur-md px-4 py-2 flex flex-col pointer-events-auto hud-chamfer-sm holo-border"
            >
              <span className="text-[10px] font-bold tracking-widest text-hud-cyan">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <main className="flex-1 flex flex-col gap-3 p-2 sm:p-4 min-h-0 overflow-hidden">
        {/* ── Botões de navegação: sempre visíveis em todos os modos ── */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => setCenterMode('hud')}
              className={cn(
                'flex-1 py-1.5 text-[9px] font-bold tracking-widest border transition-all',
                centerMode === 'hud'
                  ? 'bg-hud-cyan/20 border-hud-cyan text-hud-cyan shadow-[0_0_10px_rgba(var(--theme-rgb),0.3)]'
                  : 'bg-transparent border-hud-cyan/20 text-hud-cyan/40 hover:border-hud-cyan/50'
              )}
            >
              ⊙ J.A.R.V.I.S. HUD
            </button>
            <button
              onClick={() => setCenterMode('chat')}
              className={cn(
                'flex-1 py-1.5 text-[9px] font-bold tracking-widest border transition-all',
                centerMode === 'chat'
                  ? 'bg-hud-cyan/20 border-hud-cyan text-hud-cyan shadow-[0_0_10px_rgba(var(--theme-rgb),0.3)]'
                  : 'bg-transparent border-hud-cyan/20 text-hud-cyan/40 hover:border-hud-cyan/50'
              )}
            >
              ≡ CHAT
            </button>
            <button
              onClick={() => setCenterMode('dashboard')}
              className={cn(
                'flex-1 py-1.5 text-[9px] font-bold tracking-widest border transition-all',
                centerMode === 'dashboard'
                  ? 'bg-hud-cyan/20 border-hud-cyan text-hud-cyan shadow-[0_0_10px_rgba(var(--theme-rgb),0.3)]'
                  : 'bg-transparent border-hud-cyan/20 text-hud-cyan/40 hover:border-hud-cyan/50'
              )}
            >
              ⊞ DASHBOARD
            </button>
          </div>

          {/* Sub-Tabs do Dashboard */}
          {centerMode === 'dashboard' && (
            <div className="flex gap-1 pb-1 overflow-x-auto">
              {([
                { id: 'clientes' as const, label: '⊕ CLIENTES', color: 'emerald' },
                { id: 'contatos' as const, label: '⊕ CONTATOS', color: 'cyan' },
                { id: 'agenda' as const, label: '⊕ AGENDA', color: 'amber' },
                { id: 'projetos' as const, label: '⊕ PROJETOS', color: 'blue' },
                { id: 'sistema' as const, label: '⊕ SISTEMA', color: 'purple' },
              ]).map(tab => {
                const isActive = dashboardTab === tab.id;
                const colorMap: Record<string, string> = {
                  emerald: isActive ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : '',
                  cyan: isActive ? 'bg-hud-cyan/20 border-hud-cyan/50 text-hud-cyan shadow-[0_0_8px_rgba(var(--theme-rgb),0.2)]' : '',
                  amber: isActive ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : '',
                  blue: isActive ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.2)]' : '',
                  purple: isActive ? 'bg-purple-500/20 border-purple-500/50 text-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.2)]' : '',
                };
                return (
                  <button
                    key={tab.id}
                    onClick={() => setDashboardTab(tab.id)}
                    className={cn(
                      'flex-1 min-w-[80px] py-1.5 text-[9px] font-bold tracking-widest border transition-all whitespace-nowrap',
                      isActive ? colorMap[tab.color] : 'bg-transparent border-hud-cyan/20 text-hud-cyan/40 hover:border-hud-cyan/50'
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Conteúdo principal: grid de colunas ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden">
        
        {/* COLUNA DASHBOARD: Full-width por aba */}
        <div className={cn("flex flex-col gap-3 min-h-0 overflow-y-auto pr-1 custom-scrollbar", centerMode === 'dashboard' ? 'col-span-1 lg:col-span-12' : 'hidden')}>
          <DashboardTabs
            activeTab={dashboardTab}
            clients={clients}
            contacts={contacts}
            appointments={appointments}
            projects={projects}
            memories={memories}
            whatsappStatus={whatsappStatus}
            clientSearch={clientSearch}
            setClientSearch={setClientSearch}
            newClientName={newClientName} setNewClientName={setNewClientName}
            newClientPhone={newClientPhone} setNewClientPhone={setNewClientPhone}
            newClientPlan={newClientPlan} setNewClientPlan={setNewClientPlan}
            newClientTrialHours={newClientTrialHours} setNewClientTrialHours={setNewClientTrialHours}
            isRegisteringClient={isRegisteringClient}
            handleRegisterClient={handleRegisterClient}
            handleRenameClient={handleRenameClient}
            handleDeleteClient={handleDeleteClient}
            handleUpgradeClient={handleUpgradeClient}
            updateClientStatus={updateClientStatus}
            loadClients={loadClients}
            isWhatsAppLoading={isWhatsAppLoading}
            handleStartWhatsApp={handleStartWhatsApp}
            handleStopWhatsApp={handleStopWhatsApp}
            handleResetWhatsApp={async () => {
              if (!confirm('Desconectar o WhatsApp atual e gerar novo QR Code?')) return;
              setIsWhatsAppLoading(true);
              try {
                const result = await resetWhatsApp();
                if (result?.whatsapp) setWhatsAppStatus(result.whatsapp);
                showToast(t.operationComplete);
                setTimeout(async () => { await loadWhatsAppStatus(); setIsWhatsAppLoading(false); }, 3000);
              } catch (e) { console.error(e); setIsWhatsAppLoading(false); }
            }}
            loadWhatsAppStatus={loadWhatsAppStatus}
            t={t}
          />
        </div>

        {/* HUD + CHAT: Full-width quando não está no dashboard */}
        <div className={cn("flex flex-col gap-4 min-h-[50vh] lg:min-h-0", centerMode === 'dashboard' ? 'hidden' : 'col-span-1 lg:col-span-12')}>
          {centerMode === 'hud' && (
            <div className="flex-1 hud-glass hud-chamfer hud-hologram relative flex flex-col min-h-0 p-3">
              <div className="absolute top-0 left-0 right-0 h-1 bg-hud-cyan/50 shadow-[0_0_10px_rgba(var(--theme-rgb),0.5)]" />
              <ArcReactorDashboard />
            </div>
          )}
          {centerMode === 'chat' && (
            <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
              <JarvisChat
                messages={messages} input={input} setInput={setInput}
                handleSend={handleSend} isProcessing={isProcessing}
                isListening={isListening} toggleListening={toggleListening}
                appointments={visibleAppointments} contacts={contacts} userName="SIR"
              />
            </div>
          )}
        </div>

        {/* Footer bar */}
        <div className="col-span-1 lg:col-span-12 flex-shrink-0">
          <div className="hud-glass p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-none border border-hud-cyan/40 bg-hud-cyan/10 flex items-center justify-center">
                <User className="w-4 h-4 text-hud-cyan" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-bold truncate max-w-[80px] uppercase">
                  SIR {MOCK_USER.displayName.split(' ')[0]}
                </span>
                <span className="text-[7px] text-hud-cyan/40 uppercase">
                  {t.security}
                </span>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <select 
                value={currentLang}
                onChange={(e) => {
                  const newLang = e.target.value as LanguageId;
                  setCurrentLang(newLang);
                  saveLanguage(newLang);
                }}
                className="bg-black/80 border border-hud-cyan/30 text-[9px] text-hud-cyan py-1 px-1 outline-none hover:border-hud-cyan cursor-pointer appearance-none text-center"
                title={t.language}
              >
                <option value="pt">PT</option>
                <option value="en">EN</option>
                <option value="es">ES</option>
              </select>
              <button
                onClick={async () => {
                  try {
                    const result = await fetchSystemConfig();
                    setConfigValues(result?.config || {});
                    setShowSettings(true);
                  } catch (e) {
                    console.error(e);
                    setShowSettings(true);
                  }
                }}
                className="p-1 text-hud-cyan/50 hover:text-hud-cyan transition-colors"
                title="Configurações do Sistema"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        </div>{/* fim grid interno */}
      </main>

      {/* PAINEL DE CONFIGURAÇÕES */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="hud-glass border border-hud-cyan/40 w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold tracking-widest">⚙ {t.settings}</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-hud-cyan/60 hover:text-hud-cyan text-lg"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                {Object.entries(configValues).map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <label className="text-[9px] font-bold tracking-widest opacity-70">
                        {key}
                      </label>
                      {CONFIG_TOOLTIPS[key] && (
                        <div className="tooltip-trigger cursor-help">
                          <HelpCircle className="w-3 h-3 text-hud-cyan/50 hover:text-hud-cyan" />
                          <div className="tooltip-content bg-black/90 border border-hud-cyan/50 text-[10px] p-2 max-w-xs absolute z-[110]">
                            {CONFIG_TOOLTIPS[key]}
                          </div>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => setConfigValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="bg-black/60 border border-hud-cyan/30 px-2 py-1 text-xs text-hud-cyan outline-none focus:border-hud-cyan/80"
                    />
                  </div>
                ))}
              </div>

              {/* ALTERAR SENHA */}
              <div className="mt-6 pt-4 border-t border-hud-cyan/20">
                <h3 className="text-[10px] font-bold tracking-widest mb-3 text-hud-cyan/70">🔒 {t.changePassword}</h3>
                <div className="flex gap-2">
                  <input
                    type="password"
                    id="new-password-input"
                    placeholder={t.newPassword}
                    className="flex-1 bg-black/60 border border-hud-cyan/30 px-2 py-1.5 text-xs text-hud-cyan outline-none focus:border-hud-cyan/80 placeholder:text-hud-cyan/20 uppercase tracking-widest"
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById('new-password-input') as HTMLInputElement;
                      const newPass = input?.value?.trim();
                      if (!newPass) {
                        showToast(t.error);
                        return;
                      }
                      if (newPass.length < 4) {
                        showToast(t.error);
                        return;
                      }
                      localStorage.setItem('javis_password', newPass);
                      input.value = '';
                      showToast(t.operationComplete);
                    }}
                    className="border border-hud-cyan/40 px-3 py-1.5 text-[9px] font-bold tracking-widest hover:bg-hud-cyan/10"
                  >
                    {t.change}
                  </button>
                </div>
                <span className="text-[8px] text-hud-cyan/30 mt-1 block">
                  {t.currentPassword}: {localStorage.getItem('javis_password') ? '••••••' : `jarvis ${t.defaultPassword}`}
                </span>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={async () => {
                    try {
                      await saveSystemConfig(configValues);
                      showToast(t.operationComplete);
                      setShowSettings(false);
                    } catch (e) {
                      console.error(e);
                      showToast(t.error);
                    }
                  }}
                  className="flex-1 border border-hud-cyan/40 px-3 py-2 text-[10px] font-bold tracking-widest hover:bg-hud-cyan/10"
                >
                  {t.saveConfig}
                </button>

                <button
                  onClick={() => setShowSettings(false)}
                  className="border border-red-400/40 px-3 py-2 text-[10px] font-bold tracking-widest text-red-300 hover:bg-red-400/10"
                >
                  {t.cancel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-0 right-0 w-32 h-32 border-r-2 border-t-2 border-hud-cyan/20 pointer-events-none" />
      <div className="absolute top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-hud-cyan/20 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-hud-cyan/20 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 border-l-2 border-b-2 border-hud-cyan/20 pointer-events-none" />
      <div className="absolute top-1/2 -left-4 w-8 h-1 bg-hud-cyan/40 rotate-90" />
      <div className="absolute top-1/2 -right-4 w-8 h-1 bg-hud-cyan/40 rotate-90" />
    </div>
  );
}
