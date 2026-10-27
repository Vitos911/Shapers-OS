import test from 'node:test';
import assert from 'node:assert/strict';
import { timerDatabase,uid } from './fixtures/work-timer-db.mjs';

test('workspace lifecycle, tenant isolation, member ownership and private multi-tab presence',async()=>{
 const {db}=await timerDatabase();
 async function as(n,w,sql,args=[]){
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.headers',$2,false)",[uid(n),JSON.stringify(w?{'x-workspace-id':w}:{})]);
  try{return await db.query(sql,args);}finally{await db.exec('reset role');await db.exec("select set_config('request.jwt.claim.sub','',false),set_config('request.headers','{}',false)");}
 }
 const command=async(n,w,action,data={})=>(await as(n,w,'select wemry_workspace_command($1,$2::jsonb) data',[action,JSON.stringify(data)])).rows[0].data;
 const create=async(n,name)=>(await as(n,null,'select wemry_create_workspace($1) id',[name])).rows[0].id;
 const presence=async(n,w,connection,active=true,disconnect=false)=>(await as(n,w,'select wemry_presence($1,$2,$3) data',[connection,active,disconnect])).rows[0].data;
 try{
  const a=await create(3,'Team A'), b=await create(4,'Team B');
  assert.equal((await as(3,a,'select org_context() data')).rows[0].data.role,'OWNER');
  assert.equal((await as(3,b,'select org_context() data')).rows[0].data,null);
  assert.equal((await as(3,b,'select * from members')).rows.length,0);
  await assert.rejects(()=>as(3,b,"insert into org_projects(name) values('Intrusion')"));
  const invitation=await command(3,a,'invite',{email:'timer5@fixture.invalid'});
  await assert.rejects(()=>command(6,null,'accept',{token:invitation.token}));
  await command(5,null,'accept',{token:invitation.token});
  const repeatedInvite=await command(3,a,'invite',{email:'timer5@fixture.invalid'});
  await command(5,null,'accept',{token:repeatedInvite.token});
  assert.equal((await db.query('select active_member_count from organizations where id=$1',[a])).rows[0].active_member_count,2,'idempotent acceptance does not inflate the counter');
  assert.equal((await as(5,a,'select org_context() data')).rows[0].data.role,'MEMBER');
  await assert.rejects(()=>command(5,a,'invite',{email:'timer6@fixture.invalid'}));
  const project=(await as(5,a,"insert into org_projects(name,visibility,join_policy) values('Member project','organization','open') returning *")).rows[0];
  assert.equal(project.created_by,uid(5));
  assert.equal((await as(5,a,'select * from org_project_members where project_id=$1',[project.id])).rows.length,1);
  assert.equal((await as(5,a,"update org_projects set description='Saved' where id=$1 returning *",[project.id])).rows[0].description,'Saved');
  await as(5,a,"update org_projects set join_policy='approval' where id=$1",[project.id]);
  assert.equal((await as(3,a,"select org_project_membership($1,'join') status",[project.id])).rows[0].status,'pending');
  const request=(await as(5,a,"select * from org_project_join_requests where project_id=$1 and status='pending'",[project.id])).rows[0];
  assert.ok(request,'member project creator can review requests');
  await as(5,a,"select org_project_membership($1,'approve',$2)",[project.id,request.member_id]);
  const member=(await as(5,a,'select org_context() data')).rows[0].data.member_id;
  const task=(await as(5,a,"insert into org_tasks(project_id,title,assignee_id) values($1,'Own task',$2) returning *",[project.id,member])).rows[0];
  assert.equal(task.points_eligible,false);
  await as(5,a,"update org_tasks set title='Edited title',status='done' where id=$1",[task.id]);
  assert.equal((await as(5,a,'select * from org_task_history where task_id=$1',[task.id])).rows.length,2);
  assert.equal((await as(4,b,'select * from org_tasks where id=$1',[task.id])).rows.length,0);
  await assert.rejects(()=>as(4,b,"select org_project_membership($1,'join')",[project.id]));
  await assert.rejects(()=>as(4,b,"insert into org_tasks(project_id,title) values($1,'Foreign task')",[project.id]));
  const other=(await as(4,b,'select org_context() data')).rows[0].data.member_id;
  await assert.rejects(()=>as(3,a,'select org_admin_work(null,$1,current_date,1,\'Forged\',null,\'Reason\')',[other]));
  const source=await as(3,a,'select org_work_state() data');
  assert.ok(source.rows[0].data.work.every(w=>w.member_id!==other));
  await command(3,a,'group',{name:'Volunteer',weekly_hours:0});
  const group=(await as(3,a,"select * from organization_groups where name='Volunteer'")).rows[0];
  await command(3,a,'assign-group',{group_id:group.id,member_id:member});
  assert.equal(Number((await as(5,a,'select weekly_hours from members where id=$1',[member])).rows[0].weekly_hours),0);
  const c1='41000000-0000-4000-8000-000000000001',c2='41000000-0000-4000-8000-000000000002';
  assert.equal((await presence(5,a,c1)).find(p=>p.user_id===uid(5)).status,'online');
  await presence(5,a,c2);
  assert.equal((await presence(5,a,c1,false,true)).find(p=>p.user_id===uid(5)).status,'online');
  await db.query("update org_private.presence_leases set active_at=now()-interval '6 minutes' where organization_id=$1",[a]);
  assert.equal((await presence(5,a,c2,false)).find(p=>p.user_id===uid(5)).status,'idle');
  assert.equal((await presence(5,a,c2,false,true)).find(p=>p.user_id===uid(5)).status,'offline');
  await presence(5,a,c2);
  await db.query("update org_private.presence_leases set last_seen=now()-interval '2 minutes' where organization_id=$1 and user_id=$2",[a,uid(5)]);
  assert.equal((await presence(3,a,c1)).find(p=>p.user_id===uid(5)).status,'offline','expired connection lease is offline');
  await command(5,a,'privacy',{hidden:true});
  assert.equal((await presence(5,a,c2)).find(p=>p.user_id===uid(5)).status,'unknown');
  assert.equal((await db.query('select * from org_private.presence_leases where organization_id=$1 and user_id=$2',[a,uid(5)])).rows.length,0);
  assert.ok((await presence(4,b,c1)).every(p=>p.user_id!==uid(5)));
  await assert.rejects(()=>presence(6,a,c1));
  await assert.rejects(()=>command(3,a,'leave'));
  await assert.rejects(()=>command(5,a,'role',{user_id:uid(3),role:'MEMBER'}));
  await command(3,a,'transfer',{user_id:uid(5)});
  assert.equal((await as(5,a,'select org_context() data')).rows[0].data.role,'OWNER');
  assert.equal((await as(3,a,'select org_context() data')).rows[0].data.role,'ADMIN');
  await assert.rejects(()=>command(3,a,'transfer',{user_id:uid(5)}));
  await command(5,a,'transfer',{user_id:uid(3)});
  await command(5,a,'leave');
  assert.equal((await as(5,a,'select org_context() data')).rows[0].data,null);
  assert.equal((await db.query('select count(*)::int n from members where organization_id=$1',[a])).rows[0].n,2,'leaving preserves records');
 }finally{await db.close();}
});

