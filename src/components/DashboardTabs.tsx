import { motion } from 'motion/react';
import {
  Calendar, Briefcase, Users, Brain, Shield,
  QrCode, Power, RefreshCw, RotateCcw, Cloud, Search,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { HUDModule } from './HUD';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

// ── Types ───────────────────────────────────────────────────────
type Appointment = { id: string; title: string; description?: string; scheduled_at?: string; date?: string | Date; status?: string };
type Project = { id: string; name: string; description?: string | null; category?: string | null; goal?: string | null; status?: string | null; summary?: any };
type Contact = { id: string; name: string; phone?: string };
type Memory = { id: string; content?: string; fact?: string; category?: string };
type Client = { id: string; name?: string | null; phone_number: string; whatsapp_jid: string; status: string; trial_ends_at?: string | null };
type WhatsAppStatus = { status: 'stopped' | 'starting' | 'qr' | 'connected' | 'disconnected' | 'error'; qr: string | null; phone: string | null; lastError: string | null };

type DashboardTabsProps = {
  activeTab: string;
  // Data
  clients: Client[];
  contacts: Contact[];
  appointments: Appointment[];
  projects: Project[];
  memories: Memory[];
  whatsappStatus: WhatsAppStatus;
  // Client actions
  clientSearch: string;
  setClientSearch: (v: string) => void;
  newClientName: string; setNewClientName: (v: string) => void;
  newClientPhone: string; setNewClientPhone: (v: string) => void;
  newClientPlan: 'active' | 'trial'; setNewClientPlan: (v: 'active' | 'trial') => void;
  newClientTrialHours: string; setNewClientTrialHours: (v: string) => void;
  isRegisteringClient: boolean;
  handleRegisterClient: () => void;
  handleRenameClient: (id: string, name: string | null | undefined) => void;
  handleDeleteClient: (id: string) => void;
  handleUpgradeClient: (id: string, name: string | null | undefined) => void;
  updateClientStatus: (id: string, status: string) => Promise<any>;
  loadClients: () => Promise<void>;
  // WhatsApp actions
  isWhatsAppLoading: boolean;
  handleStartWhatsApp: () => void;
  handleStopWhatsApp: () => void;
  handleResetWhatsApp: () => void;
  loadWhatsAppStatus: () => void;
  // i18n
  t: Record<string, any>;
};

function getTrialCountdown(trialEndsAt?: string | null): string | null {
  if (!trialEndsAt) return null;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  if (diff <= 0) return 'EXPIRADO';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function parseDate(item: Appointment): Date | null {
  const raw = item.scheduled_at || item.date;
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatStatus(s?: string | null) {
  if (!s) return 'ACTIVE';
  const n = s.toLowerCase();
  if (n === 'active') return 'ATIVO';
  if (n === 'pending') return 'PENDENTE';
  if (n === 'paused') return 'PAUSADO';
  if (n === 'done') return 'CONCLUÍDO';
  return s.toUpperCase();
}

// ── Componente ──────────────────────────────────────────────────
export function DashboardTabs(props: DashboardTabsProps) {
  const { activeTab, t } = props;

  // ═══════════════════════════════════════════════════════════════
  // TAB: CLIENTES
  // ═══════════════════════════════════════════════════════════════
  if (activeTab === 'clientes') {
    const filtered = props.clients.filter(c => {
      if (!props.clientSearch) return true;
      const q = props.clientSearch.toLowerCase();
      return (c.name || '').toLowerCase().includes(q) ||
        c.phone_number?.includes(q) ||
        c.whatsapp_jid?.includes(q);
    });

    return (
      <div className="flex flex-col gap-3 h-full min-h-0">
        {/* Formulário de cadastro */}
        <div className="hud-glass border border-hud-cyan/20 p-3 flex-shrink-0">
          <div className="text-[9px] font-bold tracking-widest text-emerald-400 mb-2">⊕ CADASTRAR NOVO CLIENTE</div>
          <div className="flex flex-wrap gap-2">
            <input type="text" placeholder="Nome do Cliente" value={props.newClientName} onChange={e => props.setNewClientName(e.target.value)}
              className="bg-black/40 border border-hud-cyan/30 text-[11px] p-2 text-hud-cyan outline-none flex-1 min-w-[150px]" />
            <input type="text" placeholder="Número (5561999999999)" value={props.newClientPhone} onChange={e => props.setNewClientPhone(e.target.value)}
              className="bg-black/40 border border-hud-cyan/30 text-[11px] p-2 text-hud-cyan outline-none flex-1 min-w-[150px]" />
            <select value={props.newClientPlan} onChange={e => props.setNewClientPlan(e.target.value as any)}
              className="bg-black/40 border border-hud-cyan/30 text-[11px] p-2 text-hud-cyan outline-none cursor-pointer">
              <option value="active">ATIVO</option>
              <option value="trial">TESTE</option>
            </select>
            {props.newClientPlan === 'trial' && (
              <select value={props.newClientTrialHours} onChange={e => props.setNewClientTrialHours(e.target.value)}
                className="bg-black/40 border border-hud-cyan/30 text-[11px] p-2 text-hud-cyan outline-none cursor-pointer">
                <option value="6">6H</option><option value="12">12H</option><option value="24">24H</option>
              </select>
            )}
            <button onClick={props.handleRegisterClient} disabled={props.isRegisteringClient}
              className="text-[11px] px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/40 transition-colors cursor-pointer disabled:opacity-50 font-bold tracking-wider">
              {props.isRegisteringClient ? 'SALVANDO...' : '+ CADASTRAR'}
            </button>
          </div>
        </div>

        {/* Barra de busca + contador */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex-1 flex items-center gap-2 bg-black/40 border border-hud-cyan/30 px-3 py-2">
            <Search className="w-3.5 h-3.5 text-hud-cyan/50" />
            <input type="text" placeholder="Buscar por nome ou número..." value={props.clientSearch} onChange={e => props.setClientSearch(e.target.value)}
              className="bg-transparent text-[11px] text-hud-cyan outline-none flex-1 placeholder:text-hud-cyan/30" />
            {props.clientSearch && (
              <button onClick={() => props.setClientSearch('')} className="text-hud-cyan/40 hover:text-hud-cyan text-xs">✕</button>
            )}
          </div>
          <div className="text-[10px] text-hud-cyan/50 whitespace-nowrap font-mono">
            {filtered.length}/{props.clients.length} clientes
          </div>
        </div>

        {/* Lista de clientes - tabela escalável */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
          {filtered.length === 0 ? (
            <div className="text-center text-hud-cyan/30 italic py-8 text-xs">
              {props.clientSearch ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
            </div>
          ) : (
            <div className="grid gap-2">
              {filtered.map(item => {
                const countdown = getTrialCountdown(item.trial_ends_at);
                const isTrial = !!item.trial_ends_at;
                const isExpired = countdown === 'EXPIRADO';
                return (
                  <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "hud-glass border border-hud-cyan/15 p-3 flex items-center gap-4 hover:border-hud-cyan/40 transition-all group",
                      isExpired && "border-l-2 border-l-red-500/60 bg-red-950/10"
                    )}>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-[12px] text-hud-cyan truncate">{item.name || 'Sem Nome'}</span>
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 border font-bold shrink-0",
                          item.status === 'active' && !isTrial ? 'text-green-400 border-green-400/40 bg-green-400/10' :
                          isTrial ? 'text-amber-400 border-amber-400/40 bg-amber-400/10' :
                          'text-red-400 border-red-400/40 bg-red-400/10'
                        )}>
                          {isTrial ? 'TRIAL' : item.status === 'active' ? 'ATIVO' : item.status.toUpperCase()}
                        </span>
                        {isTrial && countdown && (
                          <span className={cn("text-[9px] font-mono", isExpired ? 'text-red-400' : 'text-amber-400/70')}>
                            ⏱ {countdown}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-hud-cyan/40 font-mono">{item.phone_number || item.whatsapp_jid?.split('@')[0]}</span>
                    </div>
                    {/* Ações */}
                    <div className="flex gap-1.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                      {isTrial && (
                        <button onClick={() => props.handleUpgradeClient(item.id, item.name)}
                          className="text-[9px] px-2 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/40 transition-colors cursor-pointer font-bold">
                          ✦ CONVERTER
                        </button>
                      )}
                      {item.status !== 'suspended' && (
                        <button onClick={() => { props.updateClientStatus(item.id, 'suspended').then(() => props.loadClients()); }}
                          className="text-[9px] px-2 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors cursor-pointer">
                          BLOQUEAR
                        </button>
                      )}
                      {item.status === 'suspended' && (
                        <button onClick={() => { props.updateClientStatus(item.id, 'active').then(() => props.loadClients()); }}
                          className="text-[9px] px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors cursor-pointer">
                          ATIVAR
                        </button>
                      )}
                      <button onClick={() => props.handleRenameClient(item.id, item.name)}
                        className="text-[9px] px-2 py-1 bg-hud-cyan/10 text-hud-cyan border border-hud-cyan/30 hover:bg-hud-cyan/20 transition-colors cursor-pointer">
                        RENOMEAR
                      </button>
                      <button onClick={() => props.handleDeleteClient(item.id)}
                        className="text-[9px] px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors cursor-pointer">
                        EXCLUIR
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB: CONTATOS
  // ═══════════════════════════════════════════════════════════════
  if (activeTab === 'contatos') {
    return (
      <HUDModule title={t.contacts} icon={Users} className="flex-1 min-h-0">
        {props.contacts.length === 0 ? (
          <p className="text-hud-cyan/30 italic">{t.noContacts}</p>
        ) : (
          <div className="grid gap-1">
            {props.contacts.map(item => (
              <div key={item.id} className="flex justify-between items-center p-2.5 border-b border-hud-cyan/10 hover:bg-hud-cyan/5 transition-colors">
                <span className="font-bold text-[12px]">{item.name}</span>
                <span className="opacity-50 text-[11px] font-mono">{item.phone}</span>
              </div>
            ))}
          </div>
        )}
      </HUDModule>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB: AGENDA
  // ═══════════════════════════════════════════════════════════════
  if (activeTab === 'agenda') {
    const visible = props.appointments.filter(a => {
      const s = String(a.status || '').toLowerCase();
      return !['cancelado', 'cancelled', 'done', 'completed'].includes(s);
    });
    return (
      <HUDModule title={t.schedule} icon={Calendar} className="flex-1 min-h-0">
        {visible.length === 0 ? (
          <p className="text-hud-cyan/30 italic">{t.noAppointments}</p>
        ) : (
          <div className="grid gap-2">
            {visible.map(item => {
              const d = parseDate(item);
              return (
                <div key={item.id} className="p-3 border-l-2 border-hud-cyan/60 bg-hud-cyan/5 hover:bg-hud-cyan/10 transition-all">
                  <div className="font-bold text-[12px]">{item.title}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">
                    {d ? format(d, 'dd/MM/yy HH:mm') : 'Sem data'}
                  </div>
                  {item.description && <div className="text-[10px] opacity-40 mt-1">{item.description}</div>}
                </div>
              );
            })}
          </div>
        )}
      </HUDModule>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB: PROJETOS
  // ═══════════════════════════════════════════════════════════════
  if (activeTab === 'projetos') {
    return (
      <HUDModule title={t.projects} icon={Briefcase} className="flex-1 min-h-0">
        {props.projects.length === 0 ? (
          <p className="text-hud-cyan/30 italic">{t.noProjects}</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {props.projects.map(item => {
              const progress = item.summary?.progressPercent ?? 0;
              return (
                <div key={item.id} className="p-3 border border-hud-cyan/20 bg-hud-cyan/5">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-[12px]">{item.name}</span>
                    <span className="text-[9px] px-1.5 border border-hud-cyan/40 font-bold">{formatStatus(item.status)}</span>
                  </div>
                  <div className="text-[10px] opacity-70 italic mb-2">{item.goal || item.description || item.summary?.progressText || ''}</div>
                  {item.summary && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] opacity-60">
                        <span>{item.summary.progressText}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 border border-hud-cyan/20 bg-black/40 overflow-hidden">
                        <div className="h-full bg-hud-cyan/60 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[9px] opacity-60 pt-1">
                        <div><div className="opacity-40">Atual</div><div>{item.summary.currentWeight || '-'}</div></div>
                        <div><div className="opacity-40">Meta</div><div>{item.summary.targetWeight || '-'}</div></div>
                        <div><div className="opacity-40">Altura</div><div>{item.summary.height || '-'}</div></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </HUDModule>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // TAB: SISTEMA
  // ═══════════════════════════════════════════════════════════════
  if (activeTab === 'sistema') {
    return (
      <div className="grid lg:grid-cols-2 gap-3 flex-1 min-h-0">
        {/* WhatsApp */}
        <HUDModule title={t.whatsapp} icon={QrCode}>
          <div className="space-y-3">
            <div className={cn('px-2 py-1 border text-[10px] font-bold tracking-widest w-fit',
              props.whatsappStatus.status === 'connected' ? 'text-green-400 border-green-400/40 bg-green-400/10' :
              props.whatsappStatus.status === 'qr' ? 'text-yellow-300 border-yellow-300/40 bg-yellow-300/10' :
              props.whatsappStatus.status === 'error' ? 'text-red-400 border-red-400/40 bg-red-400/10' :
              'text-hud-cyan border-hud-cyan/40 bg-hud-cyan/10'
            )}>
              {props.whatsappStatus.status === 'connected' ? 'CONECTADO' :
               props.whatsappStatus.status === 'qr' ? 'AGUARDANDO QR' :
               props.whatsappStatus.status === 'starting' ? 'INICIANDO' :
               props.whatsappStatus.status === 'error' ? 'ERRO' :
               props.whatsappStatus.status === 'disconnected' ? 'DESCONECTADO' : 'PARADO'}
            </div>
            {props.whatsappStatus.phone && <div className="text-[10px] opacity-60 break-all">Conectado: {props.whatsappStatus.phone}</div>}
            {props.whatsappStatus.status === 'qr' && props.whatsappStatus.qr && (
              <div className="flex flex-col items-center gap-2 p-3 bg-white">
                <QRCodeCanvas value={props.whatsappStatus.qr} size={170} />
                <p className="text-[10px] text-black text-center font-bold">{t.scanQr}</p>
              </div>
            )}
            {props.whatsappStatus.lastError && <p className="text-[10px] text-red-400">{props.whatsappStatus.lastError}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={props.handleStartWhatsApp} disabled={props.isWhatsAppLoading}
                className="border border-hud-cyan/40 px-2 py-2 text-[9px] hover:bg-hud-cyan/10 disabled:opacity-40 flex flex-col items-center gap-1">
                <Power className="w-3.5 h-3.5" />{t.start}
              </button>
              <button onClick={props.loadWhatsAppStatus} disabled={props.isWhatsAppLoading}
                className="border border-hud-cyan/40 px-2 py-2 text-[9px] hover:bg-hud-cyan/10 disabled:opacity-40 flex flex-col items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" />{t.status}
              </button>
              <button onClick={props.handleStopWhatsApp} disabled={props.isWhatsAppLoading}
                className="border border-red-400/40 px-2 py-2 text-[9px] text-red-300 hover:bg-red-400/10 disabled:opacity-40 flex flex-col items-center gap-1">
                <Power className="w-3.5 h-3.5" />{t.stop}
              </button>
              <button onClick={props.handleResetWhatsApp} disabled={props.isWhatsAppLoading}
                className="border border-yellow-400/40 px-2 py-2 text-[9px] text-yellow-300 hover:bg-yellow-400/10 disabled:opacity-40 flex flex-col items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5" />{t.switchAccount}
              </button>
            </div>
          </div>
        </HUDModule>

        {/* Memórias + Módulos */}
        <div className="flex flex-col gap-3">
          <HUDModule title={t.memoryCore} icon={Brain}>
            {props.memories.length === 0 ? (
              <p className="text-hud-cyan/30 italic">{t.noMemories}</p>
            ) : props.memories.map(item => (
              <div key={item.id} className="p-2 text-[10px] leading-tight border-b border-hud-cyan/10 last:border-b-0">
                • {item.content || item.fact}
              </div>
            ))}
          </HUDModule>
          <HUDModule title="Módulos do Sistema" icon={Cloud}>
            {['GEMINI AI','SUPABASE DB','SOCKET.IO','WHATSAPP BOT','TTS ENGINE'].map(mod => (
              <div key={mod} className="text-[10px] flex justify-between py-1">
                <span className="opacity-60">{mod}</span>
                <span className="text-green-400 font-bold">ONLINE</span>
              </div>
            ))}
          </HUDModule>
        </div>
      </div>
    );
  }

  return null;
}
