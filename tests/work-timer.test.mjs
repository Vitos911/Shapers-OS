import test from 'node:test';
import assert from 'node:assert/strict';
import { timerDatabase, uid, mid, sid } from './fixtures/work-timer-db.mjs';
import { timerCommand, adminWorkCommand } from '../lib/work-timer-server.ts';
import { analytics } from '../lib/organization.ts';
import { weeklyStreak } from '../lib/weekly-streak.ts';

const close = (a,b) => assert.ok(Math.abs(Number(a)-Number(b))<0.00001,`${a} ~= ${b}`);
test('timer API rejects browser timestamps, owner, duration and stale/admin payloads', () => {
  for (const key of ['started_at','stopped_at','hours','duration_seconds','member_id','user_id']) assert.throws(() => timerCommand({action:'start',session_id:sid(1),[key]:'forged'}));
  assert.throws(() => timerCommand({action:'stop',session_id:sid(1),expected_version:0}));
  assert.throws(() => adminWorkCommand({member_id:mid(3),date:'2026-10-20',hours:1},false));
  assert.throws(() => adminWorkCommand({member_id:mid(3),date:'2026-02-30',hours:1,reason:'Reason'},false));
  assert.throws(() => adminWorkCommand({member_id:mid(3),date:'2026-10-20',hours:1,reason:'Reason',id:sid(1)},true));
  assert.equal(timerCommand({action:'start',session_id:sid(1)}).p_session_id,sid(1));
});

