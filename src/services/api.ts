const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001';
const API_TIMEOUT_MS = 15000; // 15 segundos
const API_MAX_RETRIES = 1;    // 1 retry automático

function getAuthHeaders(extraHeaders: Record<string, string> = {}) {
  const token = localStorage.getItem('javis_session_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...extraHeaders
  };
}

/**
 * Fetch com timeout e retry automático.
 * - Timeout de 15s evita tela travada em rede lenta
 * - 1 retry automático recupera de falhas transitórias (ex: backend reiniciando)
 * - Erros 401 e 4xx NÃO fazem retry (não faz sentido repetir)
 */
async function resilientFetch(url: string, options: RequestInit = {}, retries = API_MAX_RETRIES): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });

    // Não faz retry em erros de cliente (4xx) — só em erros de servidor (5xx) ou rede
    if (!response.ok && response.status >= 500 && retries > 0) {
      console.warn(`[API] ${url} retornou ${response.status}, tentando novamente...`);
      await new Promise(r => setTimeout(r, 1000)); // espera 1s antes do retry
      return resilientFetch(url, options, retries - 1);
    }

    return response;
  } catch (error: any) {
    if (retries > 0 && error.name !== 'AbortError') {
      console.warn(`[API] ${url} falhou (${error.message}), tentando novamente...`);
      await new Promise(r => setTimeout(r, 1000));
      return resilientFetch(url, options, retries - 1);
    }
    if (error.name === 'AbortError') {
      throw new Error(`Timeout: servidor não respondeu em ${API_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Intercepta respostas 401 para deslogar o usuário caso o token expire ou não exista
async function checkResponse(response: Response, errorMessage: string) {
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('javis_auth');
      localStorage.removeItem('javis_session_token');
      // Dispara evento customizado para o App.tsx voltar à tela de login sem recarregar a página
      window.dispatchEvent(new CustomEvent('javis:logout'));
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

export async function loginBackend(password: string) {
  const response = await resilientFetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }, 0); // Login: sem retry (senha errada não se corrige repetindo)
  if (!response.ok) {
    throw new Error('Credenciais inválidas');
  }
  return response.json();
}

export async function fetchContacts() {
  const response = await resilientFetch(`${API_BASE_URL}/contacts`, { headers: getAuthHeaders() });
  return checkResponse(response, 'Falha ao buscar contatos');
}

export async function createContact(payload: { name: string; phone?: string }) {
  const response = await resilientFetch(`${API_BASE_URL}/contacts`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return checkResponse(response, 'Falha ao criar contato');
}

export async function fetchMemories() {
  const response = await resilientFetch(`${API_BASE_URL}/memories`, { headers: getAuthHeaders() });
  return checkResponse(response, 'Falha ao buscar memórias');
}

export async function fetchAppointments() {
  const response = await resilientFetch(`${API_BASE_URL}/appointments`, { headers: getAuthHeaders() });
  return checkResponse(response, 'Falha ao buscar compromissos');
}

export async function fetchProjects() {
  const response = await resilientFetch(`${API_BASE_URL}/projects`, { headers: getAuthHeaders() });
  return checkResponse(response, 'Falha ao carregar projetos');
}

export async function sendChatMessage(message: string) {
  const response = await resilientFetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message }),
  });
  return checkResponse(response, 'Falha ao enviar mensagem para o chat');
}

export async function fetchWhatsAppStatus() {
  const response = await resilientFetch(`${API_BASE_URL}/api/whatsapp/status`, { headers: getAuthHeaders() });
  return checkResponse(response, 'Falha ao buscar status do WhatsApp');
}

export async function startWhatsApp() {
  const response = await resilientFetch(`${API_BASE_URL}/api/whatsapp/start`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return checkResponse(response, 'Falha ao iniciar WhatsApp');
}

export async function stopWhatsApp() {
  const response = await resilientFetch(`${API_BASE_URL}/api/whatsapp/stop`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return checkResponse(response, 'Falha ao parar WhatsApp');
}

export async function resetWhatsApp() {
  const response = await resilientFetch(`${API_BASE_URL}/api/whatsapp/reset`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ startAfterReset: true }),
  });
  return checkResponse(response, 'Falha ao resetar sessão do WhatsApp');
}

export async function systemReset() {
  const response = await resilientFetch(`${API_BASE_URL}/api/system/reset`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return checkResponse(response, 'Falha ao resetar o sistema');
}

export async function saveSystemConfig(config: Record<string, string>) {
  const response = await resilientFetch(`${API_BASE_URL}/api/system/config`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(config),
  });
  return checkResponse(response, 'Falha ao salvar configurações');
}

export async function fetchSystemConfig() {
  const response = await resilientFetch(`${API_BASE_URL}/api/system/config`, { headers: getAuthHeaders() });
  return checkResponse(response, 'Falha ao carregar configurações');
}

export async function fetchClients() {
  const response = await resilientFetch(`${API_BASE_URL}/api/clients`, { headers: getAuthHeaders() });
  return checkResponse(response, 'Falha ao buscar clientes');
}

export async function updateClientStatus(id: string, status: string) {
  const response = await resilientFetch(`${API_BASE_URL}/api/clients/${id}/status`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
  return checkResponse(response, 'Falha ao atualizar status do cliente');
}

export async function updateClientName(id: string, name: string) {
  const response = await resilientFetch(`${API_BASE_URL}/api/clients/${id}/name`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name }),
  });
  return checkResponse(response, 'Falha ao renomear cliente');
}

export async function deleteClient(id: string) {
  const response = await resilientFetch(`${API_BASE_URL}/api/clients/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return checkResponse(response, 'Falha ao excluir cliente');
}

export async function registerClient(payload: { name: string; phone_number: string; plan: string; trialHours?: number }) {
  const response = await resilientFetch(`${API_BASE_URL}/api/onboarding/register-demo`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return checkResponse(response, 'Falha ao cadastrar cliente');
}

export async function upgradeClient(id: string) {
  const response = await resilientFetch(`${API_BASE_URL}/api/clients/${id}/upgrade`, {
    method: 'PUT',
    headers: getAuthHeaders(),
  });
  return checkResponse(response, 'Falha ao converter cliente');
}