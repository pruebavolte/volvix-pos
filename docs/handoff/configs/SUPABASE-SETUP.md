# Supabase Setup
Proyecto actual: zhvwmzkcqngcaqpdxtwr (salvadorexoficial)

## Clon nueva máquina
1. supabase login
2. supabase link --project-ref zhvwmzkcqngcaqpdxtwr
3. Aplicar migrations: ls migrations/r*.sql | xargs -I{} supabase db query --linked < {}
4. Verificar: supabase db query --linked -c "SELECT count(*) FROM pos_users"

## Backup actual
supabase db dump --linked > backup-$(date +%Y%m%d).sql
