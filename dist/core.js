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
export function snapshotFromRows(playerRows,scoreRows,logRows,catalog) {
  const days=dailyActivity(playerRows);
  const scores=scoreRows;
  const best=new Map(scores.filter(s=>s.mode===0).map(s=>[s.sha256,lamp(s.clear)]));
  const activity=new Map(days.map(d=>[d.date,{...d,updates:[]}]));
  const grouped=new Map();
  for(const log of logRows) {
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
