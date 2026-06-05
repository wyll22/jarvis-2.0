# Railway test deploy

Minimal test deploy checklist for this project.

## Backend service

- Root directory: `backend`
- Dockerfile: `backend/Dockerfile`
- Start command: Docker `CMD ["node", "dist/index.js"]`
- Health endpoint: `/api/health`

Required variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY`
- `ADMIN_PASSWORD`
- `CORS_ORIGIN` with the public frontend URL
- At least one AI provider key used by the current fallback chain

WhatsApp/audio variables depend on the test scope:

- `WHATSAPP_AUTO_START`
- `WHATSAPP_AUDIO_ENABLED`
- `WHATSAPP_INCOMING_AUDIO_ENABLED`
- `GROQ_API_KEY` if incoming audio transcription is enabled

Persistent volume:

- Mount Railway persistent storage at `/app/storage/whatsapp-auth`

Recommended extra persistent paths:

- `/app/storage/whatsapp-media`
- `/app/storage/audio`

## Frontend service

- Root directory: repository root
- Build command: `npm run build`
- Publish directory: `dist`
- Set `VITE_API_URL` to the public backend URL, for example `https://your-backend.up.railway.app`

## Notes

- The frontend REST, Socket.io, and TTS calls use `VITE_API_URL`.
- Set `CORS_ORIGIN` on the backend to the exact public frontend origin.
- Do not commit real `.env` files or WhatsApp session files.
