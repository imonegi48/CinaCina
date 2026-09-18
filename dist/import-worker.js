importScripts('./vendor/sql-wasm.js');
onmessage=async({data})=>{
  try{
    const [SQL,{parseDatabases},response]=await Promise.all([initSqlJs({locateFile:name=>'./vendor/'+name}),import('./importer.js'),fetch('./catalog.json')]);
    if(!response.ok)throw Error('難易度表を読み込めませんでした。再読み込みしてください。');
    postMessage({result:parseDatabases(SQL,data.score,data.log,data.song,await response.json(),data.metadata)});
  }catch(e){postMessage({error:'取り込みに失敗しました。'+e.message});}
};
