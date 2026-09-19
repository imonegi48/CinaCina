import {loadState,importFiles,saveMood as persistMood,updateState,validateBackup} from './storage.js';
import {setupChartList} from './chart-list.js';
const $=s=>document.querySelector(s),fmt=n=>Number(n).toLocaleString('ja-JP');
const MOODS=['神格Ｂ','Ｂ','デスＢ'],ICONS={'神格Ｂ':'GOD_B.png','Ｂ':'B.png','デスＢ':'DEATH_B.png'};
const moodImage=m=>`<img class="mood-image" src="./images/${ICONS[m]}" alt="${m}" width="48" height="48">`;
const LAMPS=['NP','F','EC','C','HC','EXHC','FC'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jst=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
let state={snapshot:null,moods:{}},month=jst().slice(0,7),selected=null,tableTag='sl';
const refreshChartList=setupChartList(()=>state.snapshot,()=>state.metadata||[]);
const updateFilters=new Set(['EC','C','HC','EXHC','FC']);
function renderLampSection(day){
  const visible=day.updates.filter(u=>updateFilters.has(u.to));
  return `<div class="lamp-section-heading"><div class="section-label">ランプ更新 <span>${visible.length} / ${day.updates.length}件</span></div><div class="lamp-filters" role="group" aria-label="更新後のランプで絞り込み">${['F','EC','C','HC','EXHC','FC'].map(l=>`<button type="button" data-lamp-filter="${l}" aria-pressed="${updateFilters.has(l)}" title="${l==='C'?'C（NORMAL CLEAR）':l}を${updateFilters.has(l)?'非表示':'表示'}" class="${updateFilters.has(l)?'enabled':''}" style="--filter-color:var(--${l})">${l}</button>`).join('')}</div></div>${visible.length?renderUpdateGroups(visible):`<p class="empty-message">${day.updates.length?'選択したランプの更新はありません。':'この日のランプ更新はありません。'}</p>`}`;
}
function notice(message){$('#notice').hidden=false;$('#notice').textContent=message;}
function dayData(date){return state.snapshot?.days.find(d=>d.date===date);}
function buildPostText(day){
  return ['EC','C','HC','EXHC','FC'].map(lamp=>{
    const updates=(day?.updates||[]).filter(u=>u.to===lamp);
    if(!updates.length)return '';
    return `＜新規${lamp}＞\n`+groupUpdates(updates).map(group=>
      `【${group.name}】\n`+group.updates.map(u=>`・${u.title.replace(/[\r\n]+/g,' ')}`).join('\n')
    ).join('\n\n');
  }).filter(Boolean).join('\n\n');
}
function choices(date){return `<div class="mood-choices">${MOODS.map(m=>`<button class="${state.moods[date]===m?'chosen':''}" data-mood="${m}" data-date="${date}" aria-pressed="${state.moods[date]===m}"><span aria-hidden="true">${moodImage(m)}</span>${m}</button>`).join('')}</div>`;}
function render(){
  const [year,mo]=month.split('-').map(Number),days=state.snapshot?.days||[];
  $('#month').textContent=`${year}年 ${mo}月`;
  const monthly=days.filter(d=>d.date.startsWith(month)&&d.notes>0);
  $('#total-notes').textContent=state.snapshot?fmt(days.reduce((n,d)=>n+d.notes,0)):'—';
  $('#total-days').textContent=state.snapshot?fmt(days.filter(d=>d.notes>0).length):'—';
  $('#stat-notes').textContent=state.snapshot?fmt(monthly.reduce((n,d)=>n+d.notes,0)):'—';
  $('#stat-days').textContent=state.snapshot?monthly.length:'—';
  $('#stat-updates').textContent=state.snapshot?monthly.reduce((n,d)=>n+d.updates.length,0):'—';
  $('#sync-status').textContent=state.snapshot?'最終取り込み '+new Date(state.snapshot.importedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'まだデータを取り込んでいません';
  const count=new Date(Date.UTC(year,mo,0)).getUTCDate(),offset=new Date(Date.UTC(year,mo-1,1)).getUTCDay();
  let html='<div class="day pad"></div>'.repeat(offset);
  for(let n=1;n<=count;n++){
    const date=`${month}-${String(n).padStart(2,'0')}`,day=dayData(date),active=day?.notes>0,mood=state.moods[date];
    html+=`<button class="day ${active?'':'empty'} ${selected===date?'selected':''} ${date===jst()?'today':''}" data-day="${date}" ${active?'':'disabled'} aria-label="${date}${active?' '+fmt(day.notes)+'打鍵 '+(mood||'調子未登録'):' プレイなし'}" ${active?`title="${fmt(day.notes)} 打鍵 · ${day.plays} プレイ${mood?' · '+mood:''}"`:''}><span class="number">${n}</span>${active&&mood?`<span class="mood-icon" aria-hidden="true">${moodImage(mood)}</span>`:''}${active?`<span class="notes-mini">${fmt(day.notes)}</span>`:''}</button>`;
  }
  $('#calendar').innerHTML=html;
  renderDetail();renderTables();refreshChartList();
  if(dayData(selected)?.notes>0){const text=buildPostText(dayData(selected)); $('#detail').insertAdjacentHTML('afterbegin',`<button id="open-post" class="full" ${text?'':'disabled'} style="margin-bottom:20px" title="EC以上のランプ更新をまとめます">投稿用テキストをコピー</button>`);}
}
function groupUpdates(updates){
  const priority=['★★','★','st','sl'];
  const compare=(a,b)=>priority.indexOf(a.tag)-priority.indexOf(b.tag)||String(b.level).localeCompare(String(a.level),'ja',{numeric:true});
  const groups=new Map();
  for(const update of updates){
    const label=[...update.labels].filter(l=>priority.includes(l.tag)).sort(compare)[0];
    const name=label?label.tag+label.level:'表外';
    if(!groups.has(name))groups.set(name,{name,label,updates:[]});
    groups.get(name).updates.push(update);
  }
  return [...groups.values()].sort((a,b)=>a.label&&b.label?compare(a.label,b.label):a.label?-1:b.label?1:0).map(g=>({...g,updates:[...g.updates].sort((a,b)=>a.title.localeCompare(b.title,'ja'))}));
}
function renderUpdateGroups(updates){
  if(!updates.length)return '<p class="empty-message">この日のランプ更新はありません。</p>';
  return `<div class="update-groups">${groupUpdates(updates).map(g=>`<section class="update-group" aria-label="${esc(g.name)}のランプ更新"><h3>${esc(g.name)}<span>${g.updates.length}曲</span></h3><ul class="updates">${g.updates.map(u=>`<li class="update"><div class="chart-title" title="${esc(u.title)}">${esc(u.title)}</div><div class="lamp-change"><span class="lamp" style="color:var(--${u.from})">${u.from}</span> → <span class="lamp" style="color:var(--${u.to})">${u.to}</span></div></li>`).join('')}</ul></section>`).join('')}</div>`;
}
function renderDetail(){
  const day=dayData(selected);
  if(!day||!day.notes){$('#detail-date').textContent='日付を選択';$('#detail').innerHTML='<p class="empty-message">'+(state.snapshot?'プレイした日を選ぶと、その日の成果を振り返れます。':'2つのDBを取り込むと、ここに日別の記録が表示されます。')+'</p>';return;}
  $('#detail-date').textContent=new Date(selected+'T12:00:00+09:00').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo',month:'long',day:'numeric',weekday:'short'});
  $('#detail').innerHTML=`<div class="daily-overview"><div class="daily-numbers"><div><strong>${fmt(day.notes)}</strong><small>打鍵数</small></div><div><strong>${fmt(day.plays)}</strong><small>プレイ回数</small></div></div><div class="daily-mood"><div class="section-label">この日の調子 <span>${state.moods[selected]?'記録済み':'未登録'}</span></div>${choices(selected)}</div></div><div id="lamp-section">${renderLampSection(day)}</div>`;
}
function renderTables(){
  const tables=state.snapshot?.tables||[],table=tables.find(t=>t.tag===tableTag)||tables[0];
  $('#table-tabs').innerHTML=['sl','st','★','★★'].map(t=>`<button data-table="${t}" class="${table?.tag===t?'active':''}">${({sl:'Satellite',st:'Stella'})[t]||t}</button>`).join('');
  if(!table){$('#table-description').textContent='データ取り込み後に表示します';$('#bars').innerHTML='<p class="empty-message">Satellite / Stella / ★ / ★★ の全譜面を集計します。</p>';$('#legend').innerHTML='';return;}
  const extras=['補助','不明'].filter(l=>table.levels.some(r=>r.counts[l]>0)),lamps=[...LAMPS,...extras];
  $('#legend').innerHTML=lamps.map(l=>`<span><i style="background:var(--${l})"></i>${l}</span>`).join('');
  $('#table-description').textContent=`${table.name} · 全 ${fmt(table.levels.reduce((n,l)=>n+l.total,0))} 譜面`;
  $('#bars').innerHTML=table.levels.map(l=>{
    const cleared=['EC','C','HC','EXHC','FC'].reduce((n,k)=>n+l.counts[k],0);
    const attrs=`data-chart-table="${esc(table.tag)}" data-chart-level="${esc(l.level)}"`;
    return `<div class="bar-row"><button class="bar-label" ${attrs} aria-haspopup="dialog" title="${esc(table.tag+l.level)}の全譜面を見る">${esc(table.tag+l.level)}</button><div class="bar-track" role="group" aria-label="${esc(table.tag+l.level)}のクリアランプ">${[...lamps].reverse().filter(k=>l.counts[k]).map(k=>`<button type="button" class="bar-part" ${attrs} data-chart-lamp="${k}" aria-haspopup="dialog" aria-label="${esc(table.tag+l.level)} ${k}: ${l.counts[k]}譜面の一覧" style="width:${l.counts[k]/l.total*100}%;background:var(--${k})" title="${k}: ${l.counts[k]}譜面 — クリックで一覧"></button>`).join('')}</div><span class="bar-caption" title="EC以上 / 全譜面">${cleared} / ${l.total}</span></div>`;
  }).join('');
}
async function saveMood(date,mood){try{state=await persistMood(date,mood);render();renderMoodDays();}catch(e){notice(e.message);}}
let moodDates=[];
function renderMoodDays(){$('#mood-days').innerHTML=moodDates.map(date=>`<div class="mood-day"><strong>${date}</strong> <small>${fmt(dayData(date)?.notes||0)} 打鍵</small>${choices(date)}</div>`).join('');}
async function importData(score,log,song){
  $('#import-error').textContent='DBを読み込んでいます…';$('#import-dialog').querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
    const result=await importFiles(score,log,song);state=result;const dates=state.snapshot.days.filter(d=>d.notes>0).map(d=>d.date).sort();selected=dates.at(-1);if(selected)month=selected.slice(0,7);render();$('#import-dialog').close();
    notice((result.first?'過去の記録を取り込みました。以前の日の調子は、カレンダーから登録できます。':'プレイ記録を更新しました。同じ記録は重複して加算されません。')+(result.metadata?.length?'':' 一部の曲名・難易度表の照合にはsongdata.dbも選んで再取り込みしてください。'));
    $('#import-error').textContent='';
    moodDates=result.changed;renderMoodDays();if(moodDates.length)$('#mood-dialog').showModal();
  }catch(e){$('#import-error').textContent=e.message;}finally{$('#import-dialog').querySelectorAll('button').forEach(b=>b.disabled=false);}
}
function shiftMonth(delta){const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);render();}
$('#prev').onclick=()=>shiftMonth(-1);$('#next').onclick=()=>shiftMonth(1);
$('#open-import').onclick=()=>$('#import-dialog').showModal();$('#close-import').onclick=()=>$('#import-dialog').close();
$('#close-moods').onclick=$('#finish-moods').onclick=()=>$('#mood-dialog').close();

