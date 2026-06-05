import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

import testRoutes from "./routes/test.js";
import contactsRoutes from "./routes/contacts.js";
import chatRoutes from "./routes/chat.js";
import memoriesRoutes from "./routes/memories.js";
import appointmentsRoutes from "./routes/appointments.js";
import ttsRoutes from "./routes/tts.js";
import whatsappRoutes from "./routes/whatsapp.js";
import { startWhatsApp } from "./services/whatsapp.js";
import projectsRoutes from "./routes/projects.js";
import briefingRoutes from "./routes/briefing.js";
import systemRoutes from "./routes/system.js";
import clientsRoutes from "./routes/clients.js";
import onboardingRoutes from "./routes/onboarding.js";
import { startDailyBriefingScheduler } from "./services/dailyBriefing.js";
import { startAppointmentAlertScheduler } from "./services/appointmentAlerts.js";
import { startTrialExpirationScheduler } from "./services/trialExpiration.js";
import authRoutes from "./routes/auth.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();
const httpServer = createServer(app);

// ─── Socket.io — QR Code e status em tempo real ──────────────────────────────
export const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || "http://localhost:3000", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log(`[Socket.io] Cliente conectado: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`[Socket.io] Cliente desconectado: ${socket.id}`);
  });
});

const PORT = Number(process.env.PORT || 3001);

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// Aplica a proteção de rotas globais (protege tudo abaixo, exceto login/health definidos no middleware)
app.use(requireAuth);

app.use("/api/auth", authRoutes);

// Rotas antigas, para não quebrar o que já estava funcionando
app.use("/", testRoutes);
app.use("/", contactsRoutes);
app.use("/", memoriesRoutes);
app.use("/", appointmentsRoutes);

// Rotas novas/padronizadas com /api
app.use("/api", testRoutes);
app.use("/api", contactsRoutes);
app.use("/api", memoriesRoutes);
app.use("/api", appointmentsRoutes);
app.use("/api/tts", ttsRoutes);
app.use("/tts", ttsRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/whatsapp", whatsappRoutes);
app.use("/", projectsRoutes);
app.use("/api/briefing", briefingRoutes);
app.use("/api/system", systemRoutes);
app.use("/api", clientsRoutes);
app.use("/api/onboarding", onboardingRoutes);

// Chat: aceita os dois formatos
app.use("/chat", chatRoutes);
app.use("/api/chat", chatRoutes);

app.get(["/health", "/api/health"], async (_req, res) => {
  try {
    res.json({
      status: "online",
      service: "Javis Backend",
      supabase: "configured",
      keyMode: process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "anon",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Falha ao inicializar Supabase",
    });
  }
});

httpServer.listen(PORT, () => {
  console.log(`Javis backend rodando na porta ${PORT}`);

  if (process.env.WHATSAPP_AUTO_START === "true") {
    console.log("Auto-start do WhatsApp ativado. Tentando conectar...");

    startWhatsApp()
      .then((status) => {
        console.log("WhatsApp auto-start iniciado:", status.status);
      })
      .catch((error) => {
        console.error(
          "Erro no auto-start do WhatsApp:",
          error?.message || error
        );
      });
  }

  startDailyBriefingScheduler();
  startAppointmentAlertScheduler();
  startTrialExpirationScheduler();
});

// Graceful shutdown: garante que a porta 3001 seja liberada no reload do tsx watch ou Ctrl+C
function gracefulShutdown() {
  console.log("\n[Sistema] Sinal de encerramento recebido. Liberando a porta 3001...");
  httpServer.close(() => {
    console.log("[Sistema] Servidor HTTP encerrado.");
    process.exit(0);
  });

  // Força o encerramento se o httpServer demorar mais de 1.5s para fechar
  setTimeout(() => {
    console.warn("[Sistema] Forçando encerramento do processo.");
    process.exit(0);
  }, 1500).unref();
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
process.on("SIGUSR2", gracefulShutdown); // Usado pelo nodemon/tsx em algumas versões