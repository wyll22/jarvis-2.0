// =============================================
// SISTEMA DE TEMAS DO J.A.R.V.I.S.
// =============================================

export type ThemeId = 'jarvis';
export type LanguageId = 'pt' | 'en' | 'es';

export interface Theme {
  id: ThemeId;
  name: string;
  primary: string;       // Cor principal em hex
  primaryRgb: string;    // RGB para rgba()
  bgClass: string;       // Classe de fundo
  glowColor: string;     // Cor do glow CSS
  accent: string;        // Cor de destaque
}

export const THEMES: Record<ThemeId, Theme> = {
  jarvis: {
    id: 'jarvis',
    name: 'J.A.R.V.I.S.',
    primary: '#22d3ee',
    primaryRgb: '34,211,238',
    bgClass: 'bg-black',
    glowColor: 'rgba(34,211,238,0.5)',
    accent: '#06b6d4',
  },
};

// =============================================
// SISTEMA DE IDIOMAS
// =============================================

export interface Translations {
  // Status bar
  uptime: string;
  core: string;
  database: string;
  location: string;
  online: string;
  calibrate: string;
  voiceOn: string;
  voiceOff: string;
  systemActive: string;
  voiceTransmission: string;

  // Chat
  commandCenter: string;
  awaitingCommand: string;
  sayOrType: string;
  typeCommand: string;
  processing: string;

  // Modules
  schedule: string;
  contacts: string;
  localWeather: string;
  projects: string;
  memoryCore: string;
  whatsapp: string;

  // WhatsApp buttons
  start: string;
  status: string;
  stop: string;
  switchAccount: string;
  connected: string;
  waitingQr: string;
  starting: string;
  disconnected: string;
  error: string;
  stopped: string;
  scanQr: string;
  clickStart: string;

  // Settings
  settings: string;
  changePassword: string;
  newPassword: string;
  change: string;
  currentPassword: string;
  defaultPassword: string;
  saveConfig: string;
  cancel: string;
  resetSystem: string;
  resetConfirm: string;

  // User
  security: string;

  // Theme & Language
  theme: string;
  language: string;

  // Misc
  noAppointments: string;
  noContacts: string;
  noProjects: string;
  noMemories: string;
  operationComplete: string;
}