$('#close-post').onclick=()=>$('#post-dialog').close();
document.addEventListener('click',e=>{
  const filter=e.target.closest('[data-lamp-filter]');
  if(filter){
    const lamp=filter.dataset.lampFilter;
    if(updateFilters.has(lamp))updateFilters.delete(lamp);else updateFilters.add(lamp);
    $('#lamp-section').innerHTML=renderLampSection(dayData(selected));
    document.querySelector(`[data-lamp-filter="${lamp}"]`).focus({preventScroll:true});
    return;
  }
  if(!e.target.closest('#open-post'))return;
  $('#post-date').textContent=selected+' のランプ更新';
  $('#post-text').value=buildPostText(dayData(selected));
  $('#copy-status').textContent='';
  $('#post-dialog').showModal();
});
$('#copy-post').onclick=async()=>{
  const text=$('#post-text');
  if(!text.value.trim()){$('#copy-status').textContent='コピーする内容を入力してください。';return;}
  try{await navigator.clipboard.writeText(text.value);$('#copy-status').textContent='コピーしました。Twitterの投稿欄に貼り付けてください。';}
  catch{ text.focus();text.select();$('#copy-status').textContent='自動コピーが利用できません。選択されたテキストをCtrl+Cでコピーしてください。'; }
};
$('#import-form').onsubmit=async e=>{e.preventDefault();const a=$('#score-file').files[0],b=$('#log-file').files[0];if(!a||!b){$('#import-error').textContent='2つのファイルを選択してください。';return;}try{await importData(a,b,$('#song-file').files[0]);}catch(e){$('#import-error').textContent=e.message;}};
document.addEventListener('click',e=>{const day=e.target.closest('[data-day]'),m=e.target.closest('[data-mood]'),t=e.target.closest('[data-table]');if(day&&!day.disabled){selected=day.dataset.day;render();}if(m)saveMood(m.dataset.date,m.dataset.mood);if(t){tableTag=t.dataset.table;renderTables();}});
try{state=await loadState();selected=state.snapshot?.days.filter(d=>d.notes>0).map(d=>d.date).sort().at(-1);if(selected)month=selected.slice(0,7);render();}catch(e){notice(e.message);render();}

