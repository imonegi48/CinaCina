export function safeLink(value){
  if(typeof value!=='string'||!value.trim())return '';
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}
}
export function chartLinks(raw,metadata=[]){
  const md5s=new Map(metadata.filter(s=>s.md5&&s.sha256).map(s=>[s.md5,s.sha256]));
  for(const t of raw.tables)for(const f of t.folder)for(const s of f.songs)if(s.md5&&s.sha256)md5s.set(s.md5,s.sha256);
  return new Map(raw.tables.map(t=>{
    const songs=new Map();
    for(const f of t.folder)for(const s of f.songs){
      const id=s.sha256||md5s.get(s.md5)||'md5:'+s.md5;
      const previous=songs.get(id)||{};
      songs.set(id,{url:safeLink(s.url)||previous.url||'',appendurl:safeLink(s.appendurl)||previous.appendurl||''});
    }
    return [t.tag,songs];
  }));
}