export const LANGUAGES: Record<LanguageId, Translations> = {
  pt: {
    uptime: 'UPTIME',
    core: 'MOTOR',
    database: 'BANCO',
    location: 'LOCAL',
    online: 'ONLINE',
    calibrate: 'CALIBRAR',
    voiceOn: 'VOZ: ON',
    voiceOff: 'VOZ: OFF',
    systemActive: 'SISTEMA ATIVO',
    voiceTransmission: 'TRANSMISSÃO DE VOZ ATIVA',
    commandCenter: 'CENTRO DE COMANDO OPERACIONAL',
    awaitingCommand: 'AGUARDANDO COMANDO DO SENHOR',
    sayOrType: 'DIGA "JARVIS" OU DIGITE ABAIXO',
    typeCommand: 'DIGITE SEU COMANDO OU USE O MIC...',
    processing: 'PROCESSANDO...',
    schedule: 'Agenda Técnica',
    contacts: 'Base de Contatos',
    localWeather: 'Clima Local',
    projects: 'Diretório de Projetos',
    memoryCore: 'Núcleo de Memória',
    whatsapp: 'WhatsApp',
    start: 'INICIAR',
    status: 'STATUS',
    stop: 'PARAR',
    switchAccount: 'TROCAR CONTA',
    connected: 'CONECTADO',
    waitingQr: 'AGUARDANDO QR',
    starting: 'INICIANDO',
    disconnected: 'DESCONECTADO',
    error: 'ERRO',
    stopped: 'PARADO',
    scanQr: 'Escaneie no WhatsApp > Dispositivos conectados',
    clickStart: 'Clique em iniciar para gerar o QR Code de conexão.',
    settings: 'CONFIGURAÇÕES DO SISTEMA',
    changePassword: 'ALTERAR SENHA DO PAINEL',
    newPassword: 'NOVA SENHA',
    change: 'ALTERAR',
    currentPassword: 'Senha atual',
    defaultPassword: '(padrão)',
    saveConfig: 'SALVAR CONFIGURAÇÕES',
    cancel: 'CANCELAR',
    resetSystem: 'RESET TOTAL',
    resetConfirm: '⚠️ RESET TOTAL: Isso apagará TODOS os dados pessoais (memórias, contatos, agenda, finanças, chat). O sistema continuará funcionando. Confirma?',
    security: 'SEGURANÇA NÍVEL 4',
    theme: 'TEMA',
    language: 'IDIOMA',
    noAppointments: 'Nenhum compromisso futuro.',
    noContacts: 'Pasta de contatos vazia.',
    noProjects: 'Nenhum projeto registrado.',
    noMemories: 'Dados de memória não inicializados.',
    operationComplete: 'OPERAÇÃO CONCLUÍDA',
  },
  en: {
    uptime: 'UPTIME',
    core: 'CORE',
    database: 'DATABASE',
    location: 'LOCATION',
    online: 'ONLINE',
    calibrate: 'CALIBRATE',
    voiceOn: 'VOICE: ON',
    voiceOff: 'VOICE: OFF',
    systemActive: 'SYSTEM ACTIVE',
    voiceTransmission: 'VOICE TRANSMISSION ACTIVE',
    commandCenter: 'OPERATIONAL COMMAND CENTER',
    awaitingCommand: 'AWAITING YOUR COMMAND, SIR',
    sayOrType: 'SAY "JARVIS" OR TYPE BELOW',
    typeCommand: 'TYPE YOUR COMMAND OR USE MIC...',
    processing: 'PROCESSING...',
    schedule: 'Technical Schedule',
    contacts: 'Contact Database',
    localWeather: 'Local Weather',
    projects: 'Project Directory',
    memoryCore: 'Memory Core',
    whatsapp: 'WhatsApp',
    start: 'START',
    status: 'STATUS',
    stop: 'STOP',
    switchAccount: 'SWITCH ACCOUNT',
    connected: 'CONNECTED',
    waitingQr: 'WAITING QR',
    starting: 'STARTING',
    disconnected: 'DISCONNECTED',
    error: 'ERROR',
    stopped: 'STOPPED',
    scanQr: 'Scan on WhatsApp > Linked devices',
    clickStart: 'Click start to generate the QR code.',
    settings: 'SYSTEM SETTINGS',
    changePassword: 'CHANGE PANEL PASSWORD',
    newPassword: 'NEW PASSWORD',
    change: 'CHANGE',
    currentPassword: 'Current password',
    defaultPassword: '(default)',
    saveConfig: 'SAVE SETTINGS',
    cancel: 'CANCEL',
    resetSystem: 'FULL RESET',
    resetConfirm: '⚠️ FULL RESET: This will delete ALL personal data (memories, contacts, schedule, finances, chat). The system will keep working. Confirm?',
    security: 'SECURITY LEVEL 4',
    theme: 'THEME',
    language: 'LANGUAGE',
    noAppointments: 'No upcoming appointments.',
    noContacts: 'Contact folder empty.',
    noProjects: 'No registered projects.',
    noMemories: 'Memory data not initialized.',
    operationComplete: 'OPERATION COMPLETE',
  },
  es: {
    uptime: 'UPTIME',
    core: 'MOTOR',
    database: 'BASE',
    location: 'UBICACIÓN',
    online: 'EN LÍNEA',
    calibrate: 'CALIBRAR',
    voiceOn: 'VOZ: ON',
    voiceOff: 'VOZ: OFF',
    systemActive: 'SISTEMA ACTIVO',
    voiceTransmission: 'TRANSMISIÓN DE VOZ ACTIVA',
    commandCenter: 'CENTRO DE COMANDO OPERACIONAL',
    awaitingCommand: 'ESPERANDO SU COMANDO, SEÑOR',
    sayOrType: 'DIGA "JARVIS" O ESCRIBA ABAJO',
    typeCommand: 'ESCRIBA SU COMANDO O USE EL MIC...',
    processing: 'PROCESANDO...',
    schedule: 'Agenda Técnica',
    contacts: 'Base de Contactos',
    localWeather: 'Clima Local',
    projects: 'Directorio de Proyectos',
    memoryCore: 'Núcleo de Memoria',
    whatsapp: 'WhatsApp',
    start: 'INICIAR',
    status: 'ESTADO',
    stop: 'PARAR',
    switchAccount: 'CAMBIAR CUENTA',
    connected: 'CONECTADO',
    waitingQr: 'ESPERANDO QR',
    starting: 'INICIANDO',
    disconnected: 'DESCONECTADO',
    error: 'ERROR',
    stopped: 'DETENIDO',
    scanQr: 'Escanee en WhatsApp > Dispositivos vinculados',
    clickStart: 'Haga clic en iniciar para generar el código QR.',
    settings: 'CONFIGURACIONES DEL SISTEMA',
    changePassword: 'CAMBIAR CONTRASEÑA DEL PANEL',
    newPassword: 'NUEVA CONTRASEÑA',
    change: 'CAMBIAR',
    currentPassword: 'Contraseña actual',
    defaultPassword: '(predeterminada)',
    saveConfig: 'GUARDAR CONFIGURACIONES',
    cancel: 'CANCELAR',
    resetSystem: 'RESETEO TOTAL',
    resetConfirm: '⚠️ RESETEO TOTAL: Esto borrará TODOS los datos personales (memorias, contactos, agenda, finanzas, chat). El sistema seguirá funcionando. ¿Confirma?',
    security: 'SEGURIDAD NIVEL 4',
    theme: 'TEMA',
    language: 'IDIOMA',
    noAppointments: 'Sin citas programadas.',
    noContacts: 'Carpeta de contactos vacía.',
    noProjects: 'Sin proyectos registrados.',
    noMemories: 'Datos de memoria no inicializados.',
    operationComplete: 'OPERACIÓN COMPLETADA',
  },
};