test('database capacity is enforced at 50 and guards all membership entry paths',async()=>{
 const {db,as}=await timerDatabase();
 try{
  const w=(await as(3,"select wemry_create_workspace('Capacity') id")).rows[0].id;
  for(let n=10;n<59;n++){
   await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(n),`capacity${n}@fixture.invalid`]);
   await db.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'MEMBER')",[w,uid(n)]);
  }
  assert.equal((await db.query("select count(*)::int n from organization_members where organization_id=$1 and membership_status='active'",[w])).rows[0].n,50);
  await db.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'MEMBER') on conflict(organization_id,user_id) do update set role=excluded.role",[w,uid(10)]);
  assert.equal((await db.query('select active_member_count from organizations where id=$1',[w])).rows[0].active_member_count,50,'upsert at capacity is idempotent');
  await assert.rejects(()=>db.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'MEMBER')",[w,uid(6)]),/50 active members/);
  const guard=(await db.query("select pg_get_functiondef('org_private.member_capacity()'::regprocedure) definition")).rows[0].definition;
  assert.match(guard,/active_member_count=active_member_count\+1/i);
  await db.query("insert into organization_members(organization_id,user_id,role,membership_status) values($1,$2,'MEMBER','inactive')",[w,uid(6)]);
  await assert.rejects(()=>db.query("update organization_members set membership_status='active' where organization_id=$1 and user_id=$2",[w,uid(6)]),/50 active members/);
  const invitation=(await db.query("insert into org_private.workspace_invitations(organization_id,email) values($1,'timer6@fixture.invalid') returning token",[w])).rows[0].token;
  await assert.rejects(()=>as(6,"select wemry_workspace_command('accept',$1::jsonb)",[JSON.stringify({token:invitation})]),/50 active members/);
  assert.equal((await db.query('select count(*)::int n from members where organization_id=$1',[w])).rows[0].n,1,'failed acceptance rolls back its new profile');
  assert.equal((await db.query('select accepted_at from org_private.workspace_invitations where token=$1',[invitation])).rows[0].accepted_at,null);
 }finally{await db.close();}
});

