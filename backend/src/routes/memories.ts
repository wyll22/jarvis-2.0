import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { getAdminClientId } from '../lib/adminClient.js';

const router = Router();

router.get('/memories', async (_req, res) => {
  try {
    const adminClientId = await getAdminClientId();

    let q = supabase
      .from('memories')
      .select('*')
      .order('created_at', { ascending: false });

    // Filtra apenas memórias do administrador
    if (adminClientId) {
      q = q.eq('client_id', adminClientId);
    }

    const { data, error } = await q;

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Falha ao listar memórias',
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
      message: 'Erro inesperado ao listar memórias',
      details: error?.message || 'unknown error',
    });
  }
});

router.post('/memories', async (req, res) => {
  try {
    const { content, category } = req.body as {
      content?: string;
      category?: string;
    };

    if (!content || !content.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'content é obrigatório',
      });
    }

    const adminClientId = await getAdminClientId();

    const { data, error } = await supabase
      .from('memories')
      .insert([
        {
          content: content.trim(),
          category: category || null,
          ...(adminClientId ? { client_id: adminClientId } : {}),
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Falha ao criar memória',
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
      message: 'Erro inesperado ao criar memória',
      details: error?.message || 'unknown error',
    });
  }
});

export default router;