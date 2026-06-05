import { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';

/* ─── Tipos e helpers ─────────────────────────────────────────────────────── */
type Metrics = { cpu: number; memory: number; disk: number; network: number; gpu: number };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rnd   = (r: number) => (Math.random() - 0.5) * r;
const mono: React.CSSProperties = { fontFamily: "'Share Tech Mono', monospace" };
const orb:  React.CSSProperties = { fontFamily: "'Orbitron', sans-serif" };

function useMetrics(): Metrics {
  const [m, setM] = useState<Metrics>({ cpu: 23, memory: 42, disk: 31, network: 67, gpu: 58 });
  useEffect(() => {
    const id = setInterval(() => setM(p => ({
      cpu:     clamp(p.cpu     + rnd(6),  5, 95),
      memory:  clamp(p.memory  + rnd(4), 20, 90),
      disk:    clamp(p.disk    + rnd(2), 10, 80),
      network: clamp(p.network + rnd(12), 5, 95),
      gpu:     clamp(p.gpu     + rnd(8), 10, 90),
    })), 2500);
    return () => clearInterval(id);
  }, []);
  return m;
}

/* ─── Barra de métrica horizontal ────────────────────────────────────────── */
function Bar({ label, value, color = '#00e5ff' }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...mono, fontSize: 9 }}>
      <span style={{ width: 88, opacity: 0.65, letterSpacing: '0.06em', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 3, background: 'rgba(0,229,255,0.1)', position: 'relative', overflow: 'hidden' }}>
        <motion.div
          style={{ position: 'absolute', inset: '0 auto 0 0', background: color, boxShadow: `0 0 5px ${color}` }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1.8, ease: 'easeInOut' }}
        />
      </div>
      <span style={{ width: 30, textAlign: 'right', color }}>{Math.round(value)}%</span>
    </div>
  );
}

