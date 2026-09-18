import {LAMPS,migrateLampNames,validateReplacement} from './core.js';
const MOODS=['神格Ｂ','Ｂ','デスＢ'];
let dbPromise;
function database(){
  return dbPromise??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('cinacina',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('records');
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
    request.onerror=()=>reject(Error('ブラウザーの保存領域を開けません。通常のブラウザーウィンドウで開いてください。'));
    request.onblocked=()=>reject(Error('他のCinaCinaのタブを閉じて再読み込みしてください。'));
  });
}
export async function loadState(){
  const db=await database();
  return new Promise((resolve,reject)=>{const r=db.transaction('records').objectStore('records').get('state');r.onsuccess=()=>resolve(r.result||{snapshot:null,moods:{},metadata:[]});r.onerror=()=>reject(r.error);});
}
// Read-modify-write inside one transaction also preserves changes from another tab.
export async function updateState(transform){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),r=store.get('state');let next,failure;
    r.onsuccess=()=>{try{next=transform(r.result||{snapshot:null,moods:{},metadata:[]});store.put(next,'state');}catch(e){failure=e;tx.abort();}};
    tx.oncomplete=()=>resolve(next);
    tx.onabort=tx.onerror=()=>reject(failure||Error('記録を保存できませんでした。保存容量やブラウザーの設定を確認してください。'));
  });
}
export async function importFiles(score,log,song){
  const prior=await loadState();
  const data={score:await score.arrayBuffer(),log:await log.arrayBuffer(),song:song?await song.arrayBuffer():null,metadata:prior.metadata||[]};
  const parsed=await new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./import-worker.js',import.meta.url));
    worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error)):resolve(data.result);};
    worker.onerror=()=>{worker.terminate();reject(Error('DBの読み込みを開始できませんでした。再読み込みしてお試しください。'));};
    worker.postMessage(data);
  });
  let changed,first;
  const next=await updateState(old=>{
    validateReplacement(old.snapshot,parsed.snapshot);
    const days=new Map((old.snapshot?.days||[]).map(d=>[d.date,d]));first=!old.snapshot;
    changed=parsed.snapshot.days.filter(d=>d.notes>0&&JSON.stringify(days.get(d.date))!==JSON.stringify(d)).map(d=>d.date).sort().reverse();
    return {...old,...parsed};
  });
  // Persistence is best-effort; export remains available when the browser declines.
  navigator.storage?.persist?.().catch(()=>{});
  return {...next,changed:first?changed.slice(0,1):changed,first};
}
export function saveMood(date,mood){return updateState(old=>{
  if(!MOODS.includes(mood)||!old.snapshot?.days.some(d=>d.date===date&&d.notes>0))throw Error('プレイ日と調子を選んでください。');
  return {...old,moods:{...old.moods,[date]:mood}};
});}
export function validateBackup(value){
  const s=structuredClone(value?.format==='cinacina-backup'&&value.version===1?value.state:value);
  const fail=()=>{throw Error('CinaCinaの有効なバックアップではありません。');};
  const string=v=>typeof v==='string';
  const number=v=>Number.isSafeInteger(v)&&v>=0;
  const date=v=>string(v)&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  if(!s?.snapshot||!s.moods||typeof s.moods!=='object')fail();
  const p=s.snapshot;migrateLampNames(p);
  if(!string(p.importedAt)||isNaN(Date.parse(p.importedAt))||!Array.isArray(p.days)||!p.days.length||!Array.isArray(p.tables)||!number(p.scoreCount))fail();
  const seen=new Set();
  for(const d of p.days){
    if(!date(d.date)||seen.has(d.date)||!number(d.notes)||!number(d.plays)||!Array.isArray(d.updates))fail();seen.add(d.date);
    for(const u of d.updates)if(!string(u.title)||!string(u.sha256)||!LAMPS.concat('補助','不明').includes(u.from)||!LAMPS.concat('補助','不明').includes(u.to)||!Array.isArray(u.labels)||u.labels.some(l=>!['★','★★','st','sl'].includes(l.tag)||!string(l.level)))fail();
  }
  for(const t of p.tables){
    if(!['★','★★','st','sl'].includes(t.tag)||!string(t.name)||!Array.isArray(t.levels))fail();
    for(const l of t.levels)if(!string(l.level)||!number(l.total)||!l.counts||LAMPS.concat('補助','不明').some(k=>!number(l.counts[k]))||Object.values(l.counts).reduce((n,v)=>n+v,0)!==l.total)fail();
  }
  for(const [d,m]of Object.entries(s.moods))if(!date(d)||!MOODS.includes(m)||!p.days.some(day=>day.date===d&&day.notes>0))fail();
  if(s.metadata!==undefined&&(!Array.isArray(s.metadata)||s.metadata.some(m=>!string(m.sha256)||['md5','title','subtitle'].some(k=>m[k]!=null&&!string(m[k])))))fail();
  return {snapshot:p,moods:s.moods,metadata:s.metadata||[]};
}
