import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import {parseDatabases,makeCatalog} from '../dist/importer.js';
import {validateBackup} from '../dist/storage.js';
const SQL=await initSqlJs();
const raw={tables:[{tag:'★',name:'Table',folder:[{name:'★20',songs:[{title:'Air',md5:'m'}]}]}]};
test('WASM import resolves MD5 using local metadata, merges upgrades and ignores alternate modes',()=>{
  const s=new SQL.Database(),l=new SQL.Database(),meta=[{sha256:'s',md5:'m',title:'Air',subtitle:'GOD'}];
  try{
    s.run("CREATE TABLE player(date,epg,playcount);INSERT INTO player VALUES(1789570800,600,1);CREATE TABLE score(sha256,mode,clear);INSERT INTO score VALUES('s',0,6),('s',1,8)");
    l.run("CREATE TABLE scorelog(sha256,mode,clear,oldclear,date);INSERT INTO scorelog VALUES('s',0,4,1,1789570900),('s',0,6,4,1789571000),('s',1,8,6,1789571100)");
    const a=parseDatabases(SQL,s.export(),l.export(),null,raw,meta);
    assert.equal(a.snapshot.days[0].notes,600);assert.equal(a.snapshot.days[0].updates.length,1);
    assert.deepEqual(a.snapshot.days[0].updates[0].labels,[{tag:'★',level:'20'}]);
    assert.equal(a.snapshot.days[0].updates[0].title,'Air GOD');assert.equal(a.snapshot.tables[0].levels[0].counts.HC,1);
    const state={...a,moods:{}};assert.deepEqual(validateBackup({format:'cinacina-backup',version:1,state}),state);
    const broken=structuredClone(state);broken.snapshot.days[0].notes=-1;assert.throws(()=>validateBackup(broken));
    const unsafe=structuredClone(state);unsafe.snapshot.days[0].updates[0].to='bad style';assert.throws(()=>validateBackup(unsafe));
    assert.throws(()=>parseDatabases(SQL,new Uint8Array([1]),l.export(),null,raw));
    assert.throws(()=>parseDatabases(SQL,l.export(),s.export(),null,raw));
  }finally{s.close();l.close();}
});
test('table-only metadata keeps all charts and cross-resolves hashes without songdata',()=>{
  const tables=structuredClone(raw);tables.tables.push({tag:'st',name:'Stella',folder:[{name:'st1',songs:[{title:'Air',md5:'m',sha256:'s'}]}]});
  const c=makeCatalog(tables);assert.equal(c.songs.size,1);assert.equal(c.songs.get('s').labels.length,2);
});
