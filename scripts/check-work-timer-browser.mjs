/** Real Next HTTP handlers + real PostgreSQL RLS/RPCs + Chromium.
 * Only Supabase Auth/PostgREST transport is a local adapter with synthetic users.
 * Never connects to hosted Supabase or Vercel.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { timerDatabase, uid, mid } from '../tests/fixtures/work-timer-db.mjs';
import { analytics, ljubljanaDate, weekStart } from '../lib/organization.ts';
const {db,as,state}=await timerDatabase();
const origin='http://127.0.0.1:3251', errors=[], commands=[], checks=[];
const users=Object.fromEntries([1,2,3,4,5].map(n=>[n,{id:uid(n),email:`timer${n}@fixture.invalid`,aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[]} ]));
const token=n=>`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:uid(n),exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})).toString('base64url')}.fixture`;
const rpcArgs={wemry_workspaces:[],wemry_presence:["p_connection","p_active","p_disconnect"],org_project_membership:["p_project","p_action","p_member"],org_claim_task:["p_task"],org_context:[],org_task_directory:[],org_work_state:[],org_work_timer:['p_action','p_session_id','p_expected_version','p_project_id','p_description'],org_admin_work:['p_id','p_member_id','p_date','p_hours','p_description','p_project_id','p_reason','p_expected_updated_at','p_deleted'],org_leaderboard_source:['as_of']};
const tables=new Set(['organization_settings','organization_groups','members','org_projects','org_tasks','org_work_entries','org_weekly_hours','org_meetings','org_attendance','org_task_history','org_project_members','org_meeting_members','org_settings','org_audit','org_leaderboard_weeks','org_project_join_requests','org_project_membership_history']);
let queue=Promise.resolve();
const adapter=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,x-supabase-api-version');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');
  if(req.method==='OPTIONS') {res.writeHead(204).end();return;}
  let raw='';for await(const c of req) raw+=c;
  const run=async()=>{
    try {
      const path=new URL(req.url,'http://local').pathname, authorization=req.headers.authorization||'';
      let n=0;try {n=[1,2,3,4,5].find(n=>JSON.parse(Buffer.from(authorization.split('.')[1],'base64url').toString()).sub===uid(n))||0;} catch { /* service/invalid bearer */ }
      const service=authorization==='Bearer sb_secret_fixture';
      const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(value));};
      if(path==='/auth/v1/user') {send(n?users[n]:{message:'Invalid synthetic token'},n?200:401);return;}
      const resource=path.split('/').at(-1),body=raw?JSON.parse(raw):{};
      const query=async(sql,args=[])=>{
        if(service) {await db.exec('set role service_role');try {return await db.query(sql,args);}finally {await db.exec('reset role');}}
        if(!n) throw Object.assign(new Error('Authentication required'),{code:'42501'});
        return as(n,sql,args);
      };
      if(path==='/rest/v1/shapers_workspaces'&&req.method==='GET') {send([]);return;}
      if(path.startsWith('/rest/v1/rpc/') && ['org_project_directory','org_project_progress','wemry_member_directory'].includes(resource)) {
        send((await query(`select * from public.${resource}()`)).rows); return;
      }
      if(path.startsWith('/rest/v1/rpc/') && rpcArgs[resource]) {
        const keys=Object.keys(body);assert.ok(keys.every(k=>rpcArgs[resource].includes(k)));
        const result=await query(`select public.${resource}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) result`,keys.map(k=>body[k]));
        const value=['org_task_directory'].includes(resource)?result.rows.map(r=>r.result):result.rows[0].result;
        send(value);return;
      }
      if(path.startsWith('/rest/v1/') && tables.has(resource)) {
        if(req.method==='GET') {
          let sql=`select * from public.${resource}`;
          if(resource==='org_audit')sql+=" where entity='org_work_entries' order by occurred_at desc limit 100";
          const rows=(await query(sql)).rows;send(req.headers.accept?.includes("vnd.pgrst.object")?rows[0]:rows);return;
        }
        if(resource==='org_tasks' && req.method==='PATCH') {
          const keys=Object.keys(body);assert.ok(keys.every(k=>['status','description','priority','due_date','assignee_id','archived','claimable','title','project_id'].includes(k)));
          const params=new URL(req.url,'http://local').searchParams;
          const id=params.get('id')?.replace(/^eq\./,''), updated=params.get('updated_at')?.replace(/^eq\./,'');
          const args=keys.map(k=>body[k]);args.push(id,updated);
          const result=await query(`update public.org_tasks set ${keys.map((k,i)=>k+'=$'+(i+1)).join(',')} where id=$${keys.length+1} and updated_at=$${keys.length+2} returning *`,args);
          send(result.rows[0] || {code:'PGRST116',message:'No matching row'},result.rows.length?200:406);return;
        }
        if(resource==='org_work_entries' && req.method==='POST') {
          await query('insert into public.org_work_entries(member_id,date,hours) values($1,$2,$3)',[body.member_id,body.date,body.hours]);send({});return;
        }
      }
      send({message:'Adapter route unavailable'},404);
    } catch(e) {res.writeHead(e.code==='42501'?403:400,{'Content-Type':'application/json'}).end(JSON.stringify({code:e.code||'ADAPTER',message:e.message}));}
  };
  queue=queue.then(run,run);
});
await new Promise(resolve=>adapter.listen(0,'127.0.0.1',resolve));
const supabase=`http://127.0.0.1:${adapter.address().port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3251'],{env:{...process.env,SUPABASE_URL:supabase,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture',APP_URL:origin},stdio:['ignore','pipe','pipe']});
let serverLog='';for(const stream of [server.stdout,server.stderr])stream.on('data',data=>{serverLog+=data.toString();});
let browser;
const output=new URL('../test-results/work-timer/',import.meta.url);
await mkdir(output,{recursive:true});
const api=async(n,path,method='GET',body)=>{
  const result=await fetch(origin+'/api/org/'+path,{method,headers:{Authorization:'Bearer '+token(n),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  return {status:result.status,body:await result.json()};
};
try {
  let ready=false;
  for(let i=0;i<100;i++) {try {ready=(await fetch(origin+'/api/health')).ok;}catch{} if(ready)break;await new Promise(r=>setTimeout(r,200));}
  assert.ok(ready,serverLog);
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  async function login(n) {
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const session={access_token:token(n),refresh_token:'fixture',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:users[n]};
    await context.route('**/api/supabase-config',route=>route.fulfill({json:{configured:true,url:supabase,publishableKey:'sb_publishable_fixture'}}));
    await context.addInitScript(session=>{ if(location.origin!=='null') localStorage.setItem('sb-127-auth-token',JSON.stringify(session)); },session);
    context.on('page',page=>{page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/api/org/work-timer')&&r.method()==='POST')commands.push(r.postDataJSON());});});
    const page=await context.newPage();await page.goto(origin+'/#hours');
    try {await page.getByRole('heading',{name:'Časovnik dela',exact:true}).waitFor();}catch(e){console.error((await page.locator('body').innerText()).slice(0,2000));throw e;}
    return {context,page};
  }
  const apiProbe=await api(3,'snapshot');assert.equal(apiProbe.status,200,JSON.stringify(apiProbe));
  let {context,page}=await login(3);
  const start=page.getByRole('button',{name:'START · Začni delo',exact:true});await start.waitFor();
  const second=await context.newPage();await second.goto(origin+'/#hours');
  await second.getByRole('button',{name:'START · Začni delo',exact:true}).waitFor();
  // Two tabs submit without seeing the other's newly committed state.
  await Promise.all([start.click(),second.getByRole('button',{name:'START · Začni delo',exact:true}).click()]);
  await page.getByRole('button',{name:'STOP · Zaključi delo',exact:true}).waitFor();
  await second.getByRole('button',{name:'STOP · Zaključi delo',exact:true}).waitFor();
  let current=await state(3);assert.equal(current.sessions.length,1);const id=current.sessions[0].id;
  checks.push('two concurrent browser START requests: one active SQL session');
  await page.reload();await page.getByRole('button',{name:'STOP · Zaključi delo',exact:true}).waitFor();assert.equal((await state(3)).sessions[0].id,id);
  await context.close();({context,page}=await login(3));await page.getByRole('button',{name:'STOP · Zaključi delo',exact:true}).waitFor();assert.equal((await state(3)).sessions[0].id,id);
  checks.push('reload and new authenticated browser context restore the same active session');
  await context.setOffline(true);await page.getByText(/Povezava je prekinjena/).waitFor();
  assert.equal(await page.getByRole('button',{name:'STOP · Zaključi delo',exact:true}).isDisabled(),true);
  assert.equal((await state(3)).sessions[0].state,'running');
  await context.setOffline(false);await page.getByRole('button',{name:'PAUSE · Premor',exact:true}).click();
  await page.getByRole('button',{name:'RESUME · Nadaljuj',exact:true}).waitFor();
  const pausedClock=await page.getByRole('timer').innerText();await page.waitForTimeout(1200);assert.equal(await page.getByRole('timer').innerText(),pausedClock);
  await page.getByRole('button',{name:'RESUME · Nadaljuj',exact:true}).click();await page.getByRole('button',{name:'PAUSE · Premor',exact:true}).waitFor();
  checks.push('offline commands disabled, reconnect resync, PAUSE excludes elapsed wall time, RESUME');
  let lost=false;
  await context.route('**/api/org/work-timer',async route=>{
    if(route.request().method()==='POST'&&route.request().postDataJSON().action==='stop'&&!lost) {lost=true;await route.fetch();await route.abort('failed');}else await route.continue();
  });
  await page.getByRole('button',{name:'STOP · Zaključi delo',exact:true}).click();await page.getByRole('button',{name:'START · Začni delo',exact:true}).waitFor();
  assert.equal(lost,true);current=await state(3);assert.equal(current.sessions.length,0);
  const stored=(await db.query('select * from org_work_entries where session_id=$1',[id])).rows;
  const finished=(await db.query('select * from org_work_sessions where id=$1',[id])).rows[0];
  const exact=stored.reduce((sum,r)=>sum+Number(r.hours)*3600,0);assert.ok(Math.abs(exact-Number(finished.duration_seconds))<0.00001);
  await page.reload();await page.getByRole('button',{name:'START · Začni delo',exact:true}).waitFor();
  checks.push('lost STOP response reconciles persisted duration, no duplicate ledger rows after reload');
  assert.equal((await api(3,'work','POST',{member_id:mid(3),date:'2026-10-20',hours:8,reason:'Forged'})).status,403);
  assert.equal((await api(3,'work','PATCH',{id:stored[0].id,hours:24})).status,403);
  assert.equal((await api(3,'work-timer','POST',{action:'start',session_id:crypto.randomUUID(),started_at:'2000-01-01T00:00:00Z'})).status,400);
  assert.equal((await api(3,'work-audit')).status,403);
  const direct=await fetch(supabase+'/rest/v1/org_work_entries',{method:'POST',headers:{Authorization:'Bearer '+token(3),'Content-Type':'application/json'},body:JSON.stringify({member_id:mid(3),date:'2026-10-20',hours:8})});assert.equal(direct.status,403);
  assert.equal((await fetch(origin+'/api/org/work-timer')).status,401);
  checks.push('MEMBER backdated POST/PATCH and direct table write denied; forged start time and unauthenticated API denied');
  for(const width of [390,768,1440]) {await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`MEMBER width ${width}`);}
  await page.screenshot({path:fileURLToPath(new URL('member.png',output))});await context.close();
  ({context,page}=await login(2));
  await page.getByRole('button',{name:'Administrativni vnos za nazaj',exact:true}).click();
  let editor=page.getByRole('dialog',{name:'Dodaj delovne ure',exact:true});
  await editor.locator('select[name=member_id]').selectOption(mid(3));await editor.getByLabel('Datum',{exact:true}).fill(weekStart(ljubljanaDate()));
  await editor.getByLabel('Ure',{exact:true}).fill('1.5');await editor.getByLabel('Opis',{exact:true}).fill('Browser API correction');
  await editor.getByLabel('Razlog administrativnega posega',{exact:true}).fill('Forgot to start; confirmed with member');
  await editor.getByRole('button',{name:'Shrani v Supabase',exact:true}).click();await editor.waitFor({state:'hidden'});
  await page.getByText('Forgot to start; confirmed with member',{exact:true}).waitFor();
  await page.reload();await page.getByText('Forgot to start; confirmed with member',{exact:true}).waitFor();await context.close();
  ({context,page}=await login(1));
  const row=page.getByRole('row').filter({hasText:'Browser API correction'});await row.getByRole('button',{name:'Uredi z razlogom',exact:true}).click();
  editor=page.getByRole('dialog');await editor.getByLabel('Ure',{exact:true}).fill('2.25');await editor.getByLabel('Razlog administrativnega posega',{exact:true}).fill('Supervisor verified correction');
  await editor.getByRole('button',{name:'Shrani v Supabase',exact:true}).click();await editor.waitFor({state:'hidden'});
  await page.getByText('Supervisor verified correction',{exact:true}).waitFor();
  const audit=(await api(2,'work-audit')).body.filter(r=>r.new_data.description==='Browser API correction');
  assert.equal(audit.length,2);assert.equal(audit[0].actor_id,uid(1));assert.equal(audit[0].new_data.adjustment_reason,'Supervisor verified correction');assert.equal(Number(audit[0].old_data.hours),1.5);assert.equal(Number(audit[0].new_data.hours),2.25);
  const snapshot=(await api(3,'snapshot')).body;const metrics=analytics(snapshot,{from:weekStart(ljubljanaDate()),to:ljubljanaDate()});
  assert.ok(Math.abs(metrics.rows[0].weekly-(2.25+Number(finished.duration_seconds)/3600))<0.00001);
  checks.push('ADMIN backdated UI save/reload, SUPERADMIN correction, immutable audit with actors/reasons/before/after, exact weekly analytics');
  for(const width of [390,768,1440]) {await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`ADMIN width ${width}`);}
  await page.screenshot({path:fileURLToPath(new URL('admin.png',output))});await context.close();
  // New collaboration uses the actual Next API and the same isolated PostgreSQL/RLS engine.
  const project=(await as(2,"insert into org_projects(name,status,visibility,join_policy,goal) values('Browser collaboration','active','organization','open','Deliver a workshop') returning id")).rows[0].id;
  const secret=(await as(2,"insert into org_projects(name,status) values('Private collaboration','active') returning id")).rows[0].id;
  const available=(await as(2,"insert into org_tasks(project_id,title,status,claimable) values($1,'Claim through actual API','todo',true) returning id",[project])).rows[0].id;
  assert.equal((await api(3,'snapshot')).body.projects.some(p=>p.id===secret),false);
  assert.equal((await api(3,'membership','POST',{project_id:secret,action:'join'})).status,403);
  ({context,page}=await login(3));await page.goto(origin+'/#projects');
  const card=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Browser collaboration',exact:true})});
  await card.getByRole('button',{name:'Pridruži se',exact:true}).click();
  await card.getByRole('button',{name:'Zapusti projekt',exact:true}).waitFor();
  await page.reload();await card.getByRole('button',{name:'Zapusti projekt',exact:true}).waitFor();
  assert.equal((await db.query('select count(*)::int n from org_project_members where project_id=$1 and member_id=$2',[project,mid(3)])).rows[0].n,1);
  await page.goto(origin+'/#tasks');await page.getByRole('button',{name:'Prevzemi nalogo',exact:true}).click();
  await page.getByText('Sprememba je shranjena v Supabase.',{exact:true}).waitFor();await page.reload();
  const claimed=(await api(3,'snapshot')).body.tasks.find(t=>t.id===available);assert.equal(claimed.assignee_id,mid(3));assert.equal(claimed.claimable,false);
  assert.equal((await api(3,'membership','POST',{project_id:project,action:'leave'})).status,409);
  assert.equal((await api(4,'claim-task','POST',{task_id:available})).status,403);
  await page.goto(origin+'/#projects');assert.equal(await card.getByRole('button',{name:'Zapusti projekt',exact:true}).isDisabled(),true);
  assert.equal((await api(3,'tasks','PATCH',{id:available,status:'done',expected_updated_at:claimed.updated_at})).status,200);
  await page.reload();await card.getByRole('button',{name:'Zapusti projekt',exact:true}).click();await card.getByRole('button',{name:'Pridruži se',exact:true}).waitFor();
  assert.equal((await db.query('select count(*)::int n from org_project_members where project_id=$1 and member_id=$2',[project,mid(3)])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from org_project_membership_history where project_id=$1 and member_id=$2',[project,mid(3)])).rows[0].n,2);
  await context.close();
  checks.push('actual Next API + SQL/RLS: private join denied; join/save/reload; claim/save/reload; foreign claim denied; leave blocked until task done; self-leave persists with history');
  assert.ok(commands.length>=5);assert.ok(commands.every(c=>!('started_at'in c)&&!('hours'in c)&&!('stopped_at'in c)));assert.deepEqual(errors,[]);
  const report={mode:'production Next build + Chromium + PGlite PostgreSQL; local synthetic Auth/PostgREST transport',checks,widths:[390,768,1440],hostedWrites:0};
  await writeFile(new URL('results.json',output),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} catch(e) {console.error(serverLog.slice(-2500));throw e;}
finally {await browser?.close();server.kill();adapter.closeAllConnections();await new Promise(r=>adapter.close(r));await db.close();}