// Tooltips de configuração
export const CONFIG_TOOLTIPS: Record<string, string> = {
  // Supabase
  SUPABASE_URL: 'URL do seu projeto Supabase. Encontre em: Supabase Dashboard > Settings > API > Project URL',
  SUPABASE_ANON_KEY: 'Chave anônima do Supabase. Encontre em: Supabase Dashboard > Settings > API > Project API Keys > anon/public',
  SUPABASE_SERVICE_ROLE_KEY: 'Chave de serviço do Supabase. Usada para operações administrativas. Encontre em: Supabase Dashboard > Settings > API > service_role',
  
  // IA
  GEMINI_API_KEY: 'Chave da API do Google Gemini. Obtenha em: ai.google.dev > Get API Key',
  OPENROUTER_API_KEY: 'Chave da API do OpenRouter (provedor secundário). Obtenha em: openrouter.ai > Keys',
  GROQ_API_KEY: 'Chave da API do Groq (provedor terciário). Obtenha em: console.groq.com > API Keys',
  AI_PROVIDER_ORDER: 'Ordem de prioridade dos provedores de IA. Exemplo: gemini,openrouter,groq',
  
  // WhatsApp
  JAVIS_ALLOWED_JID: 'JID (identificador) do número de WhatsApp autorizado a usar o JARVIS. Aparece no log ao receber a primeira mensagem.',
  WHATSAPP_AUTO_START: 'Se "true", o WhatsApp conecta automaticamente ao iniciar o servidor.',
  WHATSAPP_AUDIO_ENABLED: 'Se "true", o JARVIS pode enviar áudios no WhatsApp quando julgar apropriado.',
  WHATSAPP_INCOMING_AUDIO_ENABLED: 'Se "true", o JARVIS consegue entender áudios que você envia.',
  
  // Servidor
  PORT: 'Porta do servidor backend. Padrão: 3001',
};

// Helper para obter o tema e idioma salvos
export function getSavedTheme(): ThemeId {
  return 'jarvis';
}

export function getSavedLanguage(): LanguageId {
  return (localStorage.getItem('javis_language') as LanguageId) || 'pt';
}

export function saveTheme(id: ThemeId) {
  localStorage.setItem('javis_theme', id);
}

export function saveLanguage(id: LanguageId) {
  localStorage.setItem('javis_language', id);
}
