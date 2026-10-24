import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite(); let checks = 0;
const uid = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const mid = n => `20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function as(n, sql, args = []) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);
  try { return await db.query(sql,args); }
  finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); }
}
function ok(value,label) { assert.ok(value,label); checks++; }
async function denied(fn,label) { await assert.rejects(fn,undefined,label); checks++; }
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema org_private;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,banned_until timestamptz);
  create table auth.identities(user_id uuid,provider text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema public,auth,org_private to authenticated,service_role; grant usage on schema public to anon;`);
  await db.exec(await readFile(new URL('../tests/fixtures/production-schema.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../database/planned/hackathon-p0.sql',import.meta.url),'utf8'));
  for (let n=1;n<=5;n++) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(n),`fixture${n}@example.invalid`]);
    await db.query("insert into public.members(id,name,email,tier,weekly_hours,series,auth_user_id) values($1,$2,$3,'GO!',4,'Community',$4)",[mid(n),`Fixture ${n}`,`fixture${n}@example.invalid`,uid(n)]);
    await db.query('insert into org_private.access(email,role,member_id,auth_user_id) values($1,$2,$3,$4)',[`fixture${n}@example.invalid`,n===1?'SUPERADMIN':n===2?'ADMIN':'MEMBER',mid(n),uid(n)]);
  }
  const project=(await as(2,"insert into org_projects(name) values('Regression project') returning id")).rows[0].id;
  for(const n of [3,4]) await as(2,'insert into org_project_members(project_id,member_id) values($1,$2)',[project,mid(n)]);
  const task=(await as(2,"insert into org_tasks(project_id,title,assignee_id,status) values($1,'Task',$2,'backlog') returning id,updated_at",[project,mid(3)])).rows[0];
  ok((await as(4,'select * from org_tasks where id=$1',[task.id])).rows.length===1,'Project member sees peer task');
  ok((await as(5,'select * from org_tasks')).rows.length===0,'Unrelated member cannot read project tasks');
  ok((await as(3,'select * from org_task_directory()')).rows.length===2,'Directory limited to accessible project roster');
  ok((await as(5,'select * from org_task_directory()')).rows.length===0,'Unrelated member sees no roster');
  const changed=await as(3,"update org_tasks set priority='high',due_date='2026-11-01',status='in_progress' where id=$1 and updated_at=$2 returning id",[task.id,task.updated_at]);
  ok(changed.rows.length===1,'Owner edits status, priority and due date');
  ok((await as(3,"update org_tasks set status='done' where id=$1 and updated_at=$2 returning id",[task.id,task.updated_at])).rows.length===0,'Stale conditional update cannot overwrite a newer task');
  await denied(()=>as(3,"update org_tasks set title='Forged' where id=$1",[task.id]),'Member cannot rename own task');
  await denied(()=>as(3,'update org_tasks set assignee_id=$1 where id=$2',[mid(5),task.id]),'Cannot assign outside project');
  await as(3,'update org_tasks set assignee_id=$1 where id=$2',[mid(4),task.id]);
  ok((await as(3,"update org_tasks set status='done' where id=$1 returning id",[task.id])).rows.length===0,'Former assignee loses editing rights');
  await as(4,"update org_tasks set status='done' where id=$1",[task.id]);
  ok((await db.query('select completed_at from org_tasks where id=$1',[task.id])).rows[0].completed_at!==null,'Completion date persisted');
  ok((await db.query('select count(*)::int n from org_task_history where task_id=$1',[task.id])).rows[0].n===4,'Every successful mutation has one history row');
  await denied(()=>as(3,"update members set is_admin=true where id=$1",[mid(3)]),'Member cannot escalate role');
  await denied(()=>as(2,"select org_set_access('fixture3@example.invalid','SUPERADMIN',false)"),'Admin cannot grant Superadmin');
  const day=(await db.query("select (now() at time zone 'Europe/Ljubljana')::date::text d")).rows[0].d;
  await as(3,'insert into org_work_entries(member_id,date,hours) values($1,$2,1.5)',[mid(3),day]);
  ok((await as(4,'select * from org_work_entries')).rows.length===0,'Other member cannot read private hours');
  await denied(()=>as(4,'insert into org_work_entries(member_id,date,hours) values($1,$2,1)',[mid(3),day]),'Cannot log hours for another member');
  await db.query("insert into org_weekly_hours(member_id,week_start,through_date,hours,source,import_key) values($1,'2026-09-14','2026-09-18',70,'synthetic test','synthetic-week')",[mid(3)]);
  await denied(()=>as(3,"insert into org_work_entries(member_id,date,hours) values($1,'2026-09-16',1)",[mid(3)]),'Daily entry cannot overlap historical aggregate');
  const meeting=(await db.query("insert into org_meetings(calendar_id,google_event_id,title,series,starts_at,ends_at) values('fixture','active','Community','Community',now()-interval '5 minutes',now()+interval '55 minutes') returning id")).rows[0].id;
  await as(3,"insert into org_attendance(meeting_id,member_id,status) values($1,$2,'present')",[meeting,mid(3)]);
  await denied(()=>as(3,"insert into org_attendance(meeting_id,member_id,status) values($1,$2,'remote')",[meeting,mid(3)]),'Duplicate attendance rejected');
  await db.query('update org_meetings set cancelled=true where id=$1',[meeting]);
  await denied(()=>as(3,"update org_attendance set status='remote' where meeting_id=$1",[meeting]),'Cancelled self check-in rejected');
  await as(2,"update org_attendance set status='excused' where meeting_id=$1",[meeting]);
  ok((await db.query('select status from org_attendance where meeting_id=$1',[meeting])).rows[0].status==='excused','Admin may correct historical attendance');
  await denied(()=>as(3,"select org_apply_calendar('fixture','[]','{}')"),'Member cannot invoke privileged calendar RPC');
  await denied(()=>as(2,"select org_apply_calendar('fixture','[]','{}')"),'Admin JWT alone cannot invoke service RPC');
  const event={google_event_id:'atomic',title:'Community',description:'',series:'Community',starts_at:'2026-10-26T12:00:00Z',ends_at:'2026-10-26T13:00:00Z',timezone:'Europe/Ljubljana',all_day:false,location:'',meeting_url:'',cancelled:false,synced_at:new Date().toISOString(),member_ids:[mid(3)]};
  async function calendar(events,cancelled=[]) {
    await db.exec('set role service_role');
    try { return await db.query('select org_apply_calendar($1,$2::jsonb,$3::text[])',['fixture',JSON.stringify(events),cancelled]); }
    finally { await db.exec('reset role'); }
  }
  await calendar([event]); await calendar([event]);
  await calendar([{...event,member_ids:null}]);
  ok((await db.query("select count(*)::int n from org_meeting_members mm join org_meetings m on m.id=mm.meeting_id where m.google_event_id='atomic'")).rows[0].n===1,'Unresolved attendees preserve the existing roster');
  ok((await db.query("select count(*)::int n from org_meetings where google_event_id='atomic'")).rows[0].n===1,'Repeated sync is idempotent');
  await denied(()=>calendar([{...event,title:'Should roll back'},{...event,google_event_id:'bad',ends_at:'invalid'}]),'Invalid event rejects entire calendar transaction');
  ok((await db.query("select title from org_meetings where google_event_id='atomic'")).rows[0].title==='Community','Partial calendar update rolled back');
  await calendar([],['atomic']);
  ok((await db.query("select cancelled from org_meetings where google_event_id='atomic'")).rows[0].cancelled,'Cancellation persisted without deleting attendance');
  await db.query('update org_private.access set disabled=true where member_id=$1',[mid(4)]);
  ok((await as(4,'select org_context() identity')).rows[0].identity===null,'Disabled identity denied even with existing user UUID');
  console.log(JSON.stringify({database:'isolated PGlite, synthetic identities',passed:checks}));
} finally { await db.close(); }
