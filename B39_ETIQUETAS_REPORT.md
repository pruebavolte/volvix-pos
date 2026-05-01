# B39 — Etiqueta Designer: Backend Persistence + Real Thermal Print

**Status**: COMPLETE
**Date**: 2026-04-27

---

## 1. Backend Endpoints Added

All five endpoints live inside the `attachB36Handlers()` IIFE in
`api/index.js` (so they inherit the helpers `b36Tenant`, `b36IsSuperadmin`,
`b36ToNum`, `b36ParseDate`). They follow the same patterns as `cuts`, etc:
`requireAuth()` + `withIdempotency()` for POST + `rateLimit()` + `logAudit()`.

| Method | Path                              | File `api/index.js` line | Notes |
|--------|-----------------------------------|--------------------------|-------|
| GET    | `/api/label-templates`            | 13026 | Lists tenant's non-deleted templates, ordered by `updated_at desc` |
| GET    | `/api/label-templates/:id`        | 13044 | Single template, tenant-scoped 404 |
| POST   | `/api/label-templates`            | 13060 | Idempotent. Sanitizes `elements[]` (whitelist of fields, max 500 elements). Returns 201 |
| PATCH  | `/api/label-templates/:id`        | 13098 | Partial update. Validates each field. 404 if not owned by tenant |
| DELETE | `/api/label-templates/:id`        | 13153 | Soft-delete (sets `deleted_at`). Returns `{ ok: true, deleted: true }` |

Internal helper `b36LabelSanitizeElements()` is at `api/index.js:13013`.

**Auth / Tenant isolation:**
- All routes require JWT (`requireAuth` middleware).
- `tenant_id` is read from `req.user.tenant_id`, NEVER from request body.
- `req.user.tenant_id` mismatch → returns 404 (not 403, to avoid info leak).
- `superadmin` role can read across tenants.

**Validation:**
- `name`: required, sanitized, max 200 chars.
- `notes`: optional, max 2000 chars.
- `canvas_w`/`canvas_h`: 1..4000 px range.
- `elements`: hard-cap of 500, every element re-shaped to a whitelist.
- Bodies capped at 512 KB; rate limited 60/min create, 120/min patch.

**Existing `/api/printer/raw`** (`api/index.js:5338`) was NOT modified. The
new frontend uses it directly to send ESC/POS payloads.

---

## 2. SQL Migration

**File**: `migrations/label-templates.sql`

Schema (matches user spec exactly):

```
label_templates(
  id UUID PK,
  tenant_id TEXT NOT NULL,        -- per spec: TEXT, e.g. "TNT001"
  user_id UUID,
  name TEXT NOT NULL (1..200),
  notes TEXT,
  elements JSONB NOT NULL DEFAULT '[]',
  canvas_w INTEGER (1..4000),
  canvas_h INTEGER (1..4000),
  paper_size TEXT,
  printer_target TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
)
```

Includes:
- Indexes on `tenant_id`, `(tenant_id, user_id)`, `(tenant_id, updated_at DESC)`,
  `(tenant_id, lower(name))`, all partial WHERE `deleted_at IS NULL`.
- `updated_at` trigger.
- Best-effort audit trigger (writes to `volvix_audit_log` if table exists).
- RLS policies:
  - `label_templates_iso_read`: tenant members read own non-deleted rows.
  - `label_templates_iso_write`: tenant members CRUD inside their tenant
    (roles `superadmin / owner / admin / manager / cajero / cashier`).
  - `label_templates_iso_admin`: superadmin cross-tenant read.
- Wrapped in `BEGIN; ... COMMIT;` (matches `cuts.sql` style).

Apply with:
```
supabase db query --linked --file migrations/label-templates.sql
```

---

## 3. Frontend Changes — `etiqueta_designer.html`

**Topbar buttons** (lines 351-354):
- Added `data-wired="true"` to every button so `volvix-tools-wiring.js` no
  longer hijacks the inline `onclick` handlers (it was overriding
  `saveTemplate()` with a generic `etiquetaGuardar()` that looked for
  `#designer` and produced "No hay diseñador" toasts).
- Added new button: `📂 Cargar plantilla` → `openTemplatesModal()`.

