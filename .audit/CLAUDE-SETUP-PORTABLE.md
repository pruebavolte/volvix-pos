# 🛠️ Setup Universal Claude Code · v2.0 (UNIFICADO)

> **Pega este archivo a CUALQUIER sesión/proyecto nuevo.** Activa: anti-tokens + caveman + RTK + ccusage + skills + MCPs.

---

## ⚡ INVOCACIÓN INICIAL (pega esto al abrir cualquier sesión)

```
Lee ~/.claude/CLAUDE-SETUP-PORTABLE.md.
Ejecuta diagnóstico sección 1. Reporta tabla.
Aplica TODAS las reglas el resto de la sesión.
Si falta algo, INSTÁLALO o pide permiso.
```

---

## 1. DIAGNÓSTICO INICIAL — verifica + reporta tabla

| # | Item | Comando | Si falta |
|---|------|---------|----------|
| 1 | Caveman mode | confirmar activo | Activar AHORA nivel full, persiste sesión |
| 2 | RTK (compress bash) | `which rtk` o `rtk --version` | `curl -fsSL https://raw.githubusercontent.com/Swatinem/rtk/main/install.sh \| sh && rtk init --global` |
| 3 | ccusage (gasto) | `which ccusage` | `npm install -g @ryoppippi/ccusage` |
| 4 | CLAUDE.md global | `ls ~/.claude/CLAUDE.md` | Crear con sección 7 |
| 5 | CLAUDE.md proyecto | `ls CLAUDE.md` | Sugerir `/init` |
| 6 | .claudeignore | `ls .claudeignore` | Crear: `node_modules/`, `dist/`, `build/`, `*.log`, `package-lock.json`, `.env*`, `*.min.js`, `*.min.css`, `.git/`, `coverage/`, `.next/`, `.nuxt/`, `out/`, `target/`, `__pycache__/`, `.venv/` |
| 7 | CLAUDE.md size | `wc -c CLAUDE.md` | Si >5000 bytes → sugerir `/caveman-compress CLAUDE.md` |
| 8 | Modelo activo | reporte interno | Default Sonnet. `/model haiku\|sonnet\|opus` |
| 9 | Skills críticas | inventario | verify, code-review, security-review, napkin, system-architecture-audit, walkthrough, ready-to-ship, token-optimizer, ux-logic-audit |
| 10 | MCP servers | inventario | Chrome, computer-use, Preview, mcp-registry |

Reporta tabla ✅/❌. Si falla algo, instálalo. Cuando listo → READY.

---

## 2. CAVEMAN MODE (siempre)

- Responder TERSE: sin filler/pleasantries/articulos innecesarios
- NO "Por supuesto", "Excelente pregunta", "Aquí está"
- Directo: comando + output + 1-line resumen
- Tablas > prosa. Bullets > párrafos
- Respuesta simple: 1 línea
- Persiste TODA la sesión. Nivel full

---

## 3. REGLAS ANTI-TOKENS

### Archivos
```
❌ cat archivo.md              ✅ head -50 archivo.md
❌ Read sin view_range          ✅ wc -l ANTES → Read con view_range
❌ ls -laR                      ✅ find . -name "*.ext" | head -20
❌ Leer archivo completo        ✅ grep -n "patrón" → leer solo líneas
```

### Git
```
❌ git log                      ✅ git log -5 --oneline
❌ git diff (largo)             ✅ git diff --stat primero
❌ git status -uall             ✅ git status -s
```

### Comandos verbosos
```
❌ npm install (1000 líneas)    ✅ npm install 2>&1 | tail -20
❌ npm test                     ✅ npm test 2>&1 | grep -E "FAIL|PASS|✓|✗"
❌ build sin filtro             ✅ build | tail -30
```

### Reportes
```
❌ Prosa larga                  ✅ Tabla 10 filas
❌ Copiar contexto previo       ✅ "como dijimos arriba"
❌ Listar todo                  ✅ Checklist - [x] / - [ ]
```

### RTK (si instalado)
- TODOS los bash usar `rtk` prefix: `rtk git status`, `rtk ls`, `rtk npm test`
- Init una vez: `rtk init --global`

---

## 4. SKILLS — cuándo invocar

### Antes de tarea grande
- `/Plan` — diseñar antes de tocar
- `/system-architecture-audit` — mapear multi-app
- `/token-optimizer` — paralelización

### Durante
- `/napkin` — lecciones errores repetidos
- `/auto-model-router` — auto-modelo

