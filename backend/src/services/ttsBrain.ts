import { EdgeTTS } from "node-edge-tts";
import OpenAI from "openai";
import { join } from "path";
import { tmpdir } from "os";
import fs from "fs/promises";

// ─── Motor 1: OpenAI TTS (voz premium — onyx) ─────────────────────────────
// Custo: ~$15/milhão de chars (~R$0,50/mês para uso pessoal moderado)
// Qualidade: cinematográfica, sem pausas artificiais, autoritária

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

async function generateWithOpenAI(text: string): Promise<string> {
  const client = getOpenAIClient();

  if (!client) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  const outputPath = join(tmpdir(), `javis_openai_${Date.now()}.mp3`);

  const response = await client.audio.speech.create({
    model: "tts-1",       // tts-1 = $15/M chars | tts-1-hd = $30/M chars (mais rico)
    voice: "onyx",        // onyx = voz grave, autoritária, cinematográfica — perfeita para J.A.R.V.I.S.
    input: text,
    response_format: "mp3",
    speed: 1.0,           // 1.0 = natural | 0.9 = levemente mais lento | 1.1 = mais ágil
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);

  return outputPath;
}

// ─── Motor 2: Edge TTS (Antônio — gratuito, fallback) ─────────────────────
// Usado automaticamente se OPENAI_API_KEY não estiver configurada ou se a API falhar

const edgeTts = new EdgeTTS({
  voice: "pt-BR-AntonioNeural",
  pitch: "-4%",
  rate: "+5%",   // Ligeiramente mais rápido = mais confiante e menos robótico
  volume: "+0%",
});

async function generateWithEdgeTTS(text: string): Promise<string> {
  const outputPath = join(tmpdir(), `javis_edge_${Date.now()}.mp3`);
  await edgeTts.ttsPromise(text, outputPath);
  return outputPath;
}

// ─── Limpeza de texto para fala ───────────────────────────────────────────
// Remove tudo que faz o motor de voz gaguejar ou fazer pausas artificiais

function cleanTextForSpeech(text: string): string {
  return String(text || "")
    // --- Markdown ---
    .replace(/\*\*([^*]+)\*\*/g, "$1")     // negrito
    .replace(/\*([^*]+)\*/g, "$1")          // itálico
    .replace(/#+ */g, "")                   // títulos
    .replace(/`([^`]+)`/g, "$1")            // código inline
    .replace(/```[\s\S]*?```/g, "")         // blocos de código
    .replace(/([_~])/g, "")                 // sublinhado e tachado
    .replace(/\[AUDIO\]/gi, "")             // tag interna
    // --- URLs ---
    .replace(/(?:https?|ftp):\/\/\S+/g, "um link da internet")
    // --- RETICÊNCIAS: causa pausas longas e artificiais no TTS ---
    .replace(/\.{3,}/g, ",")
    // --- EXCLAMAÇÃO: força voz empolgada — converte para ponto final ---
    .replace(/!/g, ".")
    // --- Emojis e símbolos Unicode ---
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FEFF}]/gu, "")
    // --- Caracteres que o TTS lê de forma estranha ---
    .replace(/[\|\^\{\}\[\]\\]/g, "")
    .replace(/={2,}/g, "")
    .replace(/-{2,}/g, ",")
    // --- Siglas ---
    .replace(/\b(IA|IAs)\b/gi, "I. A.")
    .replace(/\b(AI|AIs)\b/gi, "A. I.")
    // --- Limpeza final ---
    .replace(/\n{3,}/g, "\n\n")
    .replace(/  +/g, " ")
    .trim();
}

// ─── Função principal exportada ───────────────────────────────────────────
/**
 * Gera áudio J.A.R.V.I.S. com o melhor motor disponível.
 *
 * Ordem de prioridade:
 * 1. OpenAI TTS (onyx) — se OPENAI_API_KEY estiver configurada
 * 2. Edge TTS (Antônio) — fallback gratuito automático
 */
export async function generateJavisAudio(text: string): Promise<string> {
  const cleanText = cleanTextForSpeech(text);

  if (!cleanText || cleanText.length < 2) {
    throw new Error("Texto vazio após limpeza.");
  }

  // Trunca se muito longo (limite da API OpenAI é 4096 chars)
  const finalText =
    cleanText.length > 3800
      ? cleanText.substring(0, 3800) +
        ". Desculpe, Senhor, a resposta é muito longa. Posso continuar por texto."
      : cleanText;

  // Tenta OpenAI TTS primeiro
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());

  if (hasOpenAI) {
    try {
      console.log("J.A.R.V.I.S. TTS: usando OpenAI (onyx)...");
      const path = await generateWithOpenAI(finalText);
      console.log("J.A.R.V.I.S. TTS: OpenAI OK →", path);
      return path;
    } catch (error: any) {
      console.warn(
        "J.A.R.V.I.S. TTS: OpenAI falhou, usando fallback Antônio.",
        error?.message
      );
    }
  }

  // Fallback: Edge TTS (Antônio) — gratuito
  console.log("J.A.R.V.I.S. TTS: usando Edge TTS (Antônio — fallback)...");
  const path = await generateWithEdgeTTS(finalText);
  console.log("J.A.R.V.I.S. TTS: Edge TTS OK →", path);
  return path;
}