**Canvas element** (line 432):
- Added `data-designer="etiqueta"` so even legacy code paths in
  `volvix-tools-wiring.js` (which queries `[data-designer]`) find the
  designer area and stop emitting "No hay diseñador".

**Functions modified / added** (line numbers AFTER edit):

| Function                         | Line  | What it does |
|----------------------------------|-------|--------------|
| `_getAuthToken()`                | ~803  | Resolves JWT from `Volvix.auth`, `VolvixAuth`, or localStorage |
| `_authFetch(url, opts)`          | ~815  | Wraps fetch with Bearer + auto Idempotency-Key on writes |
| `_setBtnLoading(btn, on, label)` | ~836  | Spinner + disabled state on action buttons |
| `saveTemplate()` (rewritten)     | 857   | localStorage cache + POST `/api/label-templates`; spinner; 401 redirect; toast on success/error |
| `_buildEscPosFromElements()`     | 931   | ESC/POS commands: text alignment, double-size, bold, CODE128 barcode, QR Code |
| `_loadHtml2Canvas()`             | ~991  | Lazy CDN load of html2canvas 1.4.1 |
| `_captureCanvasAsBase64()`       | ~1002 | html2canvas screenshot → base64 PNG (without data: prefix) |
| `printEtiqueta()` (rewritten)    | 1013  | "Convirtiendo…" → "Enviando…" → "Impreso ✓"; POSTs ESC/POS + image to `/api/printer/raw`; falls back to `window.print()` on 404/503/network |
| `openTemplatesModal()`           | 1095  | Modal with list of saved templates, fetched via GET `/api/label-templates` |
| `loadTemplateFromBackend(id)`    | 1146  | GET `/api/label-templates/:id`, restores elements + canvas dims |
| `deleteTemplateFromBackend(id)`  | 1176  | Confirm + DELETE `/api/label-templates/:id`, refreshes list |
| `_etiquetaDesignerHardening()` IIFE | 1254 | Hides notification bell + clears stale "No hay diseña" toasts |

**Behavior:**
- `saveTemplate()` always writes to `localStorage['volvix:etiqueta-template']`
  (offline cache preserved per constraint), then attempts the backend POST.
  Network failure → toast "⚠️ Sin conexión. Guardada solo en este
  dispositivo." 401 → redirects to `/login.html?expired=1&redirect=...`.
- `printEtiqueta()`:
  1. Builds ESC/POS payload from `elements[]` (sorted by `y`).
  2. Captures canvas via html2canvas (loaded on demand from CDN if absent).
  3. POSTs both `data` (base64 ESC/POS) AND `image_png_base64` to
     `/api/printer/raw` so the future Print Bridge can pick whichever it
     prefers.
  4. On 404/503/network failure → `window.print()` fallback (so legacy
     users without the bridge keep working).

---

## 4. "No hay diseña" 16-badge investigation

**Root cause:**
- `volvix-tools-wiring.js` runs every 2s scanning `button:not([data-wired])`
  and rebinds anything matching the text "Imprimir / Guardar plantilla /
  Cargar plantilla". The replacement handlers (`window.etiquetaGuardar`,
  `window.etiquetaImprimir`) all do
  `document.querySelector('#designer, .designer-area, [data-designer]')`
  and, if not found, emit a `VolvixUI.toast('No hay diseñador')`.
- Volvix POS topbar didn't expose any element matching that selector inside
  `etiqueta_designer.html`, so EVERY 2-second sweep was potentially
  generating one of these toasts under certain auto-clicks.
- The badge **16** was the unread count from `volvix-notifications-wiring.js`
  (line 222: `badge.textContent = unread > 99 ? '99+' : String(unread)`),
  showing the accumulated noise.

**Fix applied:**
1. Added `data-wired="true"` to the four topbar buttons (line 351-354) so
   the auto-wirer skips them.
2. Added `data-designer="etiqueta"` to the canvas (line 432) so even if the
   auto-wirer fires, `querySelector('[data-designer]')` succeeds and no
   "No hay diseñador" toast is produced.
3. New IIFE `_etiquetaDesignerHardening()` (~line 1254):
   - Hides the floating notifications bell + badge (this page is a
     designer, not a notification panel — per spec).
   - On load, filters `localStorage['volvix:notifications']` to drop any
     stale entries whose message contains "no hay diseñ", which clears the
     accumulated badge from previous sessions.
   - Re-runs at 0/500/2000/4000 ms because some wirings re-create the bell
     async on DOMContentLoaded.

