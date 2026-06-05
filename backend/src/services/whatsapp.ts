import fs from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import P from "pino";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { processJavisCoreMessage } from "./jarvisCore.js";
import {
  isIncomingAudioEnabled,
  transcribeAudioWithGroq,
} from "./audioTranscription.js";
import { generateJavisAudio } from "./ttsBrain.js";
import { io } from "../index.js";
import { supabase } from "../lib/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const qrcodeTerminal = require("qrcode-terminal") as {
  generate: (input: string, options?: { small?: boolean }) => void;
};

const backendRoot = path.resolve(__dirname, "../../");
const authDir = path.join(backendRoot, "storage", "whatsapp-auth");
const envPath = path.join(backendRoot, ".env");

type WhatsAppStatus = {
  status: "stopped" | "starting" | "qr" | "connected" | "disconnected" | "error";
  qr: string | null;
  phone: string | null;
  lastError: string | null;
};

type WhatsAppConfig = {
  allowedJid: string | null;
  authDir: string;
};

let sock: WASocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let manualStopRequested = false;

const whatsappStatus: WhatsAppStatus = {
  status: "stopped",
  qr: null,
  phone: null,
  lastError: null,
};

export function getWhatsAppStatus(): WhatsAppStatus {
  return whatsappStatus;
}

export function getWhatsAppSocket(): WASocket | null {
  return sock;
}

export function getWhatsAppConfig(): WhatsAppConfig {
  return {
    allowedJid: getAllowedJid(),
    authDir,
  };
}

function getAllowedJid(): string | null {
  return process.env.JAVIS_ALLOWED_JID?.trim() || null;
}

function isAudioResponseEnabled(): boolean {
  return process.env.WHATSAPP_AUDIO_ENABLED === "true";
}

function normalizeAllowedJid(input: string): string {
  const raw = String(input || "").trim();

  if (!raw) {
    throw new Error("Informe o número ou JID autorizado.");
  }

  if (raw.includes("@")) {
    return raw;
  }

  const digits = raw.replace(/\D/g, "");

  if (!digits || digits.length < 10) {
    throw new Error("Número inválido. Use DDI + DDD + número, ou informe o JID completo.");
  }

  return `${digits}@s.whatsapp.net`;
}

async function updateEnvValue(key: string, value: string): Promise<void> {
  let envText = "";

  try {
    envText = await fs.readFile(envPath, "utf8");
  } catch {
    envText = "";
  }

  const lines = envText.split(/\r?\n/);
  const keyRegex = new RegExp(`^${key}=`);
  let found = false;

  const nextLines = lines.map((line) => {
    if (keyRegex.test(line)) {
      found = true;
      return `${key}=${value}`;
    }

    return line;
  });

  if (!found) {
    nextLines.push(`${key}=${value}`);
  }

  await fs.writeFile(envPath, nextLines.join("\n").trimEnd() + "\n", "utf8");
}

export async function saveWhatsAppConfig(input: {
  allowedJid: string;
}): Promise<WhatsAppConfig> {
  const normalizedJid = normalizeAllowedJid(input.allowedJid);

  process.env.JAVIS_ALLOWED_JID = normalizedJid;
  await updateEnvValue("JAVIS_ALLOWED_JID", normalizedJid);

  console.log("JAVIS_ALLOWED_JID atualizado:", normalizedJid);

  return getWhatsAppConfig();
}

function getMessageContent(message: WAMessage): any {
  const content: any = message.message || {};

  return (
    content.ephemeralMessage?.message ||
    content.viewOnceMessage?.message ||
    content.viewOnceMessageV2?.message ||
    content.documentWithCaptionMessage?.message ||
    content
  );
}

function extractTextFromMessage(message: WAMessage): string {
  const content = getMessageContent(message);

  const text =
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption ||
    "";

  return String(text || "").trim();
}

function getAudioMessageInfo(message: WAMessage): {
  hasAudio: boolean;
  mimeType: string | null;
} {
  const content = getMessageContent(message);
  const audioMessage = content?.audioMessage;

  if (!audioMessage) {
    return { hasAudio: false, mimeType: null };
  }

  return {
    hasAudio: true,
    mimeType: audioMessage?.mimetype || "audio/ogg",
  };
}

