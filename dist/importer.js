import {snapshotFromRows,TAGS} from './core.js';

export function query(db,sql){
  const statement=db.prepare(sql),rows=[];
  try{while(statement.step())rows.push(statement.getAsObject());}finally{statement.free();}
  return rows;
}
export function makeCatalog(raw,metadata=[]){
  const songs=new Map(),md5s=new Map();
  for(const s of metadata){
    if(!s.sha256)continue;
    songs.set(s.sha256,{sha256:s.sha256,title:[s.title,s.subtitle].filter(Boolean).join(' '),labels:[]});
    if(s.md5)md5s.set(s.md5,s.sha256);
  }
  // A shared SHA in another table can resolve entries that only provide MD5.
  for(const t of raw.tables)for(const f of t.folder)for(const s of f.songs)if(s.sha256&&s.md5)md5s.set(s.md5,s.sha256);
  const tables=raw.tables.map(t=>({tag:t.tag,name:t.name,url:t.url,levels:t.folder.map(f=>{
    const level=f.name.startsWith(t.tag)?f.name.slice(t.tag.length).trim():f.name,charts=new Set();
    for(const s of f.songs){
      const id=s.sha256||md5s.get(s.md5)||'md5:'+s.md5;
      const chart=songs.get(id)||{sha256:id,title:s.title||id,labels:[]};
      if(!chart.labels.some(l=>l.tag===t.tag&&l.level===level))chart.labels.push({tag:t.tag,level});
      songs.set(id,chart);charts.add(id);
    }
    return {level,charts:[...charts]};
  }).sort((a,b)=>a.level.localeCompare(b.level,'ja',{numeric:true}))}));
  for(const song of songs.values())song.labels.sort((a,b)=>TAGS.indexOf(a.tag)-TAGS.indexOf(b.tag)||a.level.localeCompare(b.level,'ja',{numeric:true}));
  return {songs,tables};
}
export function parseDatabases(SQL,scoreBytes,logBytes,songBytes,raw,previousMetadata=[]){
  const opened=[];
  const open=(bytes,name)=>{
    if(new TextDecoder().decode(new Uint8Array(bytes).slice(0,16))!=='SQLite format 3\0')throw Error(name+' はSQLiteファイルではありません。');
    const db=new SQL.Database(new Uint8Array(bytes));opened.push(db);return db;
  };
  try{
    const score=open(scoreBytes,'score.db'),log=open(logBytes,'scorelog.db');
    const metadata=songBytes?query(open(songBytes,'songdata.db'),'SELECT sha256,md5,title,subtitle FROM song'):previousMetadata;
    const catalog=makeCatalog(raw,metadata);
    const snapshot=snapshotFromRows(query(score,'SELECT * FROM player'),query(score,'SELECT sha256,mode,clear FROM score'),query(log,'SELECT sha256,mode,clear,oldclear,date FROM scorelog WHERE clear>oldclear ORDER BY date'),catalog);
    return {snapshot,metadata};
  }finally{for(const db of opened)db.close();}
}
