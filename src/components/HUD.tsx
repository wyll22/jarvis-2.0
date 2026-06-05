import React from 'react';
import { motion } from 'motion/react';
import { LucideIcon, Activity, Volume2, VolumeX } from 'lucide-react';
import { cn } from '../lib/utils';
import { TechDecor } from './TechDecor';

interface ModuleProps {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

export function HUDModule({ title, icon: Icon, children, className }: ModuleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "hud-glass hud-chamfer hud-hologram holo-border group/module relative flex flex-col",
        className
      )}
    >
      <TechDecor />

      {/* Barra de título */}
      <div className="flex items-center gap-2 p-3 border-b border-hud-cyan/20 bg-hud-cyan/5 relative overflow-hidden">
        {/* Sweep de luz no hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-hud-cyan/8 to-transparent translate-x-[-200%] group-hover/module:translate-x-[200%] transition-transform duration-1000 pointer-events-none" />

        {/* Ícone com reticle */}
        <div className="relative hud-reticle p-1">
          <Icon className="w-4 h-4 text-hud-cyan hud-glow" />
        </div>

        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-hud-cyan/90" style={{ fontFamily: 'var(--font-title)' }}>
          {title}
        </h2>

        {/* Indicadores de status */}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-hud-cyan hud-pulse" />
          <div className="w-1 h-1 rounded-full bg-hud-cyan/40" />
          <div className="w-1 h-1 rounded-full bg-hud-cyan/20" />
        </div>
      </div>

      {/* Linha divisória com gradiente */}
      <div className="hud-divider" />

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-3 text-[10px] space-y-2 relative">
        <div className="absolute inset-0 data-stream pointer-events-none opacity-25" />
        <div className="relative z-10">{children}</div>
      </div>

      {/* Borda inferior luminosa */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-hud-cyan/40 to-transparent" />

      {/* Cantos decorativos */}
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-hud-cyan/60 pointer-events-none" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-hud-cyan/60 pointer-events-none" />
    </motion.div>
  );
}

interface StatusProps {
  voiceEnabled?: boolean;
  onToggleVoice?: () => void;
  isSpeaking?: boolean;
  onCalibrate?: () => void;
}

export function SystemStatus({ voiceEnabled, onToggleVoice, isSpeaking, onCalibrate }: StatusProps) {
  return (
    <div className="flex flex-wrap gap-4 items-center px-4 py-2 border-b border-hud-cyan/15 bg-black/50 backdrop-blur-sm relative">
      {/* Linha superior brilhante */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-hud-cyan/60 to-transparent" />

      {/* Identificação do sistema */}
      <div className="flex items-center gap-2">
        {/* Mini Arc Reactor */}
        <div className="relative w-5 h-5 flex-shrink-0">
          <svg className="absolute inset-0 w-full h-full arc-rotate" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 5" className="text-hud-cyan/60" />
          </svg>
          <svg className="absolute inset-0 w-full h-full arc-rotate-reverse" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="5" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 3" className="text-hud-cyan/80" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-hud-cyan arc-reactor-pulse" />
          </div>
        </div>
        <span className="text-[9px] font-bold tracking-[0.25em] text-hud-cyan/70 hidden sm:inline" style={{ fontFamily: 'var(--font-title)' }}>
          J.A.R.V.I.S.
        </span>
      </div>

      {/* Separador */}
      <div className="w-[1px] h-4 bg-hud-cyan/20 hidden md:block" />

      <StatusItem label="UPTIME" value="99.99%" />
      <StatusItem label="CORE" value="GEMINI 2.5" />
      <StatusItem label="DATABASE" value="ONLINE" />
      <StatusItem label="LOCATION" value="SÃO PAULO" />

      <div className="ml-auto flex items-center gap-2 md:gap-3 flex-wrap justify-end">
        <ClockWidget />

        {/* Indicador de fala ativa */}
        {isSpeaking && (
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-bold text-hud-cyan animate-pulse hidden sm:inline tracking-widest">
              VOZ ATIVA
            </span>
            <div className="relative w-6 h-6 flex items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.6, 1], opacity: [0.8, 0, 0.8] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border border-hud-cyan/50"
              />
              <svg className="absolute inset-0 w-full h-full arc-rotate" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" className="text-hud-cyan/80" />
              </svg>
              <motion.div
                animate={{ scale: [0.8, 1.2, 0.8] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
                className="w-2 h-2 rounded-full bg-hud-cyan hud-glow-strong"
              />
            </div>
          </div>
        )}

        {/* Botão calibrar */}
        <button
          onClick={onCalibrate}
          className="hidden sm:block hud-btn text-[8px] py-1 px-2"
        >
          CALIBRAR
        </button>

        {/* Toggle de voz */}
        <button
          onClick={onToggleVoice}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 border transition-all text-[9px] font-bold tracking-widest hud-chamfer-sm",
            voiceEnabled
              ? "border-hud-cyan bg-hud-cyan/15 text-hud-cyan"
              : "border-hud-cyan/30 text-hud-cyan/40 hover:border-hud-cyan/60"
          )}
        >
          {voiceEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          <span className="hidden sm:inline">{voiceEnabled ? 'VOICE: ON' : 'VOICE: OFF'}</span>
        </button>

        {/* Status do sistema */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Activity className="w-4 h-4 text-hud-cyan" />
            <div className="absolute inset-0 animate-ping opacity-30">
              <Activity className="w-4 h-4 text-hud-cyan" />
            </div>
          </div>
          <span className="text-[9px] font-bold hidden sm:inline tracking-widest status-online">ONLINE</span>
        </div>
      </div>

      {/* Linha inferior */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-hud-cyan/20 to-transparent" />
    </div>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden md:flex flex-col">
      <span className="text-[7px] text-hud-cyan/45 tracking-[0.15em] uppercase">{label}</span>
      <span className="text-[10px] font-mono font-bold hud-glow">{value}</span>
    </div>
  );
}

function ClockWidget() {
  const [time, setTime] = React.useState(new Date());

  React.useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-end mr-2">
      <span className="text-sm font-mono font-bold tracking-widest text-hud-cyan hud-glow-strong">
        {time.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false })}
      </span>
      <span className="text-[7px] text-hud-cyan/55 tracking-[0.12em] uppercase">
        {time.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · BRT
      </span>
    </div>
  );
}