function getImageMessageInfo(message: WAMessage): {
  hasImage: boolean;
  mimeType: string | null;
} {
  const content = getMessageContent(message);
  const imageMessage = content?.imageMessage;

  if (!imageMessage) {
    return { hasImage: false, mimeType: null };
  }

  return {
    hasImage: true,
    mimeType: imageMessage?.mimetype || "image/jpeg",
  };
}

async function extractImageAsBase64(message: WAMessage): Promise<{
  base64: string;
  mimeType: string;
} | null> {
  if (!sock) return null;

  const imageInfo = getImageMessageInfo(message);
  if (!imageInfo.hasImage) return null;

  try {
    console.log("[whatsapp] Imagem recebida. Baixando para visão...");

    const downloaded = await downloadMediaMessage(
      message,
      "buffer",
      {},
      {
        logger: P({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    const imgBuffer = Buffer.isBuffer(downloaded)
      ? downloaded
      : Buffer.from(downloaded as any);

    console.log("[whatsapp] Imagem baixada:", {
      bytes: imgBuffer.length,
      mimeType: imageInfo.mimeType,
    });

    return {
      base64: imgBuffer.toString("base64"),
      mimeType: imageInfo.mimeType || "image/jpeg",
    };
  } catch (err: any) {
    console.error("[whatsapp] Erro ao baixar imagem:", err?.message || err);
    return null;
  }
}

async function transcribeIncomingAudio(message: WAMessage): Promise<string | null> {
  if (!isIncomingAudioEnabled()) {
    console.log("Áudio recebido, mas WHATSAPP_INCOMING_AUDIO_ENABLED=false.");
    return null;
  }

  if (!sock) {
    throw new Error("Socket do WhatsApp não disponível para baixar áudio.");
  }

  const audioInfo = getAudioMessageInfo(message);

  if (!audioInfo.hasAudio) {
    return null;
  }

  console.log("Áudio recebido no WhatsApp. Baixando mídia...");

  const downloaded = await downloadMediaMessage(
    message,
    "buffer",
    {},
    {
      logger: P({ level: "silent" }),
      reuploadRequest: sock.updateMediaMessage,
    }
  );

  const audioBuffer = Buffer.isBuffer(downloaded)
    ? downloaded
    : Buffer.from(downloaded as any);

  console.log("Áudio baixado:", {
    bytes: audioBuffer.length,
    mimeType: audioInfo.mimeType,
  });

  const transcription = await transcribeAudioWithGroq({
    audioBuffer,
    mimeType: audioInfo.mimeType,
  });

  console.log("Áudio transcrito:", {
    text: transcription.text,
    savedPath: transcription.savedPath,
    model: transcription.model,
  });

  return transcription.text;
}

/**
 * Remove qualquer JSON, chaves, colchetes ou código bruto da resposta
 * antes de enviar ao usuário no WhatsApp.
 * Garante que apenas linguagem natural chegue ao chat.
 */
function sanitizeReply(text: string): string {
  let clean = String(text || "").trim();

  // Remove blocos de código fenced (```json ... ``` ou ``` ... ```)
  clean = clean.replace(/```[\s\S]*?```/g, "");

  // Remove JSON inline que ocupa a linha toda (ex: linhas que começam com { ou [)
  clean = clean
    .split("\n")
    .filter((line) => !/^\s*[\{\[]/.test(line.trim()))
    .join("\n");

  // Remove pares de chaves/colchetes completos com conteúdo JSON
  // (protege texto normal que usa { em expressões raras)
  clean = clean.replace(/\{[^{}]{0,500}\}/g, (match) => {
    // Só remove se parecer JSON (tem ':' e vírgulas)
    return (match.includes(':') && match.includes('"')) ? '' : match;
  });

  // Remove colchetes JSON remanescentes
  clean = clean.replace(/\[[^\[\]]{0,300}\]/g, (match) => {
    return (match.includes('"') || match.includes("'")) ? '' : match;
  });

  // Limpa espaços e linhas em branco extras gerados pela remoção
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();

  return clean || text.trim();
}

/**
 * Detecta se a resposta é uma confirmação de ação concluída.
 * Nesse caso, pula o TTS para economizar créditos da API.
 *
 * CRITÉRIO: apenas padrões semânticos de "ação executada".
 * NÃO pula por tamanho — o J.A.R.V.I.S. é conciso por design.
 */
function isShortConfirmation(text: string): boolean {
  const clean = text.trim();

  // Nunca pula TTS se for uma pergunta de retorno (bot pedindo mais info)
  if (clean.endsWith("?")) return false;

  // Resposta muito longa (> 200 chars) → sempre gera áudio
  if (clean.length > 200) return false;

  // Padrões semânticos de confirmação de ação concluída
  // Só dispara quando o bot confirma que executou uma tool com sucesso
  const confirmationPatterns = [
    /tarefa.{0,30}(adicionada|registrada|salva|criada|conclu[íi]da)/i,
    /registro.{0,30}(salvo|adicionado|registrado)/i,
    /agendado.{0,20}senhor/i,
    /anotado.{0,20}senhor/i,
    /contato.{0,20}(salvo|registrado|atualizado)/i,
    /mem[oó]ria.{0,20}(salva|registrada|atualizada)/i,
    /projeto.{0,20}(criado|atualizado)/i,
    /medi[cç][aã]o.{0,20}registrada/i,
    /protocolos.{0,20}(registrados|atualizados)/i,
    /conclu[íi]d[ao].{0,30}senhor/i,
  ];

  return confirmationPatterns.some((p) => p.test(clean));
}


async function sendTextReply(jid: string, reply: string): Promise<void> {
  await sock?.sendMessage(jid, {
    text: reply,
  });
}

/**
 * Converte um arquivo MP3 para OGG Opus usando ffmpeg.
 * O WhatsApp exige OGG Opus para mensagens de voz PTT.
 */
async function convertToOggOpus(mp3Path: string): Promise<string> {
  const oggPath = mp3Path.replace(/\.mp3$/, ".ogg");

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-i", mp3Path,
        "-c:a", "libopus",
        "-b:a", "48k",
        "-ar", "48000",
        "-ac", "1",
        oggPath,
      ],
      { shell: false }
    );

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(oggPath);
      else reject(new Error(`ffmpeg saiu com código ${code}`));
    });

    ffmpeg.on("error", reject);
  });
}

