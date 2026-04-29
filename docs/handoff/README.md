# Handoff completo — Volvix POS (2026-04-29)

## Setup en máquina nueva
1. Clonar: `git clone https://github.com/pruebavolte/volvix-pos`
2. `npm install`
3. Copiar `SECRETS-TO-ADD.txt` → `.env.local` (llenar valores)
4. Configurar Vercel: ver `configs/VERCEL-SETUP.md`
5. Configurar Supabase: ver `configs/SUPABASE-SETUP.md`
6. Aplicar migrations: ver `migrations-sql/`
7. Deploy: `vercel --prod`

## Estructura
- `configs/` — instrucciones setup por servicio (sin secrets)
- `migrations-sql/` — migrations SQL pendientes para próxima sesión
- `scripts/` — scripts deploy/setup/backup
- `../session-2026-04-29/` — docs de la sesión 16 archivos