$('#backup-export').onclick=async()=>{
  try{
    const latest=await loadState();if(!latest.snapshot)throw Error('先にプレイ記録を取り込んでください。');
    const blob=new Blob([JSON.stringify({format:'cinacina-backup',version:1,state:latest})],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='CinaCina-'+jst()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);notice('バックアップを書き出しました。ブラウザーのダウンロード先を確認してください。');
  }catch(e){notice(e.message);}
};
let pendingRestore;
$('#backup-file').onchange=async e=>{
  try{
    const file=e.target.files[0];if(!file)return;
    pendingRestore=validateBackup(JSON.parse(await file.text()));
    $('#restore-summary').textContent=pendingRestore.snapshot.days.filter(d=>d.notes>0).length+'日分の記録と調子を復元します。現在このブラウザーにある記録を置き換えます。';
    $('#restore-dialog').showModal();
  }catch(e){notice(e.message);}finally{e.target.value='';}
};
$('#cancel-restore').onclick=()=>{$('#restore-dialog').close();pendingRestore=null;};
$('#confirm-restore').onclick=async()=>{
  if(!pendingRestore)return;
  $('#confirm-restore').disabled=true;
  try{
    state=await updateState(()=>pendingRestore);pendingRestore=null;
    selected=state.snapshot.days.filter(d=>d.notes>0).map(d=>d.date).sort().at(-1);if(selected)month=selected.slice(0,7);
    render();$('#restore-dialog').close();notice('バックアップを復元しました。');
  }catch(e){notice(e.message);}finally{$('#confirm-restore').disabled=false;}
};
document.addEventListener('visibilitychange',async()=>{if(!document.hidden){try{state=await loadState();render();}catch(e){notice(e.message);}}});
