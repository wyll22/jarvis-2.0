import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

router.get('/db-test', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('contacts').select('*').limit(1);

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Falha ao consultar Supabase',
        details: error.message,
      });
    }

    return res.json({
      status: 'ok',
      message: 'Conexão com Supabase funcionando',
      data,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: 'error',
      message: 'Erro inesperado ao testar Supabase',
      details: error?.message || 'unknown error',
    });
  }
});

export default router;