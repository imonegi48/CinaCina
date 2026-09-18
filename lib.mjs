import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

export const TAGS = ['★', '★★', 'st', 'sl'];
export const LAMPS = ['NP', 'F', 'EC', 'C', 'HC', 'EXHC', 'FC'];
export function migrateLampNames(snapshot){
  let changed=false;
  for(const day of snapshot?.days||[])for(const update of day.updates||[])for(const key of ['from','to']){
    if(update[key]==='NC'){update[key]='C';changed=true;}
  }
  for(const table of snapshot?.tables||[])for(const level of table.levels||[]){
    if(Object.hasOwn(level.counts,'NC')){
      level.counts.C=level.counts.C??level.counts.NC;
      delete level.counts.NC;changed=true;
    }
  }
  return changed;
}
export function lamp(value) {
  return ({0:'NP',1:'F',2:'補助',3:'補助',4:'EC',5:'C',6:'HC',7:'EXHC',8:'FC',9:'FC',10:'FC'})[value] ?? '不明';
}
export function dateKey(seconds) { return new Date(Number(seconds)*1000 + 9*3600*1000).toISOString().slice(0,10); }
export function dailyActivity(rows) {
  // Matches beatoraja IntegerPropertyFactory.player_notes (skin number 333):
  // PlayerData.getJudgeCount(0) + (1) + (2) + (3), each FAST + SLOW.
  const keys=['epg','lpg','egr','lgr','egd','lgd','ebd','lbd'];
  const ordered=rows.filter(r=>r.date>0).sort((a,b)=>a.date-b.date);
  // date=0 is beatoraja's all-time row, never a daily baseline.
  let previous=null;
  return ordered.map(row=>{
    const total=keys.reduce((n,k)=>n+Number(row[k]||0),0);
    const count=Number(row.playcount||0);
    const result={date:dateKey(row.date),notes:Math.max(0,total-(previous?.total||0)),plays:Math.max(0,count-(previous?.count||0))};
    previous={total,count}; return result;
  });
}
export function validateReplacement(previous,next) {
  if(!next.days.length)throw Error('日別のプレイ記録がありません。');
  if(!previous)return;
  const oldTotal=previous.days.reduce((n,d)=>n+d.notes,0),newTotal=next.days.reduce((n,d)=>n+d.notes,0);
  const oldPlays=previous.days.reduce((n,d)=>n+d.plays,0),newPlays=next.days.reduce((n,d)=>n+d.plays,0);
  const oldLast=previous.days.map(d=>d.date).sort().at(-1),newLast=next.days.map(d=>d.date).sort().at(-1);
  if(newLast<oldLast||newTotal<oldTotal||newPlays<oldPlays)throw Error('現在の記録より古い、または異なるプレイヤーのデータです。最新の2ファイルを選んでください。');
}
export function chartSort(a,b) {
  const aa=a.labels?.[0],bb=b.labels?.[0];
  return (aa?TAGS.indexOf(aa.tag):4)-(bb?TAGS.indexOf(bb.tag):4)
    || String(aa?.level??'').localeCompare(String(bb?.level??''),'ja',{numeric:true})
    || a.title.localeCompare(b.title,'ja');
}
function readDB(file,query) {const db=new DatabaseSync(file,{readOnly:true});try{return db.prepare(query).all();}finally{db.close();}}
export function loadCatalog(base) {
  const songs=new Map(),byMd5=new Map();
  const songFile=path.join(base,'songdata.db');
  if(fs.existsSync(songFile)) for(const s of readDB(songFile,'SELECT sha256,md5,title,subtitle FROM song')) {
    if(!s.sha256)continue;
    const row={sha256:s.sha256,title:[s.title,s.subtitle].filter(Boolean).join(' '),labels:[]};
    songs.set(s.sha256,row); if(s.md5)byMd5.set(s.md5,s.sha256);
  }
  const tables=[];
  const dir=path.join(base,'table');
  if(fs.existsSync(dir)) for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.bmt'))) {
    const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir,file))));
    const tag=raw.tag?.trim(); if(!TAGS.includes(tag))continue;
    const table={tag,name:raw.name,url:raw.url,levels:[]};
    for(const folder of raw.folder||[]) {
      const level=folder.name.startsWith(tag)?folder.name.slice(tag.length).trim():folder.name;
      const charts=[];const seen=new Set();
      for(const entry of folder.songs||[]) {
        const sha=entry.sha256 || byMd5.get(entry.md5);
        const id=sha || 'md5:'+entry.md5;
        if(seen.has(id))continue;seen.add(id);
        const chart=songs.get(id)||{sha256:id,title:entry.title||id,labels:[]};
        if(!chart.labels.some(l=>l.tag===tag&&l.level===level))chart.labels.push({tag,level});
        songs.set(id,chart); charts.push(id);
      }
      table.levels.push({level,charts});
    }
    table.levels.sort((a,b)=>a.level.localeCompare(b.level,'ja',{numeric:true}));tables.push(table);
  }
  for(const s of songs.values())s.labels.sort((a,b)=>TAGS.indexOf(a.tag)-TAGS.indexOf(b.tag)||a.level.localeCompare(b.level,'ja',{numeric:true}));
  return {songs,tables:tables.sort((a,b)=>TAGS.indexOf(a.tag)-TAGS.indexOf(b.tag))};
}
export function buildSnapshot(scorePath,logPath,catalog) {
  const days=dailyActivity(readDB(scorePath,'SELECT * FROM player'));
  const scores=readDB(scorePath,'SELECT sha256,mode,clear FROM score');
  const best=new Map(scores.filter(s=>s.mode===0).map(s=>[s.sha256,lamp(s.clear)]));
  const activity=new Map(days.map(d=>[d.date,{...d,updates:[]}]));
  const grouped=new Map();
  for(const log of readDB(logPath,'SELECT sha256,mode,clear,oldclear,date FROM scorelog WHERE clear>oldclear ORDER BY date')) {
    if(log.mode!==0 || lamp(log.clear)===lamp(log.oldclear))continue;
    const date=dateKey(log.date),key=date+':'+log.sha256;
    const chart=catalog.songs.get(log.sha256)||{title:'未照合の譜面 '+log.sha256.slice(0,10),labels:[],sha256:log.sha256};
    if(grouped.has(key))grouped.get(key).to=lamp(log.clear);
    else grouped.set(key,{...chart,date,from:lamp(log.oldclear),to:lamp(log.clear)});
  }
  for(const update of grouped.values()) {
    const day=activity.get(update.date);
    if(day) day.updates.push(update);
  }
  for(const day of activity.values())day.updates.sort(chartSort);
  const tables=catalog.tables.map(t=>({...t,levels:t.levels.map(l=>{
    const counts=Object.fromEntries([...LAMPS,'補助','不明'].map(k=>[k,0]));
    for(const id of l.charts)counts[best.get(id)||'NP']++;
    return {level:l.level,total:l.charts.length,counts};
  })}));
  return {importedAt:new Date().toISOString(),days:[...activity.values()],tables,scoreCount:best.size};
}
