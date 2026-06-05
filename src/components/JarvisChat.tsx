import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Send, Lock } from 'lucide-react';
import { cn } from '../lib/utils';

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
type Contact = {
  id: string;
  name: string;
  phone?: string;
};
type JarvisChatProps = {
  messages: Message[];
  input: string;
  setInput: (v: string) => void;
  handleSend: (text?: string) => void;
  isProcessing: boolean;
  isListening: boolean;
  toggleListening: () => void;
  appointments: Appointment[];
  contacts: Contact[];
  userName?: string;
};

const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" };
const orb: React.CSSProperties = { fontFamily: "'Orbitron', sans-serif" };

/* ─── Waveform de análise de voz ─────────────────────────────────────────── */
function VoiceWave({ active }: { active: boolean }) {
  const [heights, setHeights] = useState<number[]>(Array.from({ length: 48 }, () => 3));

  useEffect(() => {
    if (!active) {
      setHeights(Array.from({ length: 48 }, () => 3));
      return;
    }
    const interval = setInterval(() => {
      setHeights(Array.from({ length: 48 }, () => Math.random() * 48 + 4));
    }, 80);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 60, padding: '0 4px' }}>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: h,
            background: active
              ? `rgba(0,229,255,${0.4 + (h / 52) * 0.6})`
              : 'rgba(0,229,255,0.2)',
            borderRadius: 2,
            boxShadow: active && h > 20 ? '0 0 6px #00e5ff' : 'none',
            transition: 'height 0.08s ease, background 0.08s ease',
          }}
        />
      ))}
    </div>
  );
}

/* ─── Capacete com imagem real ────────────────────────────────────────────── */
function IronManHelmet({ isListening }: { isListening: boolean }) {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 240, margin: '0 auto' }}>
      {/* Glow de fundo pulsante */}
      <motion.div
        animate={{ opacity: isListening ? [0.3, 0.7, 0.3] : [0.1, 0.25, 0.1] }}
        transition={{ repeat: Infinity, duration: isListening ? 1.2 : 3, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          inset: '5%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,229,255,0.4) 0%, transparent 70%)',
          filter: 'blur(25px)',
          zIndex: 0,
        }}
      />

      {/* Anéis animados ao redor do capacete */}
      <svg
        viewBox="0 0 240 240"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }}
      >
        {/* Anel externo - rotação lenta */}
        <circle
          cx={120} cy={120} r={115}
          fill="none"
          stroke="rgba(0,229,255,0.15)"
          strokeWidth="1"
          strokeDasharray="8 12"
          style={{ animation: 'arc-spin 25s linear infinite', transformOrigin: '120px 120px' }}
        />
        {/* Anel médio - rotação reversa */}
        <circle
          cx={120} cy={120} r={108}
          fill="none"
          stroke="rgba(0,229,255,0.25)"
          strokeWidth="1.5"
          strokeDasharray="20 8"
          style={{ animation: 'arc-spin 16s linear infinite reverse', transformOrigin: '120px 120px' }}
        />
        {/* Marcadores de posição */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const x1 = 120 + 100 * Math.cos(rad);
          const y1 = 120 + 100 * Math.sin(rad);
          const x2 = 120 + 112 * Math.cos(rad);
          const y2 = 120 + 112 * Math.sin(rad);
          return (
            <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(0,229,255,0.5)" strokeWidth="2" />
          );
        })}
        {/* Anel interno - rotação rápida */}
        <circle
          cx={120} cy={120} r={95}
          fill="none"
          stroke="rgba(0,229,255,0.12)"
          strokeWidth="1"
          strokeDasharray="4 16"
          style={{ animation: 'arc-spin 10s linear infinite', transformOrigin: '120px 120px' }}
        />
      </svg>

      {/* Imagem real do capacete */}
      <div style={{ position: 'relative', zIndex: 2, padding: '8%' }}>
        <motion.img
          src="/ironman_helmet.png"
          alt="J.A.R.V.I.S. Helmet"
          animate={isListening
            ? { filter: ['brightness(1.2) drop-shadow(0 0 20px #00e5ff)', 'brightness(1.6) drop-shadow(0 0 40px #00e5ff)', 'brightness(1.2) drop-shadow(0 0 20px #00e5ff)'] }
            : { filter: ['brightness(1) drop-shadow(0 0 10px rgba(0,229,255,0.5))', 'brightness(1.1) drop-shadow(0 0 18px rgba(0,229,255,0.7))', 'brightness(1) drop-shadow(0 0 10px rgba(0,229,255,0.5))'] }
          }
          transition={{ repeat: Infinity, duration: isListening ? 1.2 : 4, ease: 'easeInOut' }}
          style={{ width: '100%', display: 'block' }}
        />
      </div>
    </div>
  );
}

