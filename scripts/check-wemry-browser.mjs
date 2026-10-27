/** Real Next HTTP routes -> isolated PostgreSQL engine. Auth/config are synthetic.
 * Never connects to hosted Supabase or sends messages. No production credentials.
 */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {timerDatabase,uid} from '../tests/fixtures/work-timer-db.mjs';
const {db}=await timerDatabase();
const origin='http://127.0.0.1:3326';
const serviceKey='sb_secret_isolated_fixture';
const tables=new Set(['members','org_projects','org_tasks','org_project_members','org_project_join_requests','org_project_membership_history','org_work_entries','org_work_sessions','org_weekly_hours','org_meetings','org_attendance','org_task_history','org_meeting_members','org_settings','org_audit','org_leaderboard_weeks','organization_settings','organization_groups']);
const rpcs=new Set(['org_context','org_work_state','org_work_timer','org_admin_work','org_project_directory','org_project_progress','org_task_directory','org_project_membership','org_claim_task','org_leaderboard_source','wemry_workspaces','wemry_create_workspace','wemry_workspace_command','wemry_presence','wemry_member_directory']);
const setRpcs=new Set(['org_project_directory','org_project_progress','org_task_directory','wemry_member_directory']);
const identifier=s=>{assert.match(s,/^[a-z_]+$/);return '"'+s+'"';};
const user=n=>({id:uid(n),email:`timer${n}@fixture.invalid`,email_confirmed_at:'2026-01-01T00:00:00Z',created_at:'2026-01-01T00:00:00Z',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}});
const token=n=>'fixture.'+Buffer.from(JSON.stringify({sub:uid(n),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
function actor(header){try{return JSON.parse(Buffer.from(String(header).split('.')[1],'base64url').toString()).sub;}catch{return null;}}
let queue=Promise.resolve(),apiCalls=0;
async function body(req){let s='';for await(const part of req)s+=part;return s?JSON.parse(s):{};}
function send(res,status,value){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'});res.end(JSON.stringify(value));}
const backend=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),input=await body(req),id=actor(req.headers.authorization);
  if(url.pathname==='/auth/v1/user')return id?send(res,200,user(Number(id.slice(-12)))):send(res,401,{message:'Invalid fixture account'});
  const operation=queue.then(async()=>{
   await db.exec('begin');
   try{
    const service=req.headers.authorization==='Bearer '+serviceKey;
    await db.exec('set local role '+(service?'service_role':'authenticated'));
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",[id||'',JSON.stringify({'x-workspace-id':req.headers['x-workspace-id']||''})]);
    let result;
    if(url.pathname.includes('/rpc/')){
     const name=url.pathname.split('/').at(-1);assert.ok(rpcs.has(name),'Allowed isolated RPC');
     const values=Object.values(input),args=Object.keys(input).map((key,i)=>identifier(key)+'=> $'+(i+1)).join(',');
     const call='public.'+identifier(name)+'('+args+')';
     result=(await db.query(setRpcs.has(name)?`select coalesce(jsonb_agg(r),'[]') data from ${call} r`:`select ${call} data`,values)).rows[0].data;
    }else{
     const table=url.pathname.split('/').at(-1);assert.ok(tables.has(table),'Allowed isolated table');
     const values=[],filters=[];
     for(const [key,value] of url.searchParams){
      if(['select','order','limit','offset','on_conflict'].includes(key))continue;
      const [op,...rest]=value.split('.'),v=rest.join('.');
      if(op==='in'){
       const list=v.replace(/^\(|\)$/g,'').split(',');filters.push(identifier(key)+' in ('+list.map(item=>{values.push(item);return '$'+values.length;}).join(',')+')');
      }else{const operators={eq:'=',neq:'<>',gte:'>=',lte:'<=',lt:'<',gt:'>'};assert.ok(operators[op]);values.push(v);filters.push(identifier(key)+operators[op]+'$'+values.length);}
     }
     const where=filters.length?' where '+filters.join(' and '):'';
     let sql;
     if(req.method==='GET'){
      const select=url.searchParams.get('select')||'*';assert.match(select,/^(\*|[a-z_,]+)$/);
      sql='select '+(select==='*'?'*':select.split(',').map(identifier).join(','))+' from public.'+identifier(table)+where;
      const order=url.searchParams.get('order');if(order)sql+=' order by '+order.split(',').map(item=>{const [key,direction]=item.split('.');return identifier(key)+(direction==='desc'?' desc':' asc');}).join(',');
      if(url.searchParams.has('limit')){values.push(Number(url.searchParams.get('limit')));sql+=' limit $'+values.length;}
      if(url.searchParams.has('offset')){values.push(Number(url.searchParams.get('offset')));sql+=' offset $'+values.length;}
     }else if(req.method==='PATCH'){
      const fields=Object.entries(input).map(([key,value])=>{values.push(value);return identifier(key)+'=$'+values.length;});
      sql='update public.'+identifier(table)+' set '+fields.join(',')+where+' returning *';
     }else if(req.method==='POST'){
      const keys=Object.keys(input);const params=keys.map(key=>{values.push(input[key]);return '$'+values.length;});
      sql='insert into public.'+identifier(table)+'('+keys.map(identifier).join(',')+') values('+params.join(',')+')';
      if(url.searchParams.has('on_conflict'))sql+=' on conflict('+url.searchParams.get('on_conflict').split(',').map(identifier).join(',')+') do nothing';
      sql+=' returning *';
     }else throw Error('Unsupported isolated method');
     const rows=(await db.query(sql,values)).rows;
     if(req.headers.accept?.includes('vnd.pgrst.object')){if(rows.length!==1)throw Object.assign(Error('Row unavailable'),{code:'PGRST116'});result=rows[0];}else result=rows;
    }
    await db.exec('commit');apiCalls++;return result;
   }catch(e){await db.exec('rollback');throw e;}
  });
  queue=operation.catch(()=>{});
  send(res,200,await operation);
 }catch(e){send(res,e.code==='42501'?403:400,{code:e.code||'FIXTURE_ERROR',message:e.message,details:null,hint:null});}
});
await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
const backendUrl='http://127.0.0.1:'+backend.address().port;
await mkdir('test-results/wemry',{recursive:true});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3326'],{windowsHide:true,env:{...process.env,SUPABASE_URL:backendUrl,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:serviceKey,GOOGLE_CALENDAR_ID:'',GOOGLE_CALENDAR_API_KEY:'',SHAPER_AI_API_KEY:'',GROQ_API_KEY:'',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
let serverOutput='';server.stdout.on('data',d=>serverOutput+=d);server.stderr.on('data',d=>serverOutput+=d);
let browser,activePage;
 const errors=[];