/* ─── Círculo de métrica (linha inferior) ────────────────────────────────── */
function BigRing({ label, value }: { label: string; value: number }) {
  const r = 38, circ = 2 * Math.PI * r;
  // Tamanho responsivo: 96px no desktop, menor em telas pequenas
  const sz = typeof window !== 'undefined' ? Math.max(56, Math.min(96, window.innerWidth / 14)) : 96;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ position: 'relative', width: sz, height: sz }}>
        <svg width={sz} height={sz} viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(0,229,255,0.08)" strokeWidth={4} />
          <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(0,229,255,0.04)" strokeWidth={8} />
          <motion.circle
            cx={48} cy={48} r={r} fill="none"
            stroke="#00e5ff" strokeWidth={4} strokeLinecap="round"
            strokeDasharray={circ}
            animate={{ strokeDashoffset: circ - (value / 100) * circ }}
            transition={{ duration: 1.8, ease: 'easeInOut' }}
            style={{ filter: 'drop-shadow(0 0 6px #00e5ff)' }}
          />
        </svg>
        <svg width={sz} height={sz} viewBox="0 0 96 96" style={{ position: 'absolute', inset: 0 }}>
          <circle cx={48} cy={48} r={28} fill="none" stroke="rgba(0,229,255,0.15)" strokeWidth={1} strokeDasharray="3 5" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ ...orb, fontSize: Math.max(10, sz * 0.19), fontWeight: 700, color: '#00e5ff', textShadow: '0 0 12px #00e5ff', lineHeight: 1 }}>
            {Math.round(value)}%
          </span>
        </div>
      </div>
      <span style={{ ...mono, fontSize: 9, letterSpacing: '0.2em', opacity: 0.6, textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

/* ─── Data Stream animado ─────────────────────────────────────────────────── */
function DataStream() {
  const packets = Array.from({ length: 8 }, (_, i) => ({
    id: `DATA PACKET ${String(i + 1).padStart(3, '0')}`,
    hex: Array.from({ length: 5 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(' '),
  }));
  const [data, setData] = useState(packets);
  useEffect(() => {
    const id = setInterval(() => {
      setData(prev => prev.map(p => ({
        ...p,
        hex: Array.from({ length: 5 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(' '),
      })));
    }, 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {data.map(p => (
        <div key={p.id} style={{ display: 'flex', gap: 8, ...mono, fontSize: 8 }}>
          <span style={{ color: '#00e5ff', opacity: 0.5, flexShrink: 0 }}>■</span>
          <span style={{ opacity: 0.5, flexShrink: 0 }}>{p.id}</span>
          <span style={{ color: '#00e5ff', opacity: 0.7 }}>{p.hex}</span>
        </div>
      ))}
      <svg viewBox="0 0 260 30" style={{ width: '100%', height: 30, marginTop: 4 }}>
        <polyline
          points="0,15 10,8 20,20 30,5 40,22 50,12 60,18 70,6 80,24 90,10 100,16 110,4 120,20 130,14 140,8 150,22 160,10 170,18 180,6 190,24 200,12 210,16 220,4 230,20 240,14 250,8 260,18"
          fill="none" stroke="#00e5ff" strokeWidth="1.5" opacity="0.6"
          style={{ filter: 'drop-shadow(0 0 3px #00e5ff)' }}
        />
      </svg>
    </div>
  );
}

/* ─── Arc Reactor SVG central ─────────────────────────────────────────────── */
function ArcReactor({ size }: { size: number }) {
  const C = size / 2;
  const rings = [
    { r: C * 0.88, spd: 22, rev: false, dash: '6 10',  op: 0.55, w: 1.5 },
    { r: C * 0.80, spd: 14, rev: true,  dash: '16 7',  op: 0.45, w: 1   },
    { r: C * 0.72, spd: 30, rev: false, dash: '2 12',  op: 0.40, w: 1   },
    { r: C * 0.64, spd: 9,  rev: true,  dash: '24 5',  op: 0.75, w: 2   },
    { r: C * 0.55, spd: 18, rev: false, dash: '7 8',   op: 0.60, w: 1.5 },
    { r: C * 0.46, spd: 25, rev: true,  dash: '3 14',  op: 0.50, w: 1   },
    { r: C * 0.37, spd: 12, rev: false, dash: '18 6',  op: 0.70, w: 2   },
    { r: C * 0.28, spd: 7,  rev: true,  dash: '9 5',   op: 0.85, w: 2   },
    { r: C * 0.19, spd: 40, rev: false, dash: '4 4',   op: 1.00, w: 2   },
  ];

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* Glow radial de fundo */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(0,229,255,0.28) 0%, rgba(0,80,200,0.14) 40%, transparent 68%)`,
        filter: 'blur(30px)',
      }} />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="cg2" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#00e5ff" stopOpacity="1" />
            <stop offset="30%"  stopColor="#0088dd" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#001133" stopOpacity="0" />
          </radialGradient>
          <filter id="glow2">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Anéis de fundo estáticos */}
        {rings.map((rg, i) => (
          <circle key={`bg${i}`} cx={C} cy={C} r={rg.r}
            fill="none" stroke="rgba(0,229,255,0.06)" strokeWidth={rg.w + 2} />
        ))}

        {/* Anéis animados */}
        {rings.map((rg, i) => (
          <circle key={`rg${i}`} cx={C} cy={C} r={rg.r}
            fill="none"
            stroke={`rgba(0,229,255,${rg.op})`}
            strokeWidth={rg.w}
            strokeDasharray={rg.dash}
            filter="url(#glow2)"
            style={{
              animation: `arc-spin ${rg.spd}s linear infinite ${rg.rev ? 'reverse' : ''}`,
              transformOrigin: `${C}px ${C}px`,
            }}
          />
        ))}

        {/* Marcadores radiais a 45° */}
        {[0,45,90,135,180,225,270,315].map((a, i) => {
          const rad = (a * Math.PI) / 180;
          const r1 = C * 0.90, r2 = C * 0.95;
          return <line key={i}
            x1={C + r1 * Math.cos(rad)} y1={C + r1 * Math.sin(rad)}
            x2={C + r2 * Math.cos(rad)} y2={C + r2 * Math.sin(rad)}
            stroke="rgba(0,229,255,0.6)" strokeWidth="2.5"
          />;
        })}

        {/* Pontos nos marcadores */}
        {[22.5,67.5,112.5,157.5,202.5,247.5,292.5,337.5].map((a, i) => {
          const rad = (a * Math.PI) / 180;
          const r1 = C * 0.91;
          return <circle key={i}
            cx={C + r1 * Math.cos(rad)} cy={C + r1 * Math.sin(rad)}
            r={2.5} fill="rgba(0,229,255,0.9)"
            style={{ filter: 'drop-shadow(0 0 4px #00e5ff)' }}
          />;
        })}

        {/* Núcleo */}
        <circle cx={C} cy={C} r={C * 0.14} fill="url(#cg2)" />
        <circle cx={C} cy={C} r={C * 0.11} fill="none" stroke="rgba(0,229,255,0.9)" strokeWidth="2.5" />
        <circle cx={C} cy={C} r={C * 0.07} fill="rgba(0,229,255,0.15)" />
        <circle cx={C} cy={C} r={C * 0.04} fill="rgba(0,229,255,0.8)"
          style={{ filter: 'drop-shadow(0 0 18px #00e5ff)' }} />

        {/* Labels percentual */}
        <text x={C} y={C * 0.09} textAnchor="middle"
          fill="rgba(0,229,255,0.9)" fontSize={Math.max(10, size * 0.025)}
          fontFamily="'Share Tech Mono',monospace" letterSpacing="3">100%</text>
        <text x={C} y={size - C * 0.04} textAnchor="middle"
          fill="rgba(0,229,255,0.9)" fontSize={Math.max(10, size * 0.025)}
          fontFamily="'Share Tech Mono',monospace" letterSpacing="3">98%</text>
      </svg>

      {/* SYSTEM ONLINE badge */}
      <div style={{
        position: 'absolute', top: '7%', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 6,
        border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.06)',
        padding: '3px 12px',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e5ff', boxShadow: '0 0 8px #00e5ff', animation: 'hud-pulse 2s infinite' }} />
        <span style={{ ...mono, fontSize: 9, letterSpacing: '0.2em', color: '#00e5ff' }}>SYSTEM ONLINE</span>
      </div>

      {/* Labels laterais esquerda */}
      <div style={{
        position: 'absolute', left: '4%', top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {['N.E.T.\n4.2.1', 'OPTICAL\nLIDAR', 'SONAR', 'THERMAL', '//04'].map((l, i) => (
          <div key={i} style={{ ...mono, fontSize: 7, opacity: 0.4, lineHeight: 1.4, whiteSpace: 'pre' }}>{l}</div>
        ))}
      </div>

      {/* Labels laterais direita */}
      <div style={{
        position: 'absolute', right: '4%', top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {['AUDIO\nONLINE', 'VISUAL\nONLINE', 'TACTICAL\nONLINE', 'DIAGNOSTIC\nONLINE'].map((l, i) => (
          <div key={i} style={{ ...mono, fontSize: 7, opacity: 0.4, lineHeight: 1.4, whiteSpace: 'pre', textAlign: 'right' }}>{l}</div>
        ))}
      </div>

      {/* Label J.A.R.V.I.S. central */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.span
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 3 }}
          style={{
            ...orb, fontSize: Math.max(12, size * 0.03), fontWeight: 700, letterSpacing: '0.45em',
            color: '#00e5ff',
            textShadow: '0 0 20px #00e5ff, 0 0 50px rgba(0,229,255,0.4)',
          }}
        >
          J.A.R.V.I.S.
        </motion.span>
      </div>
    </div>
  );
}

/* ─── Painel genérico com título ─────────────────────────────────────────── */
function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      border: '1px solid rgba(0,229,255,0.18)',
      background: 'rgba(2,8,25,0.82)',
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 7,
      backdropFilter: 'blur(8px)',
      ...style,
    }}>
      <div style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: '#00e5ff', marginBottom: 2, textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/* ─── Coluna central com Arc Reactor responsivo ───────────────────────────── */
function ArcReactorColumn({ m }: { m: Metrics }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [reactorSize, setReactorSize] = useState(400);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Reserva ~110px para os BigRings na parte inferior
        const available = Math.min(width, height - 110);
        setReactorSize(Math.max(160, Math.floor(available * 0.98)));
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', minWidth: 0, gap: 8, overflow: 'hidden' }}>
      {/* Arc Reactor ocupa todo o espaço disponível */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 0, overflow: 'hidden' }}>
        <ArcReactor size={reactorSize} />
      </div>

      {/* Linha de métricas circulares */}
      <div style={{
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        width: '100%',
        border: '1px solid rgba(0,229,255,0.15)',
        background: 'rgba(2,8,25,0.82)',
        padding: '10px 8px',
        flexShrink: 0,
      }}>
        <BigRing label="CPU"     value={m.cpu} />
        <BigRing label="MEMORY"  value={m.memory} />
        <BigRing label="DISK"    value={m.disk} />
        <BigRing label="NETWORK" value={m.network} />
        <BigRing label="GPU"     value={m.gpu} />
      </div>
    </div>
  );
}

/* ─── Componente principal exportado ─────────────────────────────────────── */
export function ArcReactorDashboard() {
  const m = useMetrics();
  const [logs, setLogs] = useState([
    '14:35:21  SYSTEM BOOT SEQUENCE INITIATED',
    '14:35:24  ALL SYSTEMS NOMINAL',
    '14:35:27  NETWORK CONNECTION ESTABLISHED',
    '14:35:30  SECURITY PROTOCOLS ACTIVE',
    '14:35:33  DATA SYNCHRONIZATION COMPLETE',
    '14:35:36  READY FOR COMMAND',
  ]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const msgs = [
      'MONITORANDO AMBIENTE', 'PROCESSANDO DADOS', 'ANALISANDO PADRÕES',
      'VERIFICANDO INTEGRIDADE', 'ATUALIZANDO MEMÓRIA', 'CALIBRANDO SENSORES',
      'SINCRONIZANDO BANCO', 'OTIMIZANDO PERFORMANCE', 'SCAN COMPLETO',
    ];
    const id = setInterval(() => {
      const t = new Date().toLocaleTimeString('pt-BR');
      setLogs(p => [...p.slice(-9), `${t}  ${msgs[Math.floor(Math.random() * msgs.length)]}`]);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const coreSystems = [
    'POWER SYSTEMS', 'PROPULSION', 'SENSORS',
    'WEAPONS', 'SHIELD SYSTEMS', 'ARMOR SYSTEMS',
  ];

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', gap: 10, minHeight: 0, overflow: 'auto' }}>

      {/* ══ COLUNA ESQUERDA ══ */}
      <div style={{ width: 'clamp(140px, 18vw, 220px)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden' }}>

        <Panel title="J.A.R.V.I.S." style={{ flexShrink: 0 }}>
          <div style={{ ...orb, fontSize: 8, opacity: 0.45, letterSpacing: '0.12em', marginTop: -6 }}>
            JUST A RATHER VERY INTELLIGENT SYSTEM
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', ...mono, fontSize: 9 }}>
            {[['VERSION','1.2.0'],['BUILD','7A.328'],['UI EDITION','64-BIT'],['UPTIME', new Date().toLocaleTimeString('pt-BR')]].map(([k,v]) => (
              [<span key={`k${k}`} style={{ opacity: 0.45 }}>{k}</span>,
               <span key={`v${k}`} style={{ color: k === 'UPTIME' ? '#00e5ff' : undefined }}>{v}</span>]
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            {['SYSTEM','NETWORK','INTERFACE','DATABASE','SECURITY'].map((tab, i) => (
              <span key={tab} style={{ ...mono, fontSize: 7, color: i === 0 ? '#00e5ff' : 'rgba(0,229,255,0.35)', letterSpacing: '0.08em', cursor: 'default', borderBottom: i === 0 ? '1px solid #00e5ff' : 'none', paddingBottom: 1 }}>{tab}</span>
            ))}
          </div>
        </Panel>

        <Panel title="⊙ System Status" style={{ flexShrink: 0 }}>
          <Bar label="CPU USAGE"    value={m.cpu} />
          <Bar label="MEMORY USAGE" value={m.memory} color="#0099ff" />
          <Bar label="DISK I/O"     value={m.disk}    color="#00ccff" />
          <Bar label="NETWORK I/O"  value={m.network} />
          <Bar label="GPU USAGE"    value={m.gpu}     color="#33ccff" />
        </Panel>

        <Panel title="// Core Systems" style={{ flexShrink: 0 }}>
          {coreSystems.map(name => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', ...mono, fontSize: 8, gap: 4 }}>
              <span style={{ flex: 1, opacity: 0.55 }}>{name}</span>
              <div style={{ width: 48, height: 2, background: 'rgba(0,229,255,0.1)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: '100%', background: '#00e5ff', boxShadow: '0 0 4px #00e5ff' }} />
              </div>
              <span style={{ color: '#00e5ff', width: 30, textAlign: 'right' }}>100%</span>
              <span style={{ color: '#4ade80', fontSize: 7, width: 36, textAlign: 'right' }}>ONLINE</span>
            </div>
          ))}
        </Panel>

        <Panel title="⊕ Data Stream" style={{ flex: 1, overflow: 'hidden' }}>
          <DataStream />
        </Panel>
      </div>

      {/* ══ COLUNA CENTRAL: Arc Reactor responsivo ══ */}
      <ArcReactorColumn m={m} />

      {/* ══ COLUNA DIREITA ══ */}
      <div style={{ width: 'clamp(150px, 19vw, 240px)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden' }}>

        <div style={{
          border: '1px solid rgba(0,229,255,0.18)', background: 'rgba(2,8,25,0.82)',
          padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <div style={{ ...orb, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: '#00e5ff' }}>⊕ COMMAND CENTER</div>
            <div style={{ ...mono, fontSize: 8, opacity: 0.4, letterSpacing: '0.12em' }}>DASHBOARD</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['□','⊡','⊙','≡'].map(s => (
              <span key={s} style={{ ...mono, fontSize: 11, opacity: 0.4, cursor: 'default' }}>{s}</span>
            ))}
          </div>
        </div>

        <Panel title="⊕ Threat Analysis" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div>
              <div style={{ ...orb, fontSize: 24, fontWeight: 700, color: '#4ade80', lineHeight: 1, textShadow: '0 0 12px rgba(74,222,128,0.7)' }}>BAIXO</div>
              <div style={{ ...mono, fontSize: 8, opacity: 0.4, marginTop: 2 }}>RISK LEVEL</div>
            </div>
            <svg viewBox="0 0 100 30" style={{ flex: 1, height: 30 }}>
              <polyline points="0,25 10,20 15,22 20,18 25,24 30,15 35,20 40,10 45,18 50,12 55,20 60,8 65,15 70,10 75,18 80,6 85,14 90,10 95,16 100,8"
                fill="none" stroke="#4ade80" strokeWidth="1.5" opacity="0.7" />
            </svg>
          </div>
          <div style={{ ...mono, fontSize: 8, opacity: 0.5, marginTop: 2 }}>ACTIVE THREATS</div>
          {[
            { label: 'INTEGRIDADE', value: 'OK', color: '#4ade80' },
            { label: 'FIREWALL', value: 'ATIVO', color: '#4ade80' },
            { label: 'ACESSO EXT.', value: 'BLOQUEADO', color: '#00e5ff' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: 8 }}>
              <span style={{ opacity: 0.55 }}>■ {item.label}</span>
              <span style={{ color: item.color }}>{item.value}</span>
            </div>
          ))}
        </Panel>

        <Panel title="⊕ Global Network" style={{ flexShrink: 0 }}>
          <svg viewBox="0 0 220 100" style={{ width: '100%', height: 80, opacity: 0.7 }}>
            <rect width={220} height={100} fill="rgba(0,229,255,0.03)" />
            <path d="M20,30 Q40,20 60,35 Q70,45 65,55 Q50,60 35,50 Z" fill="rgba(0,229,255,0.12)" stroke="rgba(0,229,255,0.3)" strokeWidth="0.5" />
            <path d="M75,25 Q95,15 120,20 Q130,30 125,50 Q110,60 90,55 Q75,45 75,25 Z" fill="rgba(0,229,255,0.12)" stroke="rgba(0,229,255,0.3)" strokeWidth="0.5" />
            <path d="M80,60 Q95,55 105,65 Q100,80 85,78 Q75,70 80,60 Z" fill="rgba(0,229,255,0.12)" stroke="rgba(0,229,255,0.3)" strokeWidth="0.5" />
            <path d="M130,20 Q155,15 175,25 Q185,40 180,55 Q165,65 145,60 Q130,50 130,20 Z" fill="rgba(0,229,255,0.12)" stroke="rgba(0,229,255,0.3)" strokeWidth="0.5" />
            <path d="M155,60 Q170,55 180,65 Q175,78 160,76 Q150,68 155,60 Z" fill="rgba(0,229,255,0.12)" stroke="rgba(0,229,255,0.3)" strokeWidth="0.5" />
            <path d="M185,30 Q200,25 210,35 Q208,50 195,48 Q183,42 185,30 Z" fill="rgba(0,229,255,0.12)" stroke="rgba(0,229,255,0.3)" strokeWidth="0.5" />
            {[[45,40],[100,35],[165,38],[195,35],[88,68],[162,68]].map(([x,y],i) => (
              <circle key={i} cx={x} cy={y} r={3} fill="#ff4444" style={{ filter: 'drop-shadow(0 0 4px #ff4444)' }} />
            ))}
            <line x1={45} y1={40} x2={100} y2={35} stroke="rgba(0,229,255,0.3)" strokeWidth="0.5" strokeDasharray="3 3" />
            <line x1={100} y1={35} x2={165} y2={38} stroke="rgba(0,229,255,0.3)" strokeWidth="0.5" strokeDasharray="3 3" />
            <line x1={165} y1={38} x2={195} y2={35} stroke="rgba(0,229,255,0.3)" strokeWidth="0.5" strokeDasharray="3 3" />
          </svg>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', ...mono, fontSize: 8 }}>
            {[['CONNECTIONS','128'],['SECURE NODES','96'],['DATA TRANSFER','2.4 TB/s']].map(([k,v]) => (
              [<span key={`k${k}`} style={{ opacity: 0.5 }}>{k}</span>,
               <span key={`v${k}`} style={{ color: '#00e5ff' }}>{v}</span>]
            ))}
          </div>
        </Panel>

        <Panel title="⊕ Environmental Scan" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ ...orb, fontSize: 22, fontWeight: 700, color: '#00e5ff', textShadow: '0 0 10px #00e5ff', lineHeight: 1 }}>21°C</div>
              <div style={{ ...mono, fontSize: 7, opacity: 0.4, marginTop: 2 }}>TEMPERATURE</div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[['⊞ HUMIDITY','43%'],['⊞ PRESSURE','1013 hPa'],['⊞ WIND SPEED','12 km/h'],['⊞ VISIBILITY','16 km']].map(([l,v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: 8 }}>
                  <span style={{ opacity: 0.5 }}>{l}</span>
                  <span style={{ color: '#00e5ff' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="≡ System Logs" style={{ flex: 1, overflow: 'hidden' }}>
          <div ref={logRef} style={{ ...mono, fontSize: 8, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flex: 1 }}>
            {logs.map((l, i) => (
              <span key={i} style={{ opacity: 0.65, lineHeight: 1.4 }}>{l}</span>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