async function sendAudioReplyIfEnabled(jid: string, text: string): Promise<void> {
  if (process.env.WHATSAPP_AUDIO_ENABLED === "false") {
    console.log("Áudio do WhatsApp desativado por WHATSAPP_AUDIO_ENABLED=false.");
    return;
  }

  const cleanText = String(text || "").trim();
  if (cleanText.length < 10) {
    console.log("Texto muito curto, pulando geração de áudio.");
    return;
  }

  let mp3Path: string | null = null;
  let oggPath: string | null = null;

  try {
    console.log("J.A.R.V.I.S. gerando áudio para WhatsApp...");
    mp3Path = await generateJavisAudio(cleanText);

    // Converte MP3 → OGG Opus (formato nativo do WhatsApp PTT)
    console.log("Convertendo MP3 → OGG Opus para WhatsApp...");
    oggPath = await convertToOggOpus(mp3Path);

    // Lê como buffer para evitar problemas de path no Windows
    const audioBuffer = await fs.readFile(oggPath);

    await sock?.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true,
    });

    console.log("✅ Áudio PTT (OGG Opus) enviado no WhatsApp.");
  } catch (error: any) {
    console.error("Erro ao gerar/enviar áudio no WhatsApp:", error?.message || error);
  } finally {
    // Limpa arquivos temporários
    if (mp3Path) fs.unlink(mp3Path).catch(() => {});
    if (oggPath) fs.unlink(oggPath).catch(() => {});
  }
}