test('SQL timer, restored sessions, RLS, administration, DST, historical analytics and leaderboard', {timeout:120000}, async () => {
  const {db,as,timer,state} = await timerDatabase();
  try {
    const historical = [mid(5),'2026-09-14','2026-09-18',4,'hours.csv','timer-fixture-week'];
    await db.query('insert into org_weekly_hours(member_id,week_start,through_date,hours,source,import_key) values($1,$2,$3,$4,$5,$6)',historical);
    const beforeHistory = (await db.query('select * from org_weekly_hours')).rows;
    const started = await timer(3,'start',sid(1));
    assert.equal(started.state,'running');
    assert.equal(started.user_id,uid(3));
    assert.ok(Math.abs(Date.parse(started.started_at)-Date.now())<10000);
    assert.equal((await timer(3,'start',sid(1))).id,started.id,'Lost START response is idempotent');
    await assert.rejects(() => timer(3,'start',sid(2)), {code:'23505'});
    const restored = await state(3);
    assert.equal(restored.sessions[0].id,started.id,'New authenticated read restores server session');
    assert.equal((await state(4)).sessions.length,0,'Other member sees no private timer');
    await assert.rejects(() => timer(4,'stop',sid(1),1), {code:'42501'});
    await assert.rejects(() => as(3,'update org_work_sessions set started_at=now()-interval \'10 hours\' where id=$1',[sid(1)]),{code:'42501'});
    await assert.rejects(() => as(3,'insert into org_work_segments(session_id,started_at) values($1,now())',[sid(1)]),{code:'42501'});
    const paused = await timer(3,'pause',sid(1),1);
    assert.equal(paused.state,'paused');
    const pauseSeconds = (await state(3)).sessions[0].elapsed_seconds;
    close((await state(3)).sessions[0].elapsed_seconds,pauseSeconds);
    await assert.rejects(() => timer(3,'resume',sid(1),1),{code:'40001'});
    await assert.rejects(() => timer(3,'start',sid(2)),{code:'23505'});
    const resumed = await timer(3,'resume',sid(1),2);
    assert.equal(resumed.state,'running');
    await assert.rejects(() => timer(3,'pause',sid(1),2),{code:'40001'},'Late response/second tab cannot overwrite new state');
    const stopped = await timer(3,'stop',sid(1),3);
    assert.equal(stopped.state,'stopped');
    assert.ok(Number(stopped.duration_seconds)>0);
    const persisted = (await db.query('select * from org_work_entries where session_id=$1',[sid(1)])).rows;
    close(persisted.reduce((sum,r)=>sum+Number(r.hours),0)*3600,stopped.duration_seconds);
    await timer(3,'stop',sid(1),3);
    assert.equal((await db.query('select count(*)::int n from org_work_entries where session_id=$1',[sid(1)])).rows[0].n,persisted.length,'Retried STOP never duplicates hours');
    assert.equal((await state(3)).sessions.length,0);
    for (const n of [1,2,3]) {
      await assert.rejects(() => as(n,"insert into org_work_entries(member_id,date,hours) values($1,'2026-10-20',8)",[mid(n)]),{code:'42501'});
      await assert.rejects(() => as(n,'update org_work_entries set hours=24 where id=$1',[persisted[0].id]),{code:'42501'});
    }
    await assert.rejects(() => as(3,"select org_admin_work(null,$1,'2026-10-20',8,'',null,'Forged')",[mid(3)]),{code:'42501'});
    await assert.rejects(() => as(2,"select org_admin_work(null,$1,'2026-10-20',1,'',null,'  ')",[mid(4)]),{code:'22023'});
    const adminRow = (await as(2,"select org_admin_work(null,$1,'2026-10-20',1.5,'Backdated',null,'Forgot to start timer') r",[mid(4)])).rows[0].r;
    const corrected = (await as(1,"select org_admin_work($1,$2,'2026-10-20',2,'Correction',null,'Confirmed by member',$3) r",[adminRow.id,mid(4),adminRow.updated_at])).rows[0].r;
    close(corrected.hours,2);
    await assert.rejects(() => as(2,"select org_admin_work($1,$2,'2026-10-20',9,'',null,'Stale overwrite',$3)",[adminRow.id,mid(4),adminRow.updated_at]),{code:'40001'});
    const audit = (await as(2,"select * from org_audit where entity='org_work_entries' and record_id=$1 order by occurred_at",[adminRow.id])).rows;
    assert.equal(audit.length,2); assert.equal(audit[0].actor_id,uid(2)); assert.equal(audit[1].actor_id,uid(1));
    assert.equal(audit[0].new_data.adjustment_reason,'Forgot to start timer');
    close(audit[1].old_data.hours,1.5); close(audit[1].new_data.hours,2);
    assert.equal((await as(3,"select * from org_audit where entity='org_work_entries'")).rows.length,0);
    await assert.rejects(() => as(2,'update org_audit set new_data=null'),{code:'42501'});
    await assert.rejects(() => as(2,"select org_admin_work(null,$1,'2026-09-16',1,'',null,'Overlap')",[mid(5)]),{code:'23514'});
    await assert.rejects(() => as(2,"select org_admin_work(null,$1,'2099-01-01',1,'',null,'Future')",[mid(5)]),{code:'22023'});
    assert.deepEqual((await db.query('select * from org_weekly_hours')).rows,beforeHistory,'Imported hours.csv rows remain byte-for-byte equivalent');
    // Concurrent requests, plus the same invariant enforced independently by the partial unique index.
    await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(4)]);
    const concurrent = await Promise.allSettled([sid(3),sid(4)].map(id => db.query("select org_work_timer('start',$1)",[id])));
    await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)");
    assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(concurrent.find(r=>r.status==='rejected').reason.code,'23505');
    const live = (await state(4)).sessions[0];
    await assert.rejects(() => db.query("insert into org_work_sessions(id,user_id,member_id,started_at,state) values($1,$2,$3,now(),'running')",[sid(5),uid(4),mid(4)]),{code:'23505'});
    await timer(4,'stop',live.id,live.version);
    // Deliberate server-side fixture intervals exercise clipping at a week boundary, pauses and DST.
    async function seeded(id,intervals) {
      await db.query("insert into org_work_sessions(id,user_id,member_id,started_at,state) values($1,$2,$3,$4,'paused')",[id,uid(5),mid(5),intervals[0][0]]);
      for(const [from,to] of intervals) await db.query('insert into org_work_segments(session_id,started_at,ended_at) values($1,$2,$3)',[id,from,to]);
    }
    await seeded(sid(10),[['2026-10-18T21:30:00Z','2026-10-18T22:30:00Z'],['2026-10-18T23:00:00Z','2026-10-19T00:00:00Z']]);
    let projection=(await db.query('select * from org_private.session_work(now()) where session_id=$1 order by date',[sid(10)])).rows;
    assert.deepEqual(projection.map(r=>new Date(r.date).toISOString().slice(0,10)),['2026-10-18','2026-10-19']);
    close(projection[0].hours,0.5); close(projection[1].hours,1.5);
    const liveBefore = await state(5);
    const finished = await timer(5,'stop',sid(10),1);
    close(finished.duration_seconds,7200);
    const liveAfter = await state(5);
    close(liveBefore.work.reduce((s,r)=>s+Number(r.hours),0),liveAfter.work.reduce((s,r)=>s+Number(r.hours),0));
    const snapshot = { identity:{member_id:mid(5),role:'MEMBER'},members:[{id:mid(5),weekly_hours:4,tier:'GO!',series:''}],work:liveAfter.work,weeklyHours:beforeHistory.map(h=>({...h,week_start:new Date(h.week_start).toISOString().slice(0,10),through_date:new Date(h.through_date).toISOString().slice(0,10)})),projects:[],tasks:[],history:[],meetings:[],attendance:[],meetingMembers:[] };
    const metrics=analytics(snapshot,{from:'2026-09-14',to:'2026-10-25'},'2026-10-25');
    close(metrics.hours,6); close(metrics.rows[0].weekly,1.5);
    close(weeklyStreak(snapshot,new Date('2026-10-25T12:00:00Z')).hours,1.5);
    await seeded(sid(11),[['2025-10-25T22:00:00Z','2025-10-26T23:00:00Z']]);
    close((await db.query('select hours from org_private.session_work(now()) where session_id=$1',[sid(11)])).rows[0].hours,25);
    await timer(5,'stop',sid(11),1);
    close((await db.query('select hours from org_work_entries where session_id=$1',[sid(11)])).rows[0].hours,25);
    await seeded(sid(12),[['2026-03-28T23:00:00Z','2026-03-29T22:00:00Z']]);
    close((await db.query('select hours from org_private.session_work(now()) where session_id=$1',[sid(12)])).rows[0].hours,23);
    await timer(5,'stop',sid(12),1);
    // Current leaderboard replaces active work on STOP; historical cutoff reconstructs the segment.
    await seeded(sid(13),[['2026-10-24T10:00:00Z','2026-10-24T11:00:00Z']]);
    async function leaderboard(at) {
      await db.exec('set role service_role');
      try { return (await db.query('select org_leaderboard_source($1) r',[at])).rows[0].r; }
      finally { await db.exec('reset role'); }
    }
    const sourceBefore=await leaderboard(new Date().toISOString());
    close(sourceBefore.work.filter(r=>r.session_id===sid(13)).reduce((s,r)=>s+Number(r.hours),0),1);
    await timer(5,'stop',sid(13),1);
    const sourceAfter=await leaderboard(new Date(Date.now()+1000).toISOString());
    close(sourceAfter.work.filter(r=>r.session_id===sid(13)).reduce((s,r)=>s+Number(r.hours),0),1);
    const past = await leaderboard('2026-10-24T10:30:00Z');
    close(past.work.filter(r=>r.session_id===sid(13)).reduce((s,r)=>s+Number(r.hours),0),0.5);
    // Import/timer overlap is rejected in both directions under the same lock.
    const localDay = (await db.query("select (now() at time zone 'Europe/Ljubljana')::date::text d")).rows[0].d;
    const localWeek = (await db.query("select date_trunc('week',now() at time zone 'Europe/Ljubljana')::date::text d")).rows[0].d;
    await timer(6,'start',sid(30));
    await assert.rejects(() => db.query("insert into org_weekly_hours(member_id,week_start,through_date,hours,source,import_key) values($1,$2,$3,0,'fixture','active-overlap')",[mid(6),localWeek,localDay]),{code:'23514'});
    await db.exec("create function public.timer_persist_failure() returns trigger language plpgsql as $$ begin raise exception 'Synthetic persistence failure'; end $$; create trigger timer_persist_failure before insert on org_work_entries for each row execute function public.timer_persist_failure();");
    await assert.rejects(() => timer(6,'stop',sid(30),1),{code:'P0001'});
    assert.equal((await state(6)).sessions[0].state,'running','Failed persistence rolls STOP back');
    assert.equal((await db.query('select ended_at from org_work_segments where session_id=$1',[sid(30)])).rows[0].ended_at,null);
    assert.equal((await db.query('select count(*)::int n from org_work_entries where session_id=$1',[sid(30)])).rows[0].n,0);
    await db.exec('drop trigger timer_persist_failure on org_work_entries; drop function public.timer_persist_failure();');
    await timer(6,'stop',sid(30),1);
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'timer7@fixture.invalid',now())",[uid(7)]);
    await db.query("insert into members(id,name,email,tier,weekly_hours,auth_user_id) values($1,'Timer 7','timer7@fixture.invalid','GO!',6,$2)",[mid(7),uid(7)]);
    await db.query("insert into org_private.access(email,role,member_id,auth_user_id) values('timer7@fixture.invalid','MEMBER',$1,$2)",[mid(7),uid(7)]);
    await db.query("insert into org_weekly_hours(member_id,week_start,through_date,hours,source,import_key) values($1,$2,$3,0,'fixture','covered-start-7')",[mid(7),localWeek,localDay]);
    await assert.rejects(() => timer(7,'start',sid(31)),{code:'23514'});
    await db.query('update org_private.access set disabled=true where member_id=$1',[mid(3)]);
    await assert.rejects(() => timer(3,'start',sid(20)),{code:'42501'});
    assert.equal((await state(3)).work.length,0);
  } finally { await db.close(); }
});
