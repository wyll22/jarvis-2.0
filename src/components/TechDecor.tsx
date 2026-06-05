import React, { useState, useEffect } from 'react';

// Gera uma string hexadecimal aleatória
function randHex(len: number) {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('');
}

export function TechDecor() {
  const [data1, setData1] = useState(Math.random().toFixed(4));
  const [data2, setData2] = useState(Math.floor(Math.random() * 9999));
  const [hexAddr, setHexAddr] = useState(`0x${randHex(4)}`);
  const [bars, setBars] = useState([20, 50, 80, 30, 90, 45, 70]);
  const [signalBars, setSignalBars] = useState([60, 80, 100, 75, 90]);

  useEffect(() => {
    const interval = setInterval(() => {
      setData1(Math.random().toFixed(4));
      setData2(Math.floor(Math.random() * 9999));
      setHexAddr(`0x${randHex(4)}`);
      setBars(prev => prev.map(() => Math.floor(20 + Math.random() * 80)));
      setSignalBars(prev => prev.map(() => Math.floor(30 + Math.random() * 70)));
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-between items-end pointer-events-none p-1.5 opacity-15 group-hover/module:opacity-35 transition-opacity duration-500 z-0 overflow-hidden">
      {/* Dados de telemetria superiores */}
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-[6px] font-mono tracking-tighter text-hud-cyan">SEC: {data1}</span>
        <span className="text-[6px] font-mono tracking-tighter text-hud-cyan">IDX: {data2}</span>
        <span className="text-[6px] font-mono tracking-tighter text-hud-cyan/70">MEM: {hexAddr}</span>
      </div>

      {/* Barras de sinal no meio */}
      <div className="flex gap-0.5 items-end h-4">
        {signalBars.map((height, i) => (
          <div
            key={`sig-${i}`}
            className="w-0.5 bg-hud-cyan/60 transition-all duration-700 ease-in-out"
            style={{ height: `${Math.max(15, height)}%` }}
          />
        ))}
      </div>

      {/* Barras de dados inferiores */}
      <div className="flex gap-0.5 items-end h-6">
        {bars.map((height, i) => (
          <div
            key={`bar-${i}`}
            className="w-1 bg-hud-cyan transition-all duration-1000 ease-in-out"
            style={{ height: `${Math.max(10, height)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
