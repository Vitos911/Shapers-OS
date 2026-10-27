import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
export const uid = n => `31000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const mid = n => `32000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const sid = n => `33000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export async function timerDatabase({ beforeWorkspaces } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb,is_anonymous boolean default false,banned_until timestamptz);
    create table auth.identities(user_id uuid,provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,service_role,anon;
    create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin return; end $$;`);
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter(n => n.endsWith('.sql')).sort()) {
    if(file.endsWith('_wemryos_workspaces.sql') && beforeWorkspaces)await beforeWorkspaces(db);
    await db.exec(await readFile(new URL(file,directory),'utf8'));
  }
  for (let n=1;n<=6;n++) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(n),`timer${n}@fixture.invalid`]);
    await db.query("insert into public.members(id,name,email,tier,weekly_hours,auth_user_id) values($1,$2,$3,'GO!',4,$4)",[mid(n),`Timer ${n}`,`timer${n}@fixture.invalid`,uid(n)]);
    await db.query('insert into org_private.access(email,role,member_id,auth_user_id) values($1,$2,$3,$4)',[`timer${n}@fixture.invalid`,n===1?'SUPERADMIN':n===2?'ADMIN':'MEMBER',mid(n),uid(n)]);
  }
  async function as(n, sql, args=[]) {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);
    try { return await db.query(sql,args); }
    finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); }
  }
  const timer = async (n,action,id,version=null) => (await as(n,'select org_work_timer($1,$2,$3) result',[action,id,version])).rows[0].result;
  const state = async n => (await as(n,'select org_work_state() result')).rows[0].result;
  return { db, as, timer, state };
}
