/**
 * J.A.R.V.I.S. Panel Voice — Web Speech API
 *
 * Usa a Web Speech API nativa do browser para falar no painel.
 * - Gratuita (zero custo de API)
 * - Funciona imediatamente após interação do usuário
 * - No Windows + Edge, usa vozes neurais da Microsoft (pt-BR-AntonioNeural)
 * - Crédito OpenAI reservado exclusivamente para o WhatsApp
 */

let voicesLoaded = false;
let cachedVoices: SpeechSynthesisVoice[] = [];

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      cachedVoices = voices;
      voicesLoaded = true;
      resolve(voices);
      return;
    }

    // Alguns browsers carregam vozes de forma assíncrona
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoices = window.speechSynthesis.getVoices();
      voicesLoaded = true;
      resolve(cachedVoices);
    };

    // Timeout de segurança
    setTimeout(() => {
      cachedVoices = window.speechSynthesis.getVoices();
      resolve(cachedVoices);
    }, 2000);
  });
}

function getBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Prioridade: vozes neurais masculinas em PT-BR / PT
  const priority = [
    (v: SpeechSynthesisVoice) => v.name.includes('Antonio') && v.lang.startsWith('pt'),
    (v: SpeechSynthesisVoice) => v.name.includes('Daniel') && v.lang.startsWith('en'),   // Microsoft Daniel (inglês britânico grave)
    (v: SpeechSynthesisVoice) => v.name.includes('Mark') && v.lang.startsWith('en'),
    (v: SpeechSynthesisVoice) => v.lang === 'pt-BR' && v.name.toLowerCase().includes('male'),
    (v: SpeechSynthesisVoice) => v.lang === 'pt-BR',
    (v: SpeechSynthesisVoice) => v.lang.startsWith('pt'),
  ];

  for (const test of priority) {
    const match = voices.find(test);
    if (match) return match;
  }

  return null;
}

/**
 * Fala um texto usando a Web Speech API do browser.
 * Funciona imediatamente, sem latência de rede, sem custo.
 */
export function speak(text: string): Promise<void> {
  return new Promise(async (resolve) => {
    if (!text?.trim() || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    // Para qualquer fala em andamento
    window.speechSynthesis.cancel();

    // Garante que as vozes estejam carregadas
    const voices = voicesLoaded ? cachedVoices : await loadVoices();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.88;   // Levemente mais lento → mais grave e autoritário
    utterance.pitch = 0.65;  // Mais grave → menos robótico
    utterance.volume = 1.0;

    const voice = getBestVoice(voices);
    if (voice) {
      utterance.voice = voice;
      // Se for inglês/britânico, fala em inglês mesmo (soa mais J.A.R.V.I.S.)
      if (voice.lang.startsWith('en')) {
        utterance.lang = voice.lang;
      }
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Para qualquer fala em andamento.
 */
export function stopSpeaking(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Pré-carrega as vozes assim que possível (chamar no App.tsx)
 */
export function preloadVoices(): void {
  loadVoices().then((voices) => {
    const best = getBestVoice(voices);
    if (best) {
      console.log(`J.A.R.V.I.S. Voice: usando "${best.name}" (${best.lang})`);
    }
  });
}

// ─── Falas específicas do J.A.R.V.I.S. ──────────────────────────────────────

export const jarvisVoice = {
  /** Boot iniciando — chamado depois do clique de login */
  bootStart: () =>
    speak(
      'J.A.R.V.I.S. inicializando. Calibrando módulos de segurança, memória e sistemas de comunicação, Senhor.'
    ),

  /** Boot completo — sistema pronto */
  bootComplete: () =>
    speak(
      'Todos os sistemas operacionais, Senhor. Pronto para receber seus comandos.'
    ),

  /** Senha correta */
  accessGranted: () =>
    speak(
      'Acesso permitido. Bem-vindo de volta, Senhor.'
    ),

  /** Senha errada */
  accessDenied: () =>
    speak(
      'Acesso negado. Credenciais inválidas, Senhor.'
    ),

  /** Saudação contextual por horário */
  greeting: () => {
    const hour = new Date().getHours();
    let msg: string;

    if (hour >= 5 && hour < 12) {
      msg = 'Bom dia, Senhor. Os sistemas estão operacionais.';
    } else if (hour >= 12 && hour < 18) {
      msg = 'Boa tarde, Senhor. Aqui estou, conforme esperado.';
    } else if (hour >= 18 && hour < 22) {
      msg = 'Boa noite, Senhor. Como posso ser útil.';
    } else {
      msg = 'Ainda acordado, Senhor. Uma escolha fascinante, considerando o horário.';
    }

    return speak(msg);
  },
};
