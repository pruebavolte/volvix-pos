# R14 — Cómo ejecutar SQL en Supabase (manual)

## Resumen

La REST API de Supabase NO acepta DDL directamente. Probé:
- `POST /pg/query` → 404
- `POST /rest/v1/rpc/exec_sql` → 404 (función no existe)
- `POST /rest/v1/rpc/query` → 404 (función no existe)

**Conclusión**: hay que ejecutar los SQL desde el **SQL Editor del Dashboard** de Supabase.

## Archivo listo para copy/paste

`db/R14_ALL_COMBINED.sql` (3182 líneas) ya contiene los 22 archivos en orden seguro:

1. R14_INDEXES.sql
2. R14_INVENTORY.sql
3. R14_LOYALTY.sql
4. R14_PAYMENTS.sql
5. R14_CFDI_TABLES.sql
6. R14_REPORTS_VIEWS.sql
7. R14_REALTIME.sql
8. R14_EMAIL_LOG.sql
9. R14_ERROR_LOG.sql
10. R14_AUDIT_GDPR.sql
11. R14_CURRENCIES.sql
12. R14_PUSH_SUBS.sql
13. R14_PRINTERS.sql
14. R14_AI_LOG.sql
15. R14_SAT_CATALOGS.sql
16. R14_WEBHOOKS.sql
17. R14_MFA.sql
18. R14_SUBSCRIPTIONS.sql
19. R14_VERTICAL_TEMPLATES.sql
20. R14_API_KEYS.sql
21. R14_CUSTOMER_AUTH.sql
22. R13_RLS_POLICIES.sql (al final, depende de las tablas)

Cada archivo va separado por `--- next file ---`.

## Pasos

1. Abre https://supabase.com/dashboard/project/zhvwmzkcqngcaqpdxtwr/sql/new
2. Abre `db/R14_ALL_COMBINED.sql` en VS Code, copia todo (Ctrl+A, Ctrl+C).
3. Pega en el SQL Editor.
4. Click **Run** (Ctrl+Enter).
5. Si algún bloque falla por dependencia, ejecútalo aislado más tarde — el resto se commitea por bloques entre `--- next file ---`.

## Alternativa: ejecutar archivo por archivo

Si el bloque combinado es demasiado grande, copia cada archivo individual en orden y ejecútalo por separado. Conviene si quieres aislar errores.

## Alternativa avanzada (opcional): crear `exec_sql` y luego usar API

Para futuras runs vía REST, ejecuta UNA vez en el SQL Editor:

```sql
create or replace function public.exec_sql(sql text)
returns void language plpgsql security definer as $$
begin execute sql; end; $$;
revoke all on function public.exec_sql(text) from public, anon, authenticated;
```

Después podrás hacer:
```bash
curl -X POST "$URL/rest/v1/rpc/exec_sql" \
  -H "apikey: $SVC" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d '{"sql":"create table ..."}'
```
**Nota de seguridad**: `exec_sql` con service-role es ejecución arbitraria. Quítalo cuando termines.
