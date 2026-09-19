import test from 'node:test';
import assert from 'node:assert/strict';
import {chartLinks,safeLink} from '../dist/chart-links.js';

test('download links match chart hashes and preserve table-specific destinations',()=>{
  const raw={tables:[{tag:'★',folder:[{songs:[{md5:'a',url:'https://example.org/song',appendurl:'https://example.org/chart'}]}]},{tag:'st',folder:[{songs:[{md5:'a',sha256:'sha',url:'https://example.org/alternate'},{md5:'b',url:'javascript:alert(1)',appendurl:'file:///secret'}]}]}]};
  const links=chartLinks(raw);
  assert.equal(links.get('★').get('sha').appendurl,'https://example.org/chart');
  assert.equal(links.get('st').get('sha').url,'https://example.org/alternate');
  assert.deepEqual(links.get('st').get('md5:b'),{url:'',appendurl:''});
  assert.equal(chartLinks({tables:[raw.tables[0]]},[{md5:'a',sha256:'installed'}]).get('★').get('installed').url,'https://example.org/song');
  for(const value of [null,'','//example.org','data:text/html,hello'])assert.equal(safeLink(value),'');
  assert.equal(safeLink('http://example.org/'),'http://example.org/');
});