test('upgrade preserves existing member IDs, aggregates, task history, immutable audit and demo aliases',async()=>{
 let before,aliasMember;
 const tables=['members','org_tasks','org_task_history','org_weekly_hours','org_work_entries','org_attendance','org_audit'];
 const {db}=await timerDatabase({beforeWorkspaces:async db=>{
  for(let n=101;n<=120;n++){
   await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(n),`legacy${n}@fixture.invalid`]);
   const m=(await db.query("insert into members(name,email,tier,weekly_hours,auth_user_id) values($1,$2,'Impact',10,$3) returning id",[`Legacy ${n}`,`legacy${n}@fixture.invalid`,uid(n)])).rows[0].id;
   await db.query("insert into org_private.access(email,role,member_id,auth_user_id) values($1,'MEMBER',$2,$3)",[`legacy${n}@fixture.invalid`,m,uid(n)]);
   await db.query("insert into org_weekly_hours(member_id,week_start,through_date,hours,source,import_key) values($1,'2026-09-14','2026-09-20',10,'isolated regression',$2)",[m,`legacy-${n}`]);
  }
  const first=(await db.query('select id from members order by email limit 1')).rows[0].id;
  aliasMember=first;
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(121),'demo-alias@fixture.invalid']);
  await db.query("insert into org_private.access(email,role,member_id,auth_user_id) values('demo-alias@fixture.invalid','MEMBER',$1,$2)",[first,uid(121)]);
  const project=(await db.query("insert into org_projects(name) values('Preserved project') returning id")).rows[0].id;
  await db.query("insert into org_tasks(project_id,title,assignee_id) values($1,'Preserved task',$2)",[project,first]);
  before=Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await db.query(`select * from ${t} order by id`)).rows])));
 }});
 try{
  for(const t of tables){
   const after=(await db.query(`select * from ${t} where organization_id='00000000-0000-4000-8000-000000000001' order by id`)).rows;
   // Factory adds six fresh identities after the upgrade; compare the original IDs only.
   const ids=new Set(before[t].map(r=>r.id));
   assert.deepEqual(after.filter(r=>ids.has(r.id)).map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['organization_id','points_eligible'].includes(key)))),before[t],t);
  }
  assert.equal((await db.query('select count(*)::int n from organization_members where member_id=$1',[aliasMember])).rows[0].n,2);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(121)]);
  assert.equal((await db.query('select org_context() data')).rows[0].data.member_id,aliasMember);
  await db.query("delete from org_private.access where email='demo-alias@fixture.invalid'");
  assert.equal((await db.query('select org_context() data')).rows[0].data,null,'revoking a demo link revokes access');
 }finally{await db.close();}
});
