# Claude Code Watchdog – volvix-pos (modo sesión específica)

Sistema que **mantiene viva UNA sesión específica de Claude Code**, identificada por su UUID.
Si esa sesión se cierra (crash, freeze de Windows, etc.), la **vuelve a abrir con
`claude --resume <UUID> "continua"`** para que retome exactamente donde estaba.

**No** revive cualquier sesión vieja del proyecto — solo la indicada en `session-id.txt`.

## Configuración actual

| Archivo | Contenido |
|---|---|
| `session-id.txt` | UUID de la sesión a vigilar |
| `target.txt`     | Path absoluto del worktree donde corre la sesión |

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `claude-watcher.ps1` | El loop principal. Verifica cada 20 s y relanza si Claude no está. |
| `start-watcher.ps1`  | Arranca el watcher en background oculto. No duplica si ya está corriendo. |
| `stop-watcher.ps1`   | Detiene el watcher (limpiamente vía STOP flag, y como respaldo lo mata). |
| `status.ps1`         | Muestra estado del watcher, de Claude Code y últimas líneas del log. |
| `install-task.ps1`   | Registra una **Scheduled Task** que arranca el watcher al login + cada 5 min como respaldo. |
| `uninstall-task.ps1` | Quita la Scheduled Task y detiene el watcher. |
| `watcher.log`        | Log rotativo (se trunca a 5 MB). |
| `watcher.pid`        | PID del watcher activo (auto-creado). |
| `state.json`         | Último estado conocido (auto-creado). |
| `STOP-WATCHER.flag`  | Crea este archivo para detener el watcher de forma limpia. |

## Uso rápido

```powershell
# 1. Iniciar AHORA (sin esperar al login)
powershell -ExecutionPolicy Bypass -File "D:\github\volvix-pos\.claude-watchdog\start-watcher.ps1"

# 2. Registrar para que arranque solo al login (recomendado)
powershell -ExecutionPolicy Bypass -File "D:\github\volvix-pos\.claude-watchdog\install-task.ps1"

# 3. Ver estado
powershell -ExecutionPolicy Bypass -File "D:\github\volvix-pos\.claude-watchdog\status.ps1"

# 4. Detener
powershell -ExecutionPolicy Bypass -File "D:\github\volvix-pos\.claude-watchdog\stop-watcher.ps1"

# 5. Desinstalar completamente
powershell -ExecutionPolicy Bypass -File "D:\github\volvix-pos\.claude-watchdog\uninstall-task.ps1"
```

## Cómo funciona

1. El watcher lee `session-id.txt` y `target.txt` en cada iteración (puedes cambiarlos en caliente).
2. Cada 20 s busca procesos `claude.exe` que tengan **exactamente** `--resume <UUID>` en su línea de comando.
3. Si **no hay ninguno**, verifica que el JSONL existe en `~/.claude/projects/.../<UUID>.jsonl`.
4. Si existe, abre una nueva ventana de PowerShell con:
   ```
   cd <worktree>
   claude --resume <UUID> "continua"
   ```
5. `--resume <UUID>` reanuda **esa sesión exacta** (manteniendo el mismo UUID, sin fork).
6. Tras relanzar, espera 90 s antes de volver a verificar (cooldown).
7. Si falla 6 veces seguidas, pausa 10 minutos (anti-loop).

## Cambiar la sesión objetivo

Tres opciones:

```powershell
# A) Auto-detectar la sesion claude.exe activa AHORA y fijarla
powershell -File "D:\github\volvix-pos\.claude-watchdog\set-session.ps1"

# B) Pasarla explícita
powershell -File "D:\github\volvix-pos\.claude-watchdog\set-session.ps1" `
    -SessionId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
    -Worktree  "D:\github\volvix-pos\.claude\worktrees\xxxx"

# C) Editar a mano session-id.txt y target.txt
```

El watcher relee los archivos en máximo 20 segundos.

## Configuración

Edita las variables al inicio de `claude-watcher.ps1`:

| Variable | Por defecto | Qué hace |
|---|---|---|
| `$CheckIntervalSec` | 20 | Segundos entre verificaciones |
| `$RelaunchCooldownSec` | 90 | Espera tras relanzar |
| `$MaxFailuresInRow` | 6 | Fallos seguidos antes de pausa larga |
| `$LongPauseMin` | 10 | Minutos de pausa larga |
| `$ContinuePrompt` | `continua` | Prompt inicial al relanzar |
