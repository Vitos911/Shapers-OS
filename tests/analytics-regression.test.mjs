import test from 'node:test';
import assert from 'node:assert/strict';
import { analytics } from '../lib/organization.ts';
const member = {id:'m',name:'Fixture',email:'fixture@example.invalid',tier:'GO!',weekly_hours:4,series:'Community',auth_user_id:'u'};
const empty = () => ({members:[member],tasks:[],work:[],weeklyHours:[],meetings:[],attendance:[],history:[],meetingMembers:[],projectMembers:[],taskDirectory:[],projects:[]});
test('unrecorded attendance is unknown, explicit unexcused is zero, all-day meetings excluded', () => {
 const s=empty();
 s.meetings=[{id:'e',series:'Community',starts_at:'2026-01-20T12:00:00Z',ends_at:'2026-01-20T13:00:00Z',cancelled:false,all_day:false}];
 const filter={from:'2026-01-19',to:'2026-01-25'};
 let a=analytics(s,filter,'2026-01-24');
 assert.equal(a.attendanceRate,null); assert.equal(a.missingAttendance,1); assert.equal(a.behind,0); assert.equal(a.unknownWeekly,1);
 s.attendance=[{meeting_id:'e',member_id:'m',status:'unexcused'}];
 a=analytics(s,filter,'2026-01-24');
 assert.equal(a.attendanceRate,0); assert.equal(a.missingAttendance,0);
 s.meetings[0].all_day=true;
 assert.equal(analytics(s,filter).attendanceRate,null);
});
test('weekly totals stay whole, overlapping daily records never double count and partial coverage is disclosed', () => {
 const s=empty();
 s.weeklyHours=[{member_id:'m',week_start:'2026-01-19',through_date:'2026-01-23',hours:10}];
 s.work=[{member_id:'m',project_id:'p',date:'2026-01-20',hours:3,deleted:false},{member_id:'m',project_id:'p',date:'2026-01-24',hours:2,deleted:false}];
 let a=analytics(s,{from:'2026-01-19',to:'2026-01-25'},'2026-01-24');
 assert.equal(a.hours,12); assert.equal(a.weeklyHours,12); assert.equal(a.overlapEntries,1);
 a=analytics(s,{from:'2026-01-21',to:'2026-01-25'},'2026-01-24');
 assert.equal(a.hours,2); assert.equal(a.partialWeeks,1);
 a=analytics(s,{from:'2026-01-19',to:'2026-01-25',project:'p'},'2026-01-24');
 assert.equal(a.hours,2); assert.equal(a.attendanceRate,null);
});
test('completion KPI and dynamic weekly series use the same latest completion date and attribution', () => {
 const s=empty();
 s.history=[{task_id:'t',member_id:'m',old_status:'todo',new_status:'done',occurred_at:'2026-01-20T12:00:00Z',changes:{after:{project_id:'p'}}},
 {task_id:'t',member_id:'m',old_status:'in_progress',new_status:'done',occurred_at:'2026-02-03T12:00:00Z',changes:{after:{project_id:'p'}}},
 {task_id:'unassigned',member_id:null,old_status:'todo',new_status:'done',occurred_at:'2026-02-04T12:00:00Z',changes:{after:{project_id:'q'}}}];
 let a=analytics(s,{from:'2026-01-01',to:'2026-03-31'},'2026-03-31');
 assert.equal(a.weekly.length,14); assert.equal(a.completed,2); assert.equal(a.weekly.reduce((n,w)=>n+w.completed,0),a.completed);
 assert.equal(analytics(s,{from:'2026-01-19',to:'2026-01-25'}).completed,0);
 a=analytics(s,{from:'2026-02-02',to:'2026-02-08',member:'m',project:'p'});
 assert.equal(a.weekly.length,1); assert.equal(a.completed,1);
 assert.equal(analytics(s,{from:'2026-02-02',to:'2026-02-08',project:'q'}).completed,1);
});
