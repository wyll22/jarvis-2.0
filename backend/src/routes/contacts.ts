import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { getAdminClientId } from '../lib/adminClient.js';

const router = Router();

router.get('/contacts', async (_req, res) => {
  try {
    const adminClientId = await getAdminClientId();

    let q = supabase
      .from('contacts')
      .select('*')
      .order('name', { ascending: true });

    // Filtra apenas dados do administrador
    if (adminClientId) {
      q = q.eq('client_id', adminClientId);
    }

    const { data, error } = await q;

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Falha ao listar contatos',
        details: error.message,
      });
    }

    return res.json({ status: 'ok', data });
  } catch (error: any) {
    return res.status(500).json({
      status: 'error',
      message: 'Erro inesperado ao listar contatos',
      details: error?.message || 'unknown error',
    });
  }
});

router.post('/contacts', async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name) {
      return res.status(400).json({
        status: 'error',
        message: 'name é obrigatório',
      });
    }

    const adminClientId = await getAdminClientId();

    const { data, error } = await supabase
      .from('contacts')
      .insert([{ name, phone, ...(adminClientId ? { client_id: adminClientId } : {}) }])
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Falha ao criar contato',
        details: error.message,
      });
    }

    return res.json({
      status: 'ok',
      data,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: 'error',
      message: 'Erro inesperado ao criar contato',
      details: error?.message || 'unknown error',
    });
  }
});

export default router;