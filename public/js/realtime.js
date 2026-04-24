// Volvix POS — Supabase Realtime client
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://zhvwmzkcqngcaqpdxtwr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodndtemtjcW5nY2FxcGR4dHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNjcwMTgsImV4cCI6MjA3OTc0MzAxOH0.ygTc754INgqYJEMD0wc_CzRCzRxUfp4hq3rYvJRpjkk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Subscribe to real-time changes on a Supabase table
 * @param {string} table - Table name (e.g. 'volvix_ventas')
 * @param {function} callback - Called with {event, new, old} on change
 * @param {string|null} tenantId - Optional tenant_id filter
 * @returns {object} Supabase channel (call .unsubscribe() to stop)
 */
export function subscribeToTable(table, callback, tenantId = null) {
  const channelName = `realtime:${table}${tenantId ? ':' + tenantId : ''}`;
  const config = { event: '*', schema: 'public', table };
  if (tenantId) config.filter = `tenant_id=eq.${tenantId}`;

  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', config, callback)
    .subscribe((status) => {
      console.log(`[Realtime] ${table} → ${status}`);
    });

  return channel;
}
