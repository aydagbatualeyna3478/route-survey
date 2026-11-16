// Supabase Edge Function "admin-users": account actions that need the service key.
// Only an active admin signed in with the authenticator code (aal2) may call it.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const claims = (t: string) => {
  try { const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(p + '==='.slice((p.length + 3) % 4))); } catch { return {}; }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ message: 'POST only' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!key) { try { const s = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); key = s.default || Object.values(s)[0] as string || ''; } catch { /* none */ } }
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: werr } = await sb.auth.getUser(token);
    if (werr || !who?.user) return json({ message: 'Oturum geçersiz, tekrar giriş yap.' }, 401);
    const { data: me } = await sb.from('profiles').select('*').eq('id', who.user.id).single();
    if (!me || me.role !== 'admin' || !me.active || claims(token).aal !== 'aal2') return json({ message: 'Bu işlem için admin yetkisi gerekli.' }, 403);

    const b = await req.json();
    const log = (user_id: string | null, email: string | null, event: string, detail = '') =>
      sb.from('access_log').insert({ user_id, email, event, detail: (detail ? detail + ' · ' : '') + 'admin: ' + me.email });
    const target = async (id: string) => {
      const { data } = await sb.from('profiles').select('*').eq('id', id).single();
      if (!data) throw new Error('Kullanıcı bulunamadı.');
      return data;
    };
    const admins = async () => (await sb.from('profiles').select('id').eq('role', 'admin').eq('active', true)).data?.length || 0;
    const pwOk = (p: string) => typeof p === 'string' && p.length >= 8;

    switch (b.action) {
      case 'create': {
        const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ message: 'Mail adresi geçersiz.' }, 400);
        if (!pwOk(b.password)) return json({ message: 'Şifre en az 8 karakter olmalı.' }, 400);
        const { data, error } = await sb.auth.admin.createUser({ email, password: b.password, email_confirm: true, user_metadata: { full_name: b.full_name || '' } });
        if (error) return json({ message: /already/i.test(error.message) ? 'Bu mail ile bir hesap zaten var.' : error.message }, 400);
        await sb.from('profiles').upsert({ id: data.user.id, email, full_name: b.full_name || '', role: b.role === 'admin' ? 'admin' : 'user' });
        await log(data.user.id, email, 'user_created', b.role === 'admin' ? 'admin' : 'kullanıcı');
        return json({ ok: true, id: data.user.id });
      }
      case 'set_password': {
        const t = await target(b.id);
        if (!pwOk(b.password)) return json({ message: 'Şifre en az 8 karakter olmalı.' }, 400);
        const { error } = await sb.auth.admin.updateUserById(t.id, { password: b.password });
        if (error) return json({ message: error.message }, 400);
        await log(t.id, t.email, 'password_set');
        return json({ ok: true });
      }
      case 'disable':
      case 'enable': {
        const t = await target(b.id);
        if (t.id === me.id) return json({ message: 'Kendi hesabını kapatamazsın.' }, 400);
        const off = b.action === 'disable';
        if (off && t.role === 'admin' && await admins() <= 1) return json({ message: 'Son admin kapatılamaz.' }, 400);
        const { error } = await sb.auth.admin.updateUserById(t.id, { ban_duration: off ? '876000h' : 'none' });
        if (error) return json({ message: error.message }, 400);
        await sb.from('profiles').update({ active: !off }).eq('id', t.id);
        await log(t.id, t.email, off ? 'user_disabled' : 'user_enabled');
        return json({ ok: true });
      }
      case 'delete': {
        const t = await target(b.id);
        if (t.id === me.id) return json({ message: 'Kendi hesabını silemezsin.' }, 400);
        if (t.role === 'admin' && await admins() <= 1) return json({ message: 'Son admin silinemez.' }, 400);
        const { error } = await sb.auth.admin.deleteUser(t.id);
        if (error) return json({ message: error.message }, 400);
        await log(null, t.email, 'user_deleted');
        return json({ ok: true });
      }
      case 'mfa_reset': {
        const t = await target(b.id);
        const { data, error } = await sb.auth.admin.mfa.listFactors({ userId: t.id });
        if (error) return json({ message: error.message }, 400);
        for (const f of data.factors || []) await sb.auth.admin.mfa.deleteFactor({ userId: t.id, id: f.id });
        await log(t.id, t.email, 'mfa_reset');
        return json({ ok: true });
      }
      case 'set_role': {
        const t = await target(b.id);
        if (t.id === me.id) return json({ message: 'Kendi yetkini değiştiremezsin.' }, 400);
        const role = b.role === 'admin' ? 'admin' : 'user';
        if (role === 'user' && t.role === 'admin' && await admins() <= 1) return json({ message: 'Son admin kaldırılamaz.' }, 400);
        await sb.from('profiles').update({ role }).eq('id', t.id);
        await log(t.id, t.email, 'role_changed', role);
        return json({ ok: true });
      }
      default:
        return json({ message: 'Bilinmeyen işlem.' }, 400);
    }
  } catch (e) {
    return json({ message: (e as Error).message || 'Hata' }, 500);
  }
});
