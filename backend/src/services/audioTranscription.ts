import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendRoot = path.resolve(__dirname, "../../");
const mediaDir = path.join(backendRoot, "storage", "whatsapp-media");

type TranscribeAudioInput = {
  audioBuffer: Buffer;
  mimeType?: string | null;
  fileName?: string;
};

type TranscribeAudioOutput = {
  text: string;
  savedPath: string;
  model: string;
};

function getGroqApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GROQ_API_KEY não configurada para transcrição de áudio.");
  }

  return apiKey;
}

function getGroqSttModel(): string {
  return process.env.GROQ_STT_MODEL?.trim() || "whisper-large-v3-turbo";
}

function getExtensionFromMime(mimeType?: string | null): string {
  const mime = String(mimeType || "").toLowerCase();

  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("amr")) return "amr";

  return "ogg";
}

function getCleanMimeType(mimeType?: string | null): string {
  const mime = String(mimeType || "").trim();

  if (!mime) return "audio/ogg";

  return mime;
}

async function ensureMediaDir(): Promise<void> {
  await fs.mkdir(mediaDir, { recursive: true });
}

function cleanTranscriptionText(text: unknown): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function transcribeAudioWithGroq(
  input: TranscribeAudioInput
): Promise<TranscribeAudioOutput> {
  const groqApiKey = getGroqApiKey();
  const groqSttModel = getGroqSttModel();

  if (!input.audioBuffer?.length) {
    throw new Error("Buffer de áudio vazio.");
  }

  await ensureMediaDir();

  const extension = getExtensionFromMime(input.mimeType);
  const fileName =
    input.fileName ||
    `whatsapp-audio-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;

  const savedPath = path.join(mediaDir, fileName);

  await fs.writeFile(savedPath, input.audioBuffer);

  const mimeType = getCleanMimeType(input.mimeType);

  const audioBlob = new Blob([new Uint8Array(input.audioBuffer)], {
    type: mimeType,
  });

  const formData = new FormData();

  formData.append("file", audioBlob, fileName);
  formData.append("model", groqSttModel);
  formData.append("language", "pt");
  formData.append("response_format", "json");
  formData.append(
    "prompt",
    "Áudio em português do Brasil. Transcreva de forma fiel, mantendo nomes, horários, datas, valores e comandos."
  );

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Falha na transcrição Groq: ${response.status} ${errorText}`
    );
  }

  const data: any = await response.json();
  const text = cleanTranscriptionText(data?.text);

  if (!text) {
    throw new Error("Groq retornou transcrição vazia.");
  }

  return {
    text,
    savedPath,
    model: groqSttModel,
  };
}

export function isIncomingAudioEnabled(): boolean {
  return process.env.WHATSAPP_INCOMING_AUDIO_ENABLED === "true";
}