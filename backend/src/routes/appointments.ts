import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { getAdminClientId } from '../lib/adminClient.js';

const router = Router();

router.get('/appointments', async (_req, res) => {
  try {
    const adminClientId = await getAdminClientId();

    // Ordena por scheduled_at (campo correto salvo pelo jarvisCore)
    let q = supabase
      .from('appointments')
      .select('*')
      .neq('status', 'cancelado')
      .order('scheduled_at', { ascending: true });

    // Filtra apenas dados do administrador
    if (adminClientId) {
      q = q.eq('client_id', adminClientId);
    }

    const { data, error } = await q;

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Falha ao listar compromissos',
        details: error.message,
      });
    }

    return res.json({ status: 'ok', data });
  } catch (error: any) {
    return res.status(500).json({
      status: 'error',
      message: 'Erro inesperado ao listar compromissos',
      details: error?.message || 'unknown error',
    });
  }
});

router.post('/appointments', async (req, res) => {
  try {
    const { title, description, scheduled_at, status } = req.body as {
      title?: string;
      description?: string;
      scheduled_at?: string;
      status?: string;
    };

    if (!title || !title.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'title é obrigatório',
      });
    }

    if (!scheduled_at || !scheduled_at.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'scheduled_at é obrigatório',
      });
    }

    const adminClientId = await getAdminClientId();

    const { data, error } = await supabase
      .from('appointments')
      .insert([
        {
          title: title.trim(),
          description: description?.trim() || null,
          scheduled_at,
          status: status?.trim() || 'pending',
          ...(adminClientId ? { client_id: adminClientId } : {}),
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Falha ao criar compromisso',
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
      message: 'Erro inesperado ao criar compromisso',
      details: error?.message || 'unknown error',
    });
  }
});

export default router;