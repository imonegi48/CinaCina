import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Extract only shared table metadata, never player records or the installed-song catalog.
const config=JSON.parse(fs.readFileSync('config.local.json','utf8'));
const tables=[];
for(const file of fs.readdirSync(path.join(config.beatorajaPath,'table')).filter(f=>f.endsWith('.bmt'))){
  const raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(config.beatorajaPath,'table',file))));
  if(!['★','★★','st','sl'].includes(raw.tag?.trim()))continue;
  tables.push({tag:raw.tag.trim(),name:raw.name,url:raw.url,folder:raw.folder.map(f=>({name:f.name,songs:f.songs.map(s=>({title:s.title,md5:s.md5,sha256:s.sha256}))}))});
}
fs.writeFileSync('dist/catalog.json',JSON.stringify({updatedAt:new Date().toISOString().slice(0,10),tables}));
fs.mkdirSync('dist/vendor',{recursive:true});
for(const name of ['sql-wasm.js','sql-wasm.wasm'])fs.copyFileSync('node_modules/sql.js/dist/'+name,'dist/vendor/'+name);
fs.copyFileSync('node_modules/sql.js/LICENSE','dist/vendor/sql.js-LICENSE');
fs.mkdirSync('dist/images',{recursive:true});
for(const name of ['B.png','GOD_B.png','DEATH_B.png'])fs.copyFileSync('images/'+name,'dist/images/'+name);
const lib=fs.readFileSync('lib.mjs','utf8');
const start=lib.indexOf('export const TAGS');
const end=lib.indexOf('function readDB');
let build=lib.slice(lib.indexOf('export function buildSnapshot'));
build=build.replace('buildSnapshot(scorePath,logPath,catalog)','snapshotFromRows(playerRows,scoreRows,logRows,catalog)').replace("readDB(scorePath,'SELECT * FROM player')",'playerRows').replace("readDB(scorePath,'SELECT sha256,mode,clear FROM score')",'scoreRows').replace("readDB(logPath,'SELECT sha256,mode,clear,oldclear,date FROM scorelog WHERE clear>oldclear ORDER BY date')",'logRows');
fs.writeFileSync('dist/core.js',lib.slice(start,end)+build);
console.log('Browser assets ready; public table metadata only.');