async function handleAuthorizedMessage(message: WAMessage, jid: string, clientId?: string): Promise<void> {
  let text = extractTextFromMessage(message);
  const audioInfo = getAudioMessageInfo(message);
  const imageInfo = getImageMessageInfo(message);

  // ── Pipeline de Áudio (STT Whisper) ───────────────────────────────────────
  if (!text && audioInfo.hasAudio) {
    try {
      const transcription = await transcribeIncomingAudio(message);

      if (!transcription) {
        // STT desabilitado — avisa mas não trava o fluxo
        await sendTextReply(jid, "Senhor, o reconhecimento de voz está desativado. Envie uma mensagem de texto.");
        return;
      }

      text = transcription;
      console.log("[whatsapp] Áudio transcrito pelo Whisper:", text);
    } catch (error: any) {
      console.error("[whatsapp] Erro no STT:", error?.message || error);
      await sendTextReply(jid, "Senhor, não consegui transcrever o áudio agora. Tente novamente ou envie em texto.");
      return;
    }
  }

  // ── Pipeline de Visão (Imagem → jarvisCore) ────────────────────────────
  let imageBase64: string | undefined;
  let imageMime: string | undefined;

  if (imageInfo.hasImage) {
    const extracted = await extractImageAsBase64(message);
    if (extracted) {
      imageBase64 = extracted.base64;
      imageMime   = extracted.mimeType;
      // Caption da imagem vira o texto (pode ser vazio)
      if (!text) text = "Analise esta imagem, Senhor.";
      console.log(`[whatsapp] Imagem pronta para visão (${imageMime}, ${Math.round(imageBase64.length * 0.75 / 1024)}KB).`);
    }
  }

  // ── Guarda silenciosamente mensagens sem conteúdo útil ──────────────────
  if (!text) {
    console.log("[whatsapp] Mensagem sem texto, áudio ou imagem processável. Ignorada.");
    return;
  }

  console.log("[whatsapp] Mensagem autorizada do Senhor:", text.substring(0, 80));

  if (text.toLowerCase().trim() === "ping") {
    await sendTextReply(jid, "pong do JAVIS");
    return;
  }

  // 1. Marca como lida e mostra "digitando..."
  try {
    await sock?.readMessages([message.key]);
  } catch { /* ignora */ }

  await sock?.sendPresenceUpdate("composing", jid);

  // 2. Processa no jarvisCore — motor único (text + opcional: imagem)
  let reply: string;

  try {
    const coreResult = await processJavisCoreMessage({
      message: text,
      sessionId: jid,
      source: "whatsapp",
      clientId,
      imageBase64,
      imageMime,
    });
    console.log(`[jarvisCore] Tools usadas: [${coreResult.toolsUsed.join(", ") || "nenhuma"}]`);
    reply = coreResult.reply || "Comando processado, Senhor.";
  } catch (coreErr: unknown) {
    const msg = coreErr instanceof Error ? coreErr.message : String(coreErr);
    console.error("[jarvisCore] Erro crítico:", msg);
    reply = "Senhor, houve uma falha nos sistemas de processamento. Tente novamente.";
  }

  reply = reply.replace(/\[AUDIO\]/g, "").trim();
  reply = sanitizeReply(reply);

  console.log(`[whatsapp] Reply (${reply.length} chars): ${reply.substring(0, 80)}...`);

  // 3. Para o "digitando", delay mínimo
  await sock?.sendPresenceUpdate("paused", jid);
  await new Promise((r) => setTimeout(r, 300));
  await sendTextReply(jid, reply);

  // 4. Filtro condicional de áudio: pula TTS para confirmações curtas
  if (isShortConfirmation(reply)) {
    console.log(`[whatsapp] Confirmação curta — TTS pulado.`);
    await sock?.sendPresenceUpdate("paused", jid);
    return;
  }

  // 5. Resposta longa: gera áudio premium (TTS)
  await sock?.sendPresenceUpdate("recording", jid);
  await sendAudioReplyIfEnabled(jid, reply);
  await sock?.sendPresenceUpdate("paused", jid);
}