try{
 let ready=false;
 for(let n=0;n<80;n++){try{ready=(await fetch(origin+'/api/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,200));}
 assert.ok(ready,'Next server started');
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 async function context(n){
  const c=await browser.newContext({viewport:{width:1440,height:1000}});
  const session={access_token:token(n),refresh_token:'fixture',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user(n)};
  await c.addInitScript(session=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify(session)),session);
  await c.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/supabase-config')return route.fulfill({json:{configured:true,url:'https://fixture.supabase.co',publishableKey:'sb_publishable_fixture'}});
   if(url.hostname==='fixture.supabase.co')return route.fulfill({json:url.pathname.startsWith('/rest/v1/')?[]:url.pathname.endsWith('/user')?user(n):session});
   if(url.origin!==origin)return route.abort();
   return route.continue();
  });
  return c;
 }
 const c=await context(3),page=await c.newPage();activePage=page;page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.getByRole('heading',{name:'Tvoj teden. Tvoj vpliv.'}).waitFor();
 await page.getByText('Global Shapers',{exact:true}).first().click();
 await page.getByRole('button',{name:'Ustvari delovni prostor',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Nov delovni prostor'});
 await dialog.getByLabel('Ime prostora',{exact:true}).fill('Wemry Test Team');
 await dialog.getByLabel('Opis',{exact:true}).fill('Isolated integration fixture');
 await dialog.getByRole('button',{name:'Ustvari prostor',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 await page.getByRole('heading',{name:'Tvoj prostor je pripravljen.',exact:true}).waitFor();
 console.log('PASS: workspace creation through real API and SQL');
 const first=new URL(page.url()).searchParams.get('workspace');assert.ok(first);
 await page.getByRole('button',{name:'Ustvari prvi projekt',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Dodaj projekt'});
 await dialog.getByLabel('Ime projekta',{exact:true}).fill('Persisted project');
 await dialog.getByRole('button',{name:'Shrani v Supabase',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 assert.equal((await db.query('select count(*)::int n from org_projects where organization_id=$1',[first])).rows[0].n,1);
 await page.goto(origin+'/?workspace='+first+'#projects');
 await page.getByRole('heading',{name:'Persisted project',exact:true}).waitFor();
 await page.goto(origin+'/?workspace='+first+'#tasks');
 await page.getByRole('button',{name:'Nova naloga',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Dodaj nalogo'});
 await dialog.getByLabel('Naslov naloge',{exact:true}).fill('Persisted task');
 await dialog.getByLabel('Projekt',{exact:true}).selectOption({label:'Persisted project'});
 await dialog.getByRole('button',{name:'Shrani v Supabase',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 await page.reload();await page.getByText('Persisted task',{exact:true}).first().waitFor();
 const persisted=(await db.query('select * from org_tasks where organization_id=$1',[first])).rows;
 assert.equal(persisted.length,1);assert.equal(persisted[0].title,'Persisted task');
 // Create another workspace through the actual server route and verify selected UI contains no stale tasks.
 const api=async(path,body,n=3,w=first)=>{
  const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token(n),'x-workspace-id':w,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};
 };
 const second=(await api('/api/workspaces',{action:'create',name:'Second Team'})).data.id;
 assert.ok(second);
 await page.reload();
 await page.getByText('Wemry Test Team',{exact:true}).first().click();
 await page.getByRole('button',{name:/Second Team/}).click();
 await page.getByRole('heading',{name:'Tvoj prostor je pripravljen.',exact:true}).waitFor();
 assert.equal(await page.getByText('Persisted task',{exact:true}).count(),0);
 assert.equal((await api('/api/org/snapshot',null,4,first)).status,403);
 const invite=(await api('/api/workspaces',{action:'invite',email:'timer5@fixture.invalid'})).data.token;
 assert.equal((await api('/api/workspaces',{action:'accept',token:invite},5)).status,200);
 const cm=await context(5),memberPage=await cm.newPage();memberPage.on('pageerror',e=>errors.push(e.message));
 const ownerFirst=await c.newPage();await ownerFirst.goto(origin+'/?workspace='+first+'#projects');
 await ownerFirst.getByRole('heading',{name:'Persisted project',exact:true}).waitFor();
 await memberPage.goto(origin+'/?workspace='+first+'#projects');
 await memberPage.getByRole('button',{name:'Nov projekt',exact:true}).click();
 dialog=memberPage.getByRole('dialog',{name:'Dodaj projekt'});
 await dialog.getByLabel('Ime projekta',{exact:true}).fill('Member-created project');
 await dialog.getByRole('button',{name:'Shrani v Supabase',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await memberPage.reload();await memberPage.getByRole('heading',{name:'Member-created project',exact:true}).waitFor();
 assert.equal((await db.query("select created_by from org_projects where name='Member-created project'")).rows[0].created_by,uid(5));
 const connected=await api('/api/workspaces/presence',{connection_id:'71000000-0000-4000-8000-000000000001',active:true,disconnect:false});
 assert.equal(connected.status,200);assert.ok(connected.data.some(p=>p.user_id===uid(3)&&p.status==='online'));assert.ok(connected.data.some(p=>p.user_id===uid(5)&&p.status==='online'),'two independent browser clients publish verified presence');
 await memberPage.getByLabel('Povezanost ekipe',{exact:true}).click();
 const [privacy]=await Promise.all([memberPage.waitForResponse(r=>new URL(r.url()).pathname==='/api/workspaces'&&r.request().method()==='POST'),memberPage.getByLabel('Skrij mojo prisotnost',{exact:true}).check()]);
 assert.equal(privacy.status(),200);
 const hidden=await api('/api/workspaces/presence',{connection_id:'71000000-0000-4000-8000-000000000001',active:true,disconnect:false});
 assert.equal(hidden.data.find(p=>p.user_id===uid(5)).status,'unknown','another client cannot recover hidden presence');
 await memberPage.getByLabel('Povezanost ekipe',{exact:true}).click();
 for(const width of [390,768,1440]){
  await memberPage.setViewportSize({width,height:1000});
  await memberPage.screenshot({path:`test-results/wemry/workspace-${width}.png`,fullPage:true});
  assert.equal(await memberPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No document overflow at '+width);
 }
 await memberPage.getByLabel('Uporabniški profil',{exact:true}).click();
 await memberPage.getByRole('button',{name:'Odjava',exact:true}).click();
 await memberPage.getByRole('heading',{name:'Skupaj, tudi na spletu.',exact:true}).waitFor();
 assert.equal(await memberPage.getByRole('heading',{name:'Member-created project',exact:true}).count(),0,'Logout removes private workspace content');
 assert.deepEqual(errors,[],'No browser runtime errors');
 await writeFile('test-results/wemry/acceptance.json',JSON.stringify({status:'PASS',scope:'Browser + real Next HTTP routes + isolated PGlite; synthetic Auth/config',apiCalls,workspaces:2,createReload:true,memberProject:true,tenantRejection:true,twoClientPresence:true,hiddenPresence:true,logout:true,viewports:[390,768,1440],productionVerified:false},null,2));
 console.log('PASS: workspace creation/switch, project/task persistence/reload, MEMBER creation, unauthorized tenant rejection and responsive browser checks; '+apiCalls+' real SQL-backed requests');
}catch(e){await writeFile('test-results/wemry/server.log',serverOutput);if(activePage){await activePage.screenshot({path:'test-results/wemry/failure.png',fullPage:true});await writeFile('test-results/wemry/failure.txt',await activePage.locator('body').innerText());}throw e;}
finally{await browser?.close();server.kill();await new Promise(resolve=>backend.close(resolve));await queue;await db.close();}