/* ─── Componente principal ────────────────────────────────────────────────── */
export function JarvisChat({
  messages, input, setInput, handleSend,
  isProcessing, isListening, toggleListening,
  appointments, contacts, userName = 'SIR',
}: JarvisChatProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const panel: React.CSSProperties = {
    background: 'rgba(0,10,20,0.85)',
    border: '1px solid rgba(0,229,255,0.25)',
    borderRadius: 2,
    padding: '10px 12px',
    ...mono,
  };

  return (
    <div style={{
      display: 'flex',
      width: '100%',
      height: '100%',
      gap: 8,
      overflow: 'auto',
      color: '#00e5ff',
      fontSize: 11,
      ...mono,
    }}>

      {/* ── COLUNA ESQUERDA: Capacete + Voz ─────────────────────────────── */}
      <div style={{
        width: 'clamp(160px, 17vw, 220px)',
        minWidth: 'clamp(160px, 17vw, 220px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ ...panel, textAlign: 'center', padding: '8px 12px' }}>
          <div style={{ ...orb, fontSize: 16, fontWeight: 900, letterSpacing: 4, textShadow: '0 0 20px #00e5ff' }}>
            J.A.R.V.I.S.
          </div>
          <div style={{ fontSize: 8, opacity: 0.5, letterSpacing: 2, marginTop: 2 }}>
            JUST A RATHER VERY INTELLIGENT SYSTEM
          </div>
        </div>

        {/* Capacete */}
        <div style={{ ...panel, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, minHeight: 0 }}>
          <IronManHelmet isListening={isListening} />
        </div>

        {/* Voice Analysis */}
        <div style={{ ...panel }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 9, letterSpacing: 2, opacity: 0.7 }}>VOICE ANALYSIS</span>
            <motion.div
              animate={{ opacity: isListening ? [1, 0.3, 1] : 0.3 }}
              transition={{ repeat: Infinity, duration: 1 }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: isListening ? '#00ff88' : '#00e5ff' }}
            />
            <span style={{ fontSize: 8, opacity: 0.5 }}>{isListening ? 'ACTIVE' : 'STANDBY'}</span>
          </div>
          <VoiceWave active={isListening} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            {[['SPEECH RATE', '128 WPM'], ['PITCH', 'NORMAL'], ['TONE', 'CALM']].map(([label, val]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 7, opacity: 0.4, letterSpacing: 1 }}>{label}</div>
                <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* System Info */}
        <div style={{ ...panel }}>
          {[
            ['SYSTEM UPTIME', time.toLocaleTimeString('pt-BR')],
            ['POWER LEVEL', '89%'],
            ['NETWORK', 'ONLINE'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ opacity: 0.4, fontSize: 9 }}>{label}</span>
              <span style={{ color: val === 'ONLINE' ? '#00ff88' : '#00e5ff', fontWeight: 700, fontSize: 9 }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── COLUNA CENTRAL: Chat ─────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        minWidth: 0,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          ...panel,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          padding: '8px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...orb, fontSize: 11, letterSpacing: 3 }}>J.A.R.V.I.S. OS v4.2.1</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88' }}
            />
            <span style={{ fontSize: 9, color: '#00ff88', letterSpacing: 2 }}>ONLINE</span>
          </div>
        </div>

        {/* Mensagens */}
        <div style={{
          ...panel,
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '12px 14px',
          marginBottom: 8,
          minHeight: 0,
        }}>
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
              <div style={{ ...orb, fontSize: 13, letterSpacing: 4 }}>AWAITING COMMAND</div>
              <div style={{ fontSize: 9, marginTop: 6, letterSpacing: 2 }}>SAY "JARVIS" OR TYPE BELOW</div>
            </div>
          )}

          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                gap: 4,
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
              }}>
                <span style={{ fontSize: 9, opacity: 0.5, letterSpacing: 1 }}>
                  {m.role === 'user' ? userName : 'J.A.R.V.I.S.'}
                </span>
                <span style={{ fontSize: 9, opacity: 0.4 }}>{fmt(m.timestamp)}</span>
              </div>
              <div style={{
                maxWidth: '82%',
                padding: '10px 14px',
                background: m.role === 'user'
                  ? 'rgba(0,229,255,0.12)'
                  : 'rgba(0,10,30,0.8)',
                border: `1px solid rgba(0,229,255,${m.role === 'user' ? '0.5' : '0.25'})`,
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                boxShadow: m.role === 'user'
                  ? '0 0 15px rgba(0,229,255,0.1)'
                  : 'none',
                clipPath: m.role === 'user'
                  ? 'polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)'
                  : 'polygon(0% 0%, calc(100% - 8px) 0%, 100% 8px, 100% 100%, 8px 100%, 0% calc(100% - 8px))',
              }}>
                {m.content}
              </div>
            </motion.div>
          ))}

          {isProcessing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: '1px solid rgba(0,229,255,0.2)', width: 'fit-content' }}>
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                  style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e5ff' }}
                />
              ))}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{
          ...panel,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
        }}>
          <div style={{ width: 2, height: 20, background: 'rgba(0,229,255,0.4)', flexShrink: 0 }} />
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#00e5ff',
              fontSize: 12,
              ...mono,
            }}
          />
          <button
            onClick={toggleListening}
            style={{
              background: isListening ? 'rgba(255,50,50,0.2)' : 'rgba(0,229,255,0.1)',
              border: `1px solid ${isListening ? 'rgba(255,50,50,0.5)' : 'rgba(0,229,255,0.3)'}`,
              borderRadius: 2,
              padding: '6px 8px',
              cursor: 'pointer',
              color: isListening ? '#ff3232' : '#00e5ff',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Mic size={14} />
          </button>
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isProcessing}
            style={{
              background: input.trim() ? 'rgba(0,229,255,0.15)' : 'transparent',
              border: '1px solid rgba(0,229,255,0.3)',
              borderRadius: 2,
              padding: '6px 8px',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              color: input.trim() ? '#00e5ff' : 'rgba(0,229,255,0.3)',
              display: 'flex',
              alignItems: 'center',
              opacity: isProcessing ? 0.5 : 1,
            }}
          >
            <Send size={14} />
          </button>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0.3 }}>
          <Lock size={9} />
          <span style={{ fontSize: 8, letterSpacing: 3 }}>ENCRYPTED CHANNEL</span>
          <Lock size={9} />
        </div>
      </div>

      {/* ── COLUNA DIREITA: Painéis funcionais ───────────────────────────── */}
      <div style={{
        width: 'clamp(150px, 16vw, 210px)',
        minWidth: 'clamp(150px, 16vw, 210px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        overflow: 'hidden',
      }}>
        {/* Appointments */}
        <div style={{ ...panel, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ ...orb, fontSize: 9, letterSpacing: 2 }}>APPOINTMENTS</span>
            <span style={{ fontSize: 8, opacity: 0.4, letterSpacing: 1 }}>VIEW CALENDAR</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {appointments.length === 0 && (
              <div style={{ opacity: 0.3, fontSize: 9 }}>No upcoming appointments</div>
            )}
            {appointments.slice(0, 6).map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingBottom: 6, borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
                <motion.div
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ repeat: Infinity, duration: 2, delay: Math.random() }}
                  style={{ width: 5, height: 5, borderRadius: '50%', background: '#00ff88', marginTop: 3, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                  <div style={{ fontSize: 8, opacity: 0.4, marginTop: 1 }}>
                    {a.scheduled_at ? new Date(a.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : a.date ? String(a.date).slice(0, 10) : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contacts */}
        <div style={{ ...panel, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ ...orb, fontSize: 9, letterSpacing: 2 }}>CONTACTS</span>
            <span style={{ fontSize: 8, opacity: 0.4, letterSpacing: 1 }}>DIRECTORY</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {contacts.length === 0 && (
              <div style={{ opacity: 0.3, fontSize: 9 }}>No contacts</div>
            )}
            {contacts.slice(0, 5).map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 5, borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 2,
                  background: 'rgba(0,229,255,0.1)',
                  border: '1px solid rgba(0,229,255,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  {c.phone && <div style={{ fontSize: 8, opacity: 0.4 }}>{c.phone}</div>}
                </div>
                <motion.div
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 3, delay: Math.random() * 2 }}
                  style={{ fontSize: 8, color: '#00ff88', letterSpacing: 1 }}
                >
                  ONLINE
                </motion.div>
              </div>
            ))}
          </div>
        </div>

        {/* System Status mini */}
        <div style={{ ...panel }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ ...orb, fontSize: 9, letterSpacing: 2 }}>SYSTEM STATUS</span>
            <span style={{ fontSize: 8, opacity: 0.4 }}>DIAGNOSTICS</span>
          </div>
          {[
            ['CPU', 23, '#00e5ff'],
            ['MEMORY', 42, '#00e5ff'],
            ['SYSTEM INTEGRITY', 94, '#00ff88'],
            ['THREAT LEVEL', 8, '#00ff88'],
          ].map(([label, val, color]) => (
            <div key={String(label)} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 8, opacity: 0.5 }}>{label}</span>
                <span style={{ fontSize: 8, color: String(color), fontWeight: 700 }}>
                  {label === 'THREAT LEVEL' ? 'LOW' : `${val}%`}
                </span>
              </div>
              <div style={{ height: 3, background: 'rgba(0,229,255,0.1)', borderRadius: 1 }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${val}%` }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                  style={{ height: '100%', background: String(color), borderRadius: 1, boxShadow: `0 0 6px ${color}` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Data Stream */}
        <div style={{ ...panel, fontSize: 8, opacity: 0.6 }}>
          <div style={{ ...orb, fontSize: 8, letterSpacing: 2, marginBottom: 6 }}>DATA STREAM</div>
          {Array.from({ length: 4 }, (_, i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.3 }}
              style={{ marginBottom: 3, letterSpacing: 1 }}
            >
              {`0x${Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0')} ${Math.floor(Math.random() * 0xFF).toString(16).toUpperCase().padStart(2, '0')} ${Math.floor(Math.random() * 0xFF).toString(16).toUpperCase().padStart(2, '0')} ${Math.floor(Math.random() * 0xFF).toString(16).toUpperCase().padStart(2, '0')}`}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
