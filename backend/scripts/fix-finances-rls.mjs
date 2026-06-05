/**
 * fix-finances-rls.mjs
 * Corrige permissões da tabela 'finances' no Supabase via Management API.
 * Uso: node scripts/fix-finances-rls.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lê o .env manualmente
const envPath = resolve(__dirname, "../.env");
const envContent = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => l.split("=").map((p) => p.trim()))
    .filter(([k]) => k)
    .map(([k, ...v]) => [k, v.join("=")])
);

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontrados no .env");
  process.exit(1);
}

// Extrai o ref do projeto da URL (ex: dsiyxnndlxikipmrxnzn)
const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];

console.log("Projeto:", projectRef);
console.log("Executando correção de RLS para tabela 'finances'...\n");

// SQL a ser executado
const sql = `
GRANT ALL PRIVILEGES ON TABLE public.finances TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.finances TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.finances TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.finances TO anon;
ALTER TABLE public.finances DISABLE ROW LEVEL SECURITY;
`.trim();

// Tenta via Management API (requer Personal Access Token - pode falhar)
async function tryManagementApi() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

// Alternativa: usar o endpoint de RPC se existir
async function tryDirectPost() {
  // Usa o service role key como superuser para executar via REST
  const tables = ["finances"];
  
  for (const table of tables) {
    console.log(`Testando acesso a '${table}'...`);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`, {
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
    });
    console.log(`  Status: ${res.status} ${res.statusText}`);
    if (!res.ok) {
      const body = await res.text();
      console.log(`  Erro: ${body}`);
    } else {
      console.log(`  OK - Acesso liberado.`);
    }
  }
}

// Executa o diagnóstico
await tryDirectPost();

// Tenta Management API
console.log("\nTentando Management API...");
try {
  const res = await tryManagementApi();
  const body = await res.text();
  if (res.ok) {
    console.log("Management API OK:", body);
  } else {
    console.log(`Management API falhou (${res.status}): ${body}`);
    console.log("\n=== SQL PARA EXECUTAR MANUALMENTE NO SUPABASE ===");
    console.log(sql);
    console.log("=================================================\n");
    console.log("Acesse: https://supabase.com/dashboard/project/" + projectRef + "/sql/new");
  }
} catch (e) {
  console.log("Management API indisponível:", e.message);
  console.log("\n=== SQL PARA EXECUTAR MANUALMENTE NO SUPABASE ===");
  console.log(sql);
  console.log("=================================================");
}
