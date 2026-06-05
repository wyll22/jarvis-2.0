import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { jarvisVoice, preloadVoices } from '../services/jarvisVoice';

const BOOT_LINES = [
  { text: "STARK INDUSTRIES — J.A.R.V.I.S. CORE v1.3.3", delay: 200 },
  { text: "Inicializando módulos de segurança...", delay: 400 },
  { text: "Verificando integridade do sistema... [OK]", delay: 600 },
  { text: "Conectando ao banco de dados Supabase... [ONLINE]", delay: 900 },
  { text: "Carregando memórias persistentes... [128 REGISTROS]", delay: 1100 },
  { text: "Motor de IA: GEMINI 2.5 FLASH — STATUS: ATIVO", delay: 1400 },
  { text: "Motor Secundário: OPENROUTER — STATUS: STANDBY", delay: 1600 },
  { text: "Motor de Voz: OPENAI ONYX — STATUS: CALIBRADO", delay: 1800 },
  { text: "WhatsApp Bridge... [VERIFICANDO]", delay: 2000 },
  { text: "Sistema de agenda e alertas... [ATIVO]", delay: 2200 },
  { text: "Controlador financeiro... [ATIVO]", delay: 2400 },
  { text: "Sensor crepuscular automático... [MODO NOTURNO]", delay: 2600 },
  { text: "══════════════════════════════════════════", delay: 2800 },
  { text: "TODOS OS SISTEMAS OPERACIONAIS.", delay: 3000 },
  { text: "Pronto para receber seus comandos, Senhor.", delay: 3200 },
];

// Arco SVG estilo Iron Man
function ArcReactor({ size = 200 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Arco externo girando */}
      <svg className="absolute inset-0 arc-rotate" viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="95" stroke="rgba(var(--theme-rgb),0.15)" strokeWidth="1" />
        <path
          d="M 100 5 A 95 95 0 0 1 195 100"
          stroke="rgba(var(--theme-rgb),0.6)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M 100 195 A 95 95 0 0 1 5 100"
          stroke="rgba(var(--theme-rgb),0.4)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      {/* Arco médio girando ao contrário */}
      <svg className="absolute inset-0 arc-rotate-reverse" viewBox="0 0 200 200" fill="none" style={{ padding: 15 }}>
        <circle cx="100" cy="100" r="80" stroke="rgba(var(--theme-rgb),0.1)" strokeWidth="1" />
        <path
          d="M 100 20 A 80 80 0 0 1 180 100"
          stroke="rgba(var(--theme-rgb),0.5)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="8 4"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 100 20"
          stroke="rgba(var(--theme-rgb),0.3)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="4 8"
        />
      </svg>

      {/* Arco interno lento */}
      <svg className="absolute inset-0 arc-rotate-slow" viewBox="0 0 200 200" fill="none" style={{ padding: 30 }}>
        <circle cx="100" cy="100" r="65" stroke="rgba(var(--theme-rgb),0.08)" strokeWidth="1" />
        <path
          d="M 100 35 A 65 65 0 0 1 165 100"
          stroke="rgba(var(--theme-rgb),0.4)"
          strokeWidth="1"
          strokeLinecap="round"
        />
        {/* Tick marks */}
        {Array.from({ length: 36 }).map((_, i) => {
          const angle = (i * 10 * Math.PI) / 180;
          const x1 = 100 + 60 * Math.cos(angle);
          const y1 = 100 + 60 * Math.sin(angle);
          const x2 = 100 + 65 * Math.cos(angle);
          const y2 = 100 + 65 * Math.sin(angle);
          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={i % 3 === 0 ? "rgba(var(--theme-rgb),0.4)" : "rgba(var(--theme-rgb),0.15)"}
              strokeWidth={i % 3 === 0 ? 1.5 : 0.5}
            />
          );
        })}
      </svg>

      {/* Centro: logo JAVIS */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full border border-hud-cyan/30 arc-reactor-glow flex items-center justify-center bg-black/60">
          <span className="text-hud-cyan font-bold text-[10px] tracking-[0.15em]">J.A.R.V.I.S.</span>
        </div>
      </div>
    </div>
  );
}

// Partículas flutuantes
function Particles({ count = 20 }: { count?: number }) {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="particle"
          style={{
            left: `${Math.random() * 100}%`,
            bottom: `-${Math.random() * 20}px`,
            animationDuration: `${6 + Math.random() * 8}s`,
            animationDelay: `${Math.random() * 5}s`,
            width: `${1 + Math.random() * 2}px`,
            height: `${1 + Math.random() * 2}px`,
            opacity: 0.3 + Math.random() * 0.4,
          }}
        />
      ))}
    </div>
  );
}

interface LoginScreenProps {
  onAuthenticated: () => void;
}

