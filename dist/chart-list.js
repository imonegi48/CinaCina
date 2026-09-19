import {chartLinks} from './chart-links.js';
export const PAGE_SIZE=12;
export function chartPage(charts,lamp,search,page){
  const normalize=s=>s.normalize('NFKC').toLocaleLowerCase('ja');
  const query=normalize(search.trim());
  const filtered=charts.filter(c=>(lamp==='all'||c.lamp===lamp)&&normalize(c.title).includes(query));
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  page=Math.max(0,Math.min(page,pages-1));
  return {items:filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE),total:filtered.length,pages,page};
}
export function setupChartList(getSnapshot,getMetadata=()=>[]){
  const lamps=['NP','F','EC','C','HC','EXHC','FC','補助','不明'];
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dialog=document.createElement('dialog');dialog.id='chart-dialog';dialog.setAttribute('aria-labelledby','chart-dialog-title');
  dialog.innerHTML=`<div class="dialog-heading"><div><p class="eyebrow">CLEAR LAMP LIST</p><h2 id="chart-dialog-title"></h2></div><button id="close-charts" aria-label="一覧を閉じる">×</button></div><div class="chart-list-tools"><label>難易度表<select id="chart-table"></select></label><label>難易度<select id="chart-level"></select></label><label>曲名検索<input id="chart-search" type="search" placeholder="曲名で絞り込み" autocomplete="off"></label></div><div id="chart-lamps" class="chart-lamp-tabs" role="group" aria-label="クリアランプ"></div><p id="chart-result" aria-live="polite"></p><div id="chart-list-body"></div><nav class="chart-pagination" aria-label="曲一覧のページ"><button id="chart-prev">← 前へ</button><span id="chart-page"></span><button id="chart-next">次へ →</button></nav>`;
  document.body.append(dialog);
  const $=s=>dialog.querySelector(s);
  let linkData,linkIndex,linkMetadata,linksLoading=false,linksFailed=false;
  function loadLinks(){
    if(linkData||linksLoading)return;
    linksLoading=true;linksFailed=false;
    fetch(new URL('./catalog.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('catalog');return r.json();}).then(raw=>{linkData=raw;}).catch(()=>{linksFailed=true;}).finally(()=>{linksLoading=false;if(dialog.open)render();});
  }
  function downloadButtons(c){
    if(!linkData)return `<span class="chart-link-note">${linksFailed?'リンク読込失敗':'リンク読込中'}</span>`;
    const links=linkIndex.get(tableTag)?.get(c.id);
    const available=links?.url||links?.appendurl;
    return available?`<button type="button" class="chart-download" data-download-chart="${escape(c.id)}" aria-label="${escape(c.title)}の配布ページを新しいタブで開く" title="曲・譜面の配布ページを開く">↗</button>`:'<span class="chart-link-note" title="難易度表に配布リンクが登録されていません">リンクなし</span>';
  }
  let tableTag,levelName,lamp='all',page=0,opener;
  const table=()=>getSnapshot()?.tables.find(t=>t.tag===tableTag);
  const orderedLevels=t=>t.tag==='★'?[...t.levels].sort((a,b)=>{
    const rank=l=>Number.isFinite(Number(l.level))?Number(l.level):Infinity;
    return rank(a)-rank(b);
  }):t.levels;
  function render(){
    const metadata=getMetadata();
    if(linkData&&(!linkIndex||linkMetadata!==metadata)){linkIndex=chartLinks(linkData,metadata);linkMetadata=metadata;}
    const t=table(),level=t?.levels.find(l=>l.level===levelName);if(!level){dialog.close();return;}
    $('#chart-table').innerHTML=getSnapshot().tables.filter(t=>t.levels.length).map(t=>`<option value="${escape(t.tag)}">${escape(t.name)} (${escape(t.tag)})</option>`).join('');
    $('#chart-table').value=tableTag;
    $('#chart-level').innerHTML=orderedLevels(t).map(l=>`<option value="${escape(l.level)}">${escape(tableTag+l.level)}</option>`).join('');
    $('#chart-level').value=levelName;
    $('#chart-dialog-title').textContent=tableTag+levelName+' の譜面';
    $('#chart-lamps').innerHTML=['all',...lamps.filter(k=>level.counts[k]>0||k===lamp)].map(k=>`<button type="button" data-chart-lamp="${k}" aria-pressed="${lamp===k}" style="--lamp-color:${k==='all'?'#b6ed80':`var(--${k})`}">${k==='all'?'すべて':k}<small>${k==='all'?level.total:level.counts[k]}</small></button>`).join('');
    const available=Array.isArray(level.charts);
    $('#chart-search').disabled=!available;
    $('.chart-pagination').hidden=!available;
    if(!available){
      $('#chart-result').textContent='曲一覧を表示するには、一度DBの再取り込みが必要です。';
      $('#chart-list-body').innerHTML='<div class="empty-message">以前の保存データには件数だけが保存されています。調子の記録はそのまま引き継がれます。<p><button id="chart-reimport" class="primary">プレイ記録を取り込む</button></p></div>';
      return;
    }
    const result=chartPage(level.charts,lamp,$('#chart-search').value,page);page=result.page;
    $('#chart-result').textContent=result.total?`${result.total}曲中 ${page*PAGE_SIZE+1}〜${Math.min((page+1)*PAGE_SIZE,result.total)}曲`:'該当する曲はありません。';
    $('#chart-list-body').innerHTML=result.total?`<ul class="chart-result-grid">${result.items.map(c=>`<li><span class="chart-result-title">${escape(c.title)}</span><span class="chart-result-actions"><span class="lamp" style="color:var(--${c.lamp})">${c.lamp}</span>${downloadButtons(c)}</span></li>`).join('')}</ul>`:'<p class="empty-message">検索条件を変えてみてください。</p>';
    $('#chart-page').textContent=`${page+1} / ${result.pages}`;
    $('#chart-prev').disabled=page===0;$('#chart-next').disabled=page===result.pages-1;
    $('#chart-list-body').scrollTop=0;
  }
  function open(tag,level,selectedLamp,source){
    tableTag=tag;levelName=level;lamp=selectedLamp;page=0;opener=source;
    const t=table();if(!t)return;
    loadLinks();$('#chart-search').value='';render();dialog.showModal();
  }
  $('#close-charts').onclick=()=>dialog.close();
  const isBackdrop=e=>{
    if(e.target!==dialog)return false;
    const r=dialog.getBoundingClientRect();
    return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;
  };
  let pressedBackdrop=false;
  dialog.addEventListener('pointerdown',e=>{pressedBackdrop=e.button===0&&isBackdrop(e);});
  dialog.addEventListener('pointercancel',()=>{pressedBackdrop=false;});
  dialog.addEventListener('click',e=>{
    if(pressedBackdrop&&isBackdrop(e))dialog.close();
    pressedBackdrop=false;
  });
  dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});});
  $('#chart-table').onchange=e=>{
    tableTag=e.target.value;
    const t=table();
    levelName=(t.tag==='★'?t.levels.find(l=>l.level==='1'):t.levels.find(l=>l.level===levelName))?.level??orderedLevels(t)[0].level;
    page=0;render();
  };
  $('#chart-level').onchange=e=>{levelName=e.target.value;page=0;render();};
  $('#chart-search').oninput=()=>{page=0;render();};
  $('#chart-prev').onclick=()=>{page--;render();};$('#chart-next').onclick=()=>{page++;render();};
  dialog.addEventListener('click',e=>{
    const download=e.target.closest('[data-download-chart]');
    if(download){
      const links=linkIndex?.get(tableTag)?.get(download.dataset.downloadChart);
      const urls=[...new Set([links?.url,links?.appendurl].filter(Boolean))];
      const blocked=[];
      for(const url of urls){
        const tab=window.open('about:blank','_blank');
        if(tab){tab.opener=null;tab.location.replace(url);}else blocked.push(url);
      }
      download.parentElement.querySelector('.chart-download-retry')?.remove();
      if(blocked.length){
        const retry=document.createElement('span');retry.className='chart-download-retry';
        retry.innerHTML=`<span class="chart-link-note" role="status">ブロックされたページ：</span>${blocked.map(url=>`<a class="chart-download" href="${escape(url)}" target="_blank" rel="noopener noreferrer" title="開けなかった配布ページを開く" aria-label="開けなかった配布ページを開く">↗</a>`).join('')}`;
        download.parentElement.append(retry);
      }
    }
    const target=e.target.closest('[data-chart-lamp]');
    if(target){lamp=target.dataset.chartLamp;page=0;render();dialog.querySelector(`[data-chart-lamp="${lamp}"]`)?.focus();}
    if(e.target.closest('#chart-reimport')){dialog.close();document.querySelector('#open-import').click();}
  });
  document.querySelector('#bars').addEventListener('click',e=>{
    const target=e.target.closest('[data-chart-table]');
    if(target)open(target.dataset.chartTable,target.dataset.chartLevel,target.dataset.chartLamp||'all',target);
  });
  return ()=>{if(dialog.open)render();};
}