---

## 5. How to test

### Backend smoke test (with a tenant JWT)
```bash
TOKEN="..."  # JWT for a tenant user

# List (empty initially)
curl -sH "Authorization: Bearer $TOKEN" \
  https://salvadorexoficial.com/api/label-templates

# Create
curl -sX POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-$(date +%s)" \
  -d '{"name":"Demo 50x30","elements":[{"type":"name","text":"Coca","x":10,"y":10}],"canvas_w":300,"canvas_h":180}' \
  https://salvadorexoficial.com/api/label-templates

# Patch
curl -sX PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo renombrada"}' \
  https://salvadorexoficial.com/api/label-templates/<UUID>

# Delete
curl -sX DELETE -H "Authorization: Bearer $TOKEN" \
  https://salvadorexoficial.com/api/label-templates/<UUID>
```

### Frontend manual walkthrough
1. Open `etiqueta_designer.html` while logged in.
2. The notifications bell with badge "16" should be hidden.
3. Drag a few components onto the canvas.
4. Click `💾 Guardar plantilla` → enter a name → spinner runs → toast
   "✓ Plantilla guardada".
5. Refresh the page.
6. Click `📂 Cargar plantilla` → modal lists the previously saved template.
7. Click `Cargar` → canvas restores.
8. Click `Eliminar` → confirm → list updates.
9. Click `🖨️ Imprimir` → button shows "Convirtiendo…" then "Enviando…".
   - If a print bridge is reachable: toast "✓ Impreso".
   - If not: toast "🖨️ Impresora no disponible. Usando vista de
     impresión..." then opens the browser print dialog.
10. Disconnect network, click `💾 Guardar plantilla` → toast warns "Sin
    conexión. Guardada solo en este dispositivo." (localStorage cache
    intact).

### SQL apply
```bash
supabase db query --linked --file migrations/label-templates.sql
```

---

## 6. Verification

```
node --check api/index.js                          # PASS (no output)
python -c "import html.parser; ..."                # HTML parses OK
SQL parens balanced 55/55, $$ tokens 4 (even)      # OK
```

Endpoints registered (grep confirms):
```
13026  GET    /api/label-templates
13044  GET    /api/label-templates/:id
13060  POST   /api/label-templates
13098  PATCH  /api/label-templates/:id
13153  DELETE /api/label-templates/:id
```

---

## 7. TODOs / Future improvements

- **Print bridge real driver**: `/api/printer/raw` is currently
  `audit_only: true` (line 5380 in `api/index.js`). The bytes are accepted
  and logged but not relayed (the bridge at `127.0.0.1:9101` must do it).
  Frontend already handles 404/503/200 paths correctly.
- **Thumbnail preview**: the modal currently shows "N ítems" instead of a
  real preview. We could store a base64 PNG thumbnail (via html2canvas)
  alongside the template. Optional — adds bytes to the row.
- **Versioning**: `PATCH` overwrites `elements`. If lost-update protection
  is needed, add an `If-Match: <updated_at>` header check.
- **Template categories / tags**: not in scope; can be added as JSONB
  metadata column later without migration breakage.
- **i18n for the modal**: hard-coded Spanish, matches the rest of the file.
- **Unit tests**: backend endpoints have no Jest/Vitest coverage yet
  (project uses manual + Playwright).

---

## Files touched

| File                                            | Change |
|-------------------------------------------------|--------|
| `api/index.js`                                  | +180 lines around 13007–13186 (new endpoints + helper) |
| `etiqueta_designer.html`                        | Topbar buttons (line 351-354), canvas (line 432), full rewrite of save/print + new modal + hardening IIFE (~lines 800–1300) |
| `migrations/label-templates.sql`                | NEW (122 lines) |
| `B39_ETIQUETAS_REPORT.md`                       | NEW (this report) |

No other files were modified. `auth-gate.js`, `volvix-feature-flags.js`,
`volvix-tools-wiring.js`, `volvix-notifications-wiring.js`, and other
shared libs were intentionally left untouched per constraints.