### Después de cambios
- `/code-review` — reuso/calidad
- `/verify` — confirmar fix corriendo app
- `/walkthrough` — verificar botón×handler
- `/ux-logic-audit` — pantalla×pantalla humano

### Antes de merge
- `/security-review` — security audit
- `/adversarial-reviewer` (agent) — Saboteur/NewHire/Security
- `/ready-to-ship` — READY/NOT READY con razones

### Documentos
- `/pdf` `/docx` `/xlsx` `/pptx`

### Workflow
- `/loop` — recurrente
- `/schedule` — cron remoto
- `/session-manager` — snapshot
- `/fewer-permission-prompts` — auto-allowlist
- `/init` `/update-config` `/skill-creator`

---

## 5. MCP SERVERS

| MCP | Cuándo |
|-----|--------|
| Chrome | E2E web, screenshots, login flows |
| computer-use | Apps nativas no-browser |
| Preview | HTML headless rápido |
| mcp-registry | Buscar nuevos MCPs |

Loadear via ToolSearch solo cuando se necesite. NO preload todo.

---

## 6. MODELO POR TAREA

| Tarea | Modelo |
|-------|--------|
| Búsqueda, formato, lista, conversión simple | Haiku |
| Refactor, debugging típico, tests | Sonnet (default) |
| Arquitectura, security crítico, bug >2 fails | Opus |
| Migración masiva >500 líneas | Opus |

`/model haiku|sonnet|opus`

---

## 7. CLAUDE.md global mínimo (`~/.claude/CLAUDE.md`)

```markdown
# Reglas globales

Lee CLAUDE-SETUP-PORTABLE.md para detalle completo.

## Activos siempre
- Caveman mode (terse, no filler)
- RTK para bash (si instalado)
- ccusage monitor disponible

## Anti-tokens críticos
1. wc -l antes de Read >500 líneas
2. git log -5 --oneline (NUNCA sin límite)
3. Outputs verbosos → tail -20 / grep
4. Tablas no prosa
5. RTK prefix en bash

## Prohibido sin permiso
- git push --force / git reset --hard
- rm -rf
- Modificar .env / secretos
- Crear archivos en /public/
- Cambiar package.json deps
- Commit con secrets
- Aprobar términos legales

## Siempre
- Mostrar diff antes commit
- Probar fix corriendo app
- Decir "NO SÉ" si no info
- Confirmar destructive
- Reportar honestamente

## Modelo
Haiku: simple · Sonnet: default · Opus: complejo
```

---

## 8. ANTI-PATRONES UNIVERSALES

NUNCA sin permiso:
- `git push --force` / `git reset --hard` / `rm -rf`
- Modificar `.env`, secretos, API keys
- Commit con secrets
- Crear en `/public/` o paths expuestos
- Cambiar `package.json` deps
- Aprobar términos en sitios
- Borrar archivos

SIEMPRE:
- Diff antes commit
- Probar fix (no asumir)
- "NO SÉ" si no info
- Confirmar destructive
- Reportar honesto (si falló, decirlo)

---

## 9. SELF-CHECK fin de sesión

- [ ] Cambios commiteados?
- [ ] Tests pasan?
- [ ] Build pasa?
- [ ] TODOs documentados?
- [ ] Deuda técnica anotada?
- [ ] `/session-save` para retomar?
- [ ] Secretos a rotar?

---

## 10. REGLA META

Task grande (>10 min sin avance / >5 archivos / >3 fixes cadena):
→ Pausar + `/Plan` o `/ExitPlanMode`

---

## 📋 PROMPT CORTO TLDR (para sesiones rápidas)

```
ACTIVA: caveman mode + RTK + ccusage + skills críticas.

VERIFICA: ~/.claude/CLAUDE-SETUP-PORTABLE.md → leer y aplicar.
Si no existe: instalar RTK + ccusage, crear CLAUDE.md + .claudeignore.

REGLAS: wc -l antes Read, git log -5, tail -20 outputs, tablas no prosa,
NO destructive sin permiso, NO modificar secretos.

Reporta tabla:
| Item | Status |
| caveman | ✅/❌ |
| RTK | ✅/❌ |
| ccusage | ✅/❌ |
| CLAUDE.md global | ✅/❌ |
| .claudeignore | ✅/❌ |
| Skills | lista |
| Modelo | actual |

Cuando listo → READY.
```

---

_v2.0 · 2026-05-22_
_Unifica: anti-tokens + caveman + RTK + ccusage + skills + MCPs_
_Universal: cualquier proyecto, cualquier sesión_