export async function startWhatsApp(): Promise<WhatsAppStatus> {
  if (
    sock &&
    ["connected", "qr", "starting"].includes(whatsappStatus.status)
  ) {
    return whatsappStatus;
  }

  manualStopRequested = false;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  whatsappStatus.status = "starting";
  whatsappStatus.lastError = null;

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["JAVIS", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      whatsappStatus.status = "qr";
      whatsappStatus.qr = qr;
      whatsappStatus.lastError = null;

      console.log(
        "\nQR Code recebido. Escaneie no WhatsApp > Dispositivos conectados:\n"
      );

      qrcodeTerminal.generate(qr, { small: true });

      // Emite QR Code para o painel SaaS via Socket.io
      io.emit("whatsapp:qr", { qr });
      io.emit("whatsapp:status", { status: "qr", qr, phone: null, lastError: null });
    }

    if (connection === "open") {
      whatsappStatus.status = "connected";
      whatsappStatus.qr = null;
      whatsappStatus.lastError = null;
      whatsappStatus.phone = sock?.user?.id || null;

      console.log("WhatsApp conectado:", whatsappStatus.phone);

      // Avisa o painel que a conexão foi estabelecida
      io.emit("whatsapp:status", { status: "connected", qr: null, phone: whatsappStatus.phone, lastError: null });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect =
        !manualStopRequested && statusCode !== DisconnectReason.loggedOut;

      whatsappStatus.status = manualStopRequested ? "stopped" : "disconnected";
      whatsappStatus.qr = null;
      whatsappStatus.lastError = manualStopRequested
        ? null
        : (lastDisconnect?.error as any)?.message || "Conexão fechada.";

      console.log("WhatsApp desconectado:", whatsappStatus.lastError);

      // Notifica o painel da desconexão
      io.emit("whatsapp:status", {
        status: whatsappStatus.status,
        qr: null,
        phone: null,
        lastError: whatsappStatus.lastError,
      });

      sock = null;

      if (manualStopRequested) {
        manualStopRequested = false;
        return;
      }

      if (shouldReconnect) {
        console.log("Tentando reconectar WhatsApp...");

        reconnectTimer = setTimeout(() => {
          startWhatsApp().catch((error) => {
            whatsappStatus.status = "error";
            whatsappStatus.lastError = error?.message || String(error);
            console.error("Erro ao reconectar WhatsApp:", error);
          });
        }, 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async (event) => {
    try {
      const message = event.messages?.[0];

      if (!message || message.key.fromMe) return;

      let jid = message.key.remoteJid;

      if (!jid) return;
      
      // Se a mensagem vier mascarada como Linked Device ID (@lid)
      if (jid.includes("@lid")) {
        // Tenta usar o remoteJidAlt (que contém o @s.whatsapp.net)
        const altJid = (message.key as any).remoteJidAlt;
        if (altJid) {
          console.log(`[Auth] Resolvendo @lid ${jid} para altJid ${altJid}`);
          jid = altJid;
        } else if (message.key.participant) {
          console.log(`[Auth] Resolvendo @lid ${jid} para participant ${message.key.participant}`);
          jid = message.key.participant;
        } else {
          console.log(`[Auth-Debug] Mensagem @lid sem altJid ou participant:`, JSON.stringify(message.key));
        }
      }

      const previewText = extractTextFromMessage(message);
      const audioInfo = getAudioMessageInfo(message);

      console.log("Mensagem recebida:", {
        jid,
        text: previewText || null,
        hasAudio: audioInfo.hasAudio,
        mimeType: audioInfo.mimeType,
      });

      // ── CATRACA MULTI-TENANT (Supabase) ────────────────────────────────
      // Normaliza o JID para apenas dígitos (ex: '5561999999999')
      // para comparar com a coluna phone_number da tabela clients.
      const phoneDigits = jid.replace(/[^\d]/g, "");

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id, status")
        .or(`whatsapp_jid.eq.${jid},phone_number.eq.${phoneDigits}`)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (clientError) {
        // Falha na consulta — bloqueia por segurança, log apenas no servidor
        console.error("[Auth] Erro ao consultar clients:", clientError.message);
        return;
      }

      if (!client) {
        // JID não encontrado ou assinatura inativa — silencio absoluto
        console.log(`[Auth] JID não autorizado (ignorado silenciosamente): ${jid}`);
        return;
      }

      console.log(`[Auth] Cliente autorizado: id=${client.id} | jid=${jid}`);
      // ─────────────────────────────────────────────────────

      await handleAuthorizedMessage(message, jid, client.id);
    } catch (error) {
      console.error("Erro ao processar mensagem do WhatsApp:", error);
    }
  });

  return whatsappStatus;
}

export async function stopWhatsApp(): Promise<void> {
  manualStopRequested = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (sock) {
    try {
      (sock as any).end?.(new Error("WhatsApp parado manualmente."));
    } catch {
      // ignora erro ao encerrar socket local
    }

    sock = null;
  }

  whatsappStatus.status = "stopped";
  whatsappStatus.qr = null;
  whatsappStatus.phone = null;
  whatsappStatus.lastError = null;
}

export async function resetWhatsAppSession(options?: {
  startAfterReset?: boolean;
}): Promise<WhatsAppStatus> {
  const startAfterReset = options?.startAfterReset ?? true;

  console.log("Resetando sessão do WhatsApp...");

  await stopWhatsApp();

  await fs.rm(authDir, {
    recursive: true,
    force: true,
  });

  whatsappStatus.status = "stopped";
  whatsappStatus.qr = null;
  whatsappStatus.phone = null;
  whatsappStatus.lastError = null;

  console.log("Sessão do WhatsApp removida:", authDir);

  if (startAfterReset) {
    return startWhatsApp();
  }

  return whatsappStatus;
}