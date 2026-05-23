# HANDOFF Sesión V14 — Volvix POS

> Para retomar en sesión nueva (Haiku 4.5 o cualquier modelo). Todo el contexto crítico está aquí.

---

## Estado actual producción

- Version: **1.0.490** (V14.8 deployed)
- URL: https://systeminternational.app/
- Repo: `pruebavolte/volvix-pos` branch `main`
- Auto-deploy Vercel en push
- Supabase project: `zhvwmzkcqngcaqpdxtwr`

---

## Lo que se construyó (V14.0 → V14.8)

### Motor multi-giro V2 (`/js/applyGiroConfig.v2.js`)
- 355 líneas, sintaxis JS válida
- Lee `/data/giros-terminologias-v2.json` (60 giros, 24KB) + Supabase `giros_maestro.metadata.terminologias_full`
- Modo AGGRESSIVE: TreeWalker reemplaza textos sin `data-i18n` attributes
- Bugs arreglados acumulados:
  - V14.2: pre-load `default` cache (sin esto dict={} y no reemplazaba)
  - V14.3: regex case-insensitive flag `gi` + callback preserva caso
  - V14.4: `_applying` flag + debounce 300ms (evita loop MutationObserver)

### Panel routing deeplink (`paneldecontrol.html`)
- Formato URL: `#permisos[/<nav>[/<giro_slug>[/<modulo>]]]`
- Ej: `#permisos/giros/fruteria/pos` → carga directo en Frutería
- F5 reload preserva estado
- V14.7: row.click() programático en lugar de state manual
- V14.8: 25 retries × 500ms = 12.5s timeout (antes 8×400=3.2s falló con giros tardíos)

### Tests pasados (10/10 giros)
restaurante, fruteria, farmacia, barberia, taqueria, gimnasio, hotel, papeleria, ferreteria, floreria

### Supabase BD
- `giros_maestro` (295 rows, 13 cols) — SSOT migrado en V13.31
- 57/60 giros con `terminologias_full` en metadata (3 skipped por mismatch slug: agencia_viajes, hot_dog, mascotas)
- `volvix_giro_searches` (40+ rows tracking)
- `volvix_visitor_presence` (TTL 24h)
- 128 tenants en `pos_companies`

---

## Reglas del proyecto

1. NUNCA decidir diseño/UX por cuenta propia → consultar Claude AI URL: `https://claude.ai/chat/455d7e93-082b-48d3-8f46-3e57301cd9fb`
2. Reportar a Claude AI tras cada cambio significativo
3. Toda regla/decisión → `CLAUDE.md` o `docs/specs/<fecha>.md`
4. Frontend NUNCA toca Supabase directo → todo via `/api/*`

---

## Stack

- Backend: `api/index.js` (~35K LOC) Node serverless
- DB: Supabase Postgres + RLS + Realtime
- Frontend: HTML/CSS/JS vanilla en `public/`
- Auth: Custom JWT + email OTP
- Deploy: Vercel auto-deploy push to `main`

---

## Setup activo (sesión actual)

| Tool | Estado |
|---|---|
| rtk (bash compress) | `~/.local/bin/rtk` |
| ccusage (gasto) | `npm/ccusage` instalado |
| markitdown (docx→md) | `C:\Users\DELL\AppData\Roaming\Python\Python314\Scripts\markitdown.exe` |
| Caveman mode | activo via SessionStart hook |
| CLAUDE.md global | 2418B en `~/.claude/CLAUDE.md` |
| CLAUDE.md proyecto | 4166B (comprimido 64% de 11674B) |
| .claudeignore global | 281B en `~/.claude/.claudeignore` |
| settings.json | hooks SessionStart + PreToolUse(rtk) configurados |
| Tareas programadas | 16 todas en `enabled:false` |

---

## Archivos clave de la sesión

```
public/data/giros-terminologias-v2.json    24KB · 60 giros × 15+ keys
public/js/applyGiroConfig.v2.js            12.5KB · motor V2 con 3 fixes
public/paneldecontrol.html                 +V14.5-V14.8 deeplink routing
scripts/seed-terminologias-to-supabase.mjs sincroniza static→BD
scripts/seed-giros-master.mjs              seed 295 giros
.audit/CLAUDE-SETUP-PORTABLE.md            setup universal portable
.audit/ER-DIAGRAM-SUPABASE.md              mapa BD 408 tablas
.audit/db-er-diagram.html                  ER diagram interactivo (NO público)
CLAUDE.md (worktree)                       4166B reglas oro comprimidas
```

---

## Tareas pendientes opcionales

- [ ] Verificar visualmente reemplazo de terminologías en TODOS los giros (5 hechos OK, 5 sin verificar visualmente con motor V2 desplegado tras V14.8)
- [ ] Bootstrap automático de productos demo al crear cuenta (no implementado)
- [ ] Instrumentar `data-i18n` exactos en 200+ elementos del POS (modo aggressive cubre, pero pin-point sería mejor)
- [ ] Rotar JWT_SECRET + ADMIN_API_KEY (estuvieron en git history)
- [ ] Configurar Sentry DSN real
- [ ] Cleanup tablas `_backup_*pre_giros1200` en Supabase (3 backups viejos)

---

## Comandos clave

```bash
# Local dev
node server.js                                # :3000

# E2E
node scripts/e2e.mjs                          # contra prod
node scripts/e2e.mjs http://localhost:3000    # contra local

# Seed terminologías
node scripts/seed-terminologias-to-supabase.mjs

# Deploy
git push                                       # Vercel auto-deploya
```

---

## Para retomar

1. Lee este archivo
2. Lee `~/.claude/CLAUDE-SETUP-PORTABLE.md` (sección 1 diagnóstico)
3. Lee `CLAUDE.md` del proyecto (4166B reglas oro)
4. Aplica caveman full mode
5. Continúa con tareas pendientes o nueva tarea del user

---

_Generado: 2026-05-22 · Sesión V14.0 → V14.8 · ~150 mensajes_
