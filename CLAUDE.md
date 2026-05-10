# Volvix POS — Reglas operativas (Claude Code)

## REGLA #1 — NO DECIDIR DISEÑO/UX POR MI CUENTA
Flujo obligatorio: consultar → construir EXACTAMENTE → mostrar → confirmar.
Chat auditor: https://claude.ai/chat/455d7e93-082b-48d3-8f46-3e57301cd9fb

## REGLA #2 — REPORTAR SIEMPRE DESPUÉS DE CADA CAMBIO
No quedarme idle. Bitácora histórica en `docs/decisions.md`.

## Stack
- Backend: `api/index.js` (Vercel serverless) + `server.js` (local dev)
- DB: Supabase (PostgreSQL + Realtime + RLS)
- Frontend: HTML/CSS/JS vanilla en `public/`
- Deploy: `git push` → Vercel auto-deploya master

## Comandos
```bash
node server.js                          # local → localhost:3000
node scripts/e2e.mjs                    # E2E contra producción
```

## ⚠️ Pendientes críticos
- ROTAR JWT_SECRET y ADMIN_API_KEY en Vercel (estuvieron en git)
- Sentry DSN real

## RTK USAGE
Antes de cualquier bash largo, usar equivalente rtk:
- `git diff`  → `rtk git diff`
- `git log`   → `rtk git log -10`
- `grep -r`   → `rtk grep "patrón" .`
- archivo >200 líneas → `head -N` o `Read` con offset/limit, nunca cat completo

## SUBAGENTES
- Búsqueda >10 archivos → Task tool con subagente
- Análisis de logs → subagente
- Refactor multi-archivo → subagente por módulo
- Sesión principal recibe solo el resumen (200-500 tokens)

## SESSION HYGIENE
1. Tarea terminada → `/clear`
2. Context >60% → `/compact`
3. Modelo: Haiku=renames/lint · Sonnet=CRUD/endpoints · Opus=arquitectura/debug profundo
4. Pedidos incrementales > pedidos masivos

## Directorios a NO leer sin razón
`node_modules/ dist/ .git/ docs/reports/ .audit/ *.min.js`
