import test from 'node:test';
import assert from 'node:assert/strict';
import {chartPage} from '../dist/chart-list.js';
import {snapshotFromRows} from '../dist/core.js';
import {validateBackup} from '../dist/storage.js';
test('lists match current lamps, including unplayed charts and multiple table memberships',()=>{
  const catalog={songs:new Map([['a',{title:'Air',labels:[]}],['b',{title:'Unplayed',labels:[]}]]),tables:['★','st'].map(tag=>({tag,name:tag,levels:[{level:'1',charts:['a','b']}]}))};
  const snapshot=snapshotFromRows([{date:1789570800,epg:20,playcount:1}],[{sha256:'a',mode:0,clear:6},{sha256:'a',mode:1,clear:8}],[],catalog);
  for(const table of snapshot.tables){const l=table.levels[0];assert.equal(l.counts.HC,1);assert.equal(l.counts.NP,1);assert.deepEqual(l.charts,[{id:'a',title:'Air',lamp:'HC'},{id:'b',title:'Unplayed',lamp:'NP'}]);}
  const state={snapshot,moods:{},metadata:[]};assert.deepEqual(validateBackup(state),state);
  const bad=structuredClone(state);bad.snapshot.tables[0].levels[0].charts[0].lamp='FC';assert.throws(()=>validateBackup(bad));
  const old=structuredClone(state);for(const t of old.snapshot.tables)delete t.levels[0].charts;assert.deepEqual(validateBackup(old),old);
});
test('pagination and normalized search preserve exact lamp filtering and handle empty results',()=>{
  const charts=Array.from({length:30},(_,i)=>({id:String(i),title:'ＡＩＲ '+i,lamp:i===29?'HC':'EC'}));
  assert.equal(chartPage(charts,'EC','air',0).items.length,12);
  const last=chartPage(charts,'EC','air',99);assert.equal(last.page,2);assert.equal(last.items.length,5);assert.equal(last.total,29);
  assert.equal(chartPage(charts,'HC','',0).items[0].id,'29');
  assert.equal(chartPage(charts,'all','',0).total,30);
  assert.deepEqual(chartPage(charts,'EC','missing',9),{items:[],total:0,pages:1,page:0});
});
