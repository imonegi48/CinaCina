import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {dailyActivity,dateKey,lamp,chartSort,buildSnapshot,validateReplacement,migrateLampNames} from '../lib.mjs';
test('legacy normal-clear names migrate without changing titles, moods or counts',()=>{
  const state={days:[{updates:[{title:'NC Song',from:'NC',to:'HC'},{title:'B',from:'F',to:'NC'}]}],tables:[{levels:[{counts:{NP:3,NC:2,HC:5}}]}]};
  assert.equal(migrateLampNames(state),true);
  assert.equal(state.days[0].updates[0].title,'NC Song');
  assert.equal(state.days[0].updates[0].from,'C');assert.equal(state.days[0].updates[1].to,'C');
  assert.deepEqual(state.tables[0].levels[0].counts,{NP:3,C:2,HC:5});
  assert.equal(migrateLampNames(state),false);
});
const day=Date.parse('2026-09-17T00:00:00+09:00')/1000;
test('beatoraja total notes: FAST/SLOW PG/GR/GD/BD only, daily cumulative difference',()=>{
  const rows=[{date:0,epg:0},{date:day,epg:10,lpg:20,egr:30,lgr:40,egd:50,lgd:60,ebd:70,lbd:80,epr:999,lpr:999,ems:999,lms:999,playcount:2},{date:day+86400,epg:110,lpg:20,egr:30,lgr:40,egd:50,lgd:60,ebd:70,lbd:80,epr:2000,playcount:3}];
  assert.deepEqual(dailyActivity(rows),[{date:'2026-09-17',notes:360,plays:2},{date:'2026-09-18',notes:100,plays:1}]);
});
test('midnight boundary is JST, independent of upload time',()=>{
  assert.equal(dateKey(day-1),'2026-09-16');assert.equal(dateKey(day),'2026-09-17');
});
test('lamp mapping preserves beatoraja clear ids and groups perfect/max under FC',()=>{
  assert.deepEqual([0,1,4,5,6,7,8,9,10].map(lamp),['NP','F','EC','C','HC','EXHC','FC','FC','FC']);assert.equal(lamp(2),'補助');
});
test('table priority then numerical levels',()=>{
  const input=[['sl','0'],['★','20'],['st','1'],['★★','1'],['★','2']].map(([tag,level])=>({title:'A',labels:[{tag,level}]}));
  assert.deepEqual(input.sort(chartSort).map(x=>x.labels[0].tag+x.labels[0].level),['★2','★20','★★1','st1','sl0']);
});
test('same-day reimport and upgrades are idempotent; unsaved modes do not mix',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cinacina-test-'));
  const score=path.join(dir,'score.db'),log=path.join(dir,'scorelog.db');
  try{
    const s=new DatabaseSync(score);s.exec('CREATE TABLE player(date INTEGER,epg INTEGER,playcount INTEGER); CREATE TABLE score(sha256 TEXT,mode INTEGER,clear INTEGER);');s.prepare('INSERT INTO player VALUES(?,?,?)').run(day,600,1);s.exec("INSERT INTO score VALUES('air',0,6),('air',1,8)");s.close();
    const l=new DatabaseSync(log);l.exec('CREATE TABLE scorelog(sha256 TEXT,mode INTEGER,clear INTEGER,oldclear INTEGER,date INTEGER)');const insert=l.prepare('INSERT INTO scorelog VALUES(?,?,?,?,?)');insert.run('air',0,4,1,day+100);insert.run('air',0,6,4,day+200);insert.run('air',1,8,6,day+300);l.close();
    const catalog={songs:new Map([['air',{title:'Air-GOD',labels:[{tag:'★',level:'20'},{tag:'st',level:'1'}]}]]),tables:[{tag:'★',levels:[{level:'20',charts:['air','unplayed']}]}]};
    const a=buildSnapshot(score,log,catalog),b=buildSnapshot(score,log,catalog);
    assert.deepEqual(a.days,b.days);assert.equal(a.days[0].updates.length,1);assert.equal(a.days[0].updates[0].from,'F');assert.equal(a.days[0].updates[0].to,'HC');assert.equal(a.tables[0].levels[0].counts.NP,1);assert.equal(a.tables[0].levels[0].counts.HC,1);
    const edit=new DatabaseSync(score);edit.exec('UPDATE player SET epg=900,playcount=2');edit.close();
    const c=buildSnapshot(score,log,catalog);assert.equal(c.days[0].notes,900);assert.equal(c.days[0].plays,2);validateReplacement(a,c);assert.throws(()=>validateReplacement(c,a));
  }finally{for(const p of [score,log])fs.rmSync(p,{force:true});fs.rmdirSync(dir);}
});
test('no history cannot overwrite existing records',()=>assert.throws(()=>validateReplacement(null,{days:[]})));