import { loginBackend } from '../services/api';

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Pré-carrega as vozes assim que a tela aparece
    preloadVoices();
  }, []);

  const handleLogin = async () => {
    if (!password.trim()) return;

    setIsAuthenticating(true);
    setError('');

    try {
      // Faz o login no backend
      const result = await loginBackend(password);
      
      if (result.ok && result.token) {
        // Salva a senha e o token no localStorage
        localStorage.setItem('javis_password', password);
        localStorage.setItem('javis_session_token', result.token);
        
        // Acesso concedido — fala e depois vai para o boot
        jarvisVoice.accessGranted().finally(() => onAuthenticated());
      }
    } catch (err) {
      // Acesso negado — fala imediatamente
      jarvisVoice.accessDenied();
      setError('ACESSO NEGADO — CREDENCIAIS INVÁLIDAS');
      setIsAuthenticating(false);
      setPassword('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-[200] hex-pattern">
      <Particles count={30} />
      
      {/* Scanline */}
      <div className="hud-scanline" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="flex flex-col items-center gap-8 relative z-10"
      >
        {/* Arc Reactor girando */}
        <ArcReactor size={220} />

        {/* Campo de senha */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col items-center gap-4 w-72"
        >
          <span className="text-[10px] tracking-[0.4em] text-hud-cyan/50 font-bold">
            AUTENTICAÇÃO NECESSÁRIA
          </span>

          <div className="w-full relative">
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
              placeholder="DIGITE A SENHA DE ACESSO"
              className="w-full bg-black/80 border border-hud-cyan/30 px-4 py-3 text-sm text-center text-hud-cyan placeholder:text-hud-cyan/20 outline-none input-glow tracking-widest uppercase font-mono hud-chamfer-sm"
              style={{ fontFamily: 'var(--font-title)' }}
              disabled={isAuthenticating}
            />
            {isAuthenticating && (
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.5 }}
                className="absolute bottom-0 left-0 h-[2px] bg-hud-cyan"
              />
            )}
          </div>

          <AnimatePresence>
            {error && (
              <motion.span 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-red-400 text-[10px] tracking-widest font-bold"
              >
                {error}
              </motion.span>
            )}
          </AnimatePresence>

          <button
            onClick={handleLogin}
            disabled={isAuthenticating || !password.trim()}
            className="w-full hud-btn py-2.5 text-[10px] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isAuthenticating ? 'VERIFICANDO IDENTIDADE...' : 'ACESSAR SISTEMA'}
          </button>

          <span className="text-[8px] text-hud-cyan/20 tracking-widest mt-4">
            STARK INDUSTRIES — SEGURANÇA NÍVEL 4
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}

interface BootSequenceProps {
  onComplete: () => void;
}

export function BootSequence({ onComplete }: BootSequenceProps) {
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [showFinal, setShowFinal] = useState(false);

  useEffect(() => {
    // Boot sequence inicia — já temos user gesture (veio do clique de login)
    jarvisVoice.bootStart();

    BOOT_LINES.forEach((line, index) => {
      setTimeout(() => {
        setVisibleLines(index + 1);
      }, line.delay);
    });

    const lastDelay = BOOT_LINES[BOOT_LINES.length - 1].delay;
    setTimeout(() => setShowFinal(true), lastDelay + 500);
    setTimeout(() => {
      jarvisVoice.bootComplete().finally(() => onComplete());
    }, lastDelay + 1500);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-black z-[200] flex items-center justify-center hex-pattern overflow-hidden">
      <Particles count={15} />
      <div className="hud-scanline" />
      
      <div className="flex flex-col lg:flex-row items-center gap-12 p-8 max-w-5xl w-full">
        {/* Arc Reactor lado esquerdo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1 }}
          className="shrink-0"
        >
          <ArcReactor size={180} />
        </motion.div>

        {/* Terminal de boot lado direito */}
        <div className="flex-1 max-h-[70vh] overflow-y-auto pr-2">
          <div className="border border-hud-cyan/20 bg-black/60 p-4 hud-chamfer hud-hologram">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-hud-cyan/10">
              <div className="w-2 h-2 rounded-full bg-hud-cyan hud-pulse" />
              <span className="text-[9px] tracking-[0.3em] text-hud-cyan/60 font-bold">
                BOOT SEQUENCE — J.A.R.V.I.S. SYSTEM INITIALIZATION
              </span>
            </div>

            <div className="space-y-1 font-mono">
              {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-[11px] leading-relaxed"
                >
                  <span className="text-hud-cyan/40 mr-2">[{String(i + 1).padStart(2, '0')}]</span>
                  <span className={
                    line.text.includes('[OK]') || line.text.includes('[ATIVO]') || line.text.includes('[ONLINE]') || line.text.includes('[CALIBRADO]')
                      ? 'text-green-400'
                      : line.text.includes('═') || line.text.includes('TODOS OS SISTEMAS')
                        ? 'text-hud-cyan font-bold'
                        : line.text.includes('Senhor')
                          ? 'text-hud-cyan/90'
                          : 'text-hud-cyan/60'
                  }>
                    {line.text}
                  </span>
                </motion.div>
              ))}
              
              {visibleLines < BOOT_LINES.length && (
                <span className="text-hud-cyan/60 typing-cursor text-[11px]" />
              )}
            </div>
          </div>

          <AnimatePresence>
            {showFinal && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 text-center"
              >
                <span className="text-[10px] tracking-[0.5em] text-hud-cyan hud-glow-strong font-bold">
                  SISTEMA CARREGADO COM SUCESSO
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// Exporta partículas e arcos para uso no dashboard
export { Particles, ArcReactor };
