(()=>{const c=window.APP_CONFIG||{},$=id=>document.getElementById(id),s={db:null,user:null,role:null,wid:null,tasks:[],datasets:[],feedback:[],history:[],filter:"all",schemaReady:false,resumeDatasetId:null,datasetViewer:null,analytics:null};const labels={open:"Новая",progress:"В работе",done:"Решена"},types={bug:"Ошибка",confusing:"Непонятно",idea:"Идея",positive:"Полезно"},esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),date=x=>x?new Date(x).toLocaleString("ru-RU"):"";function toast(t){$("toast").textContent=t;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",3000)}function page(p){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$("page-"+p).classList.add("active");document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===p));$("pageTitle").textContent=({overview:"Обзор",tasks:"Задачи",data:"Данные",analytics:"Аналитика закупок",feedback:"Обратная связь",history:"История"})[p];if(p==="analytics")renderAnalyticsOptions()}async function log(event,summary){let r=await s.db.from("activity_log").insert({workspace_id:s.wid,actor_id:s.user.id,event_type:event,details:{summary}});if(r.error)console.warn(r.error.message)}async function membership(){let r=await s.db.from("workspace_members").select("workspace_id,role").eq("workspace_id",c.workspaceId).eq("user_id",s.user.id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw Error("Для этого аккаунта не выдан доступ. Обратитесь к владельцу пилота.");s.role=r.data.role;s.wid=r.data.workspace_id}function taskCard(t){return '<article class="item"><div class="bar"><b>'+esc(t.title)+'</b><span class="tag '+t.status+'">'+labels[t.status]+'</span></div><p>'+esc(t.description||"Описание не добавлено")+'</p>'+(t.last_comment?'<p><b>Комментарий:</b> '+esc(t.last_comment)+'</p>':'')+'<small>'+date(t.updated_at)+'</small><div class="bar" style="justify-content:flex-start;margin-top:8px"><button class="ghost" data-edit="'+t.id+'">Открыть / изменить</button>'+(s.role==="owner"?'<button class="ghost" data-delete="'+t.id+'">Удалить</button>':'')+'</div></article>'}function historyCard(x){return '<article class="item"><b>'+esc(x.event_type)+'</b><p>'+esc(x.details?.summary||"")+'</p><small>'+date(x.created_at)+'</small></article>'}function datasetCard(x){
 const status=x.upload_status||"complete",done=status==="complete";
 const actual=Number(x.stored_row_count||0),expected=Number(x.row_count||0);
 const statusText=done?"Завершено":x.source_file_hash?"Загрузка прервана — можно продолжить":"Нужна повторная загрузка";
 const countText=done?expected+" строк":actual+" из "+expected+" строк сохранено";
 const resume=(!done&&x.uploaded_by===s.user.id&&x.source_file_hash)?'<button class="ghost" data-resume="'+esc(x.id)+'">Продолжить загрузку</button>':"";
 const openAttrs=done?' data-open-dataset="'+esc(x.id)+'" role="button" tabindex="0"':"";const openHint=done?'<small class="open-hint">Нажмите, чтобы просмотреть таблицу →</small>':"";return '<article class="item'+(done?' dataset-card':'')+'"'+openAttrs+'><div class="bar"><b>'+esc(x.name)+'</b><small>'+statusText+'</small></div><p>'+countText+' · '+esc(x.notes||"")+'</p>'+(x.upload_error?'<p class="error">'+esc(x.upload_error)+'</p>':"")+'<small>'+date(x.created_at)+'</small>'+openHint+'<div style="margin-top:8px">'+resume+'</div></article>';
}
async function getDatasetChunk(datasetId,chunkIndex){
 const r=await s.db.from("dataset_rows").select("chunk_index,rows").eq("dataset_id",datasetId).eq("chunk_index",chunkIndex).maybeSingle();
 if(r.error)throw r.error;
 return r.data?.rows||null;
}
function renderDatasetViewer(){
 const v=s.datasetViewer;if(!v)return;
 const columns=v.columns.length?v.columns:Object.keys(v.rows[0]||{});
 const start=v.page*100,visible=v.rows.slice(start,start+100);
 const cell=value=>value===null||value===undefined?"":typeof value==="object"?JSON.stringify(value):String(value);
 $("datasetTable").innerHTML="<thead><tr>"+columns.map(c=>"<th>"+esc(c)+"</th>").join("")+"</tr></thead><tbody>"+visible.map(row=>"<tr>"+columns.map(c=>"<td>"+esc(cell(row?.[c]))+"</td>").join("")+"</tr>").join("")+"</tbody>";
 const pageCount=Math.max(1,Math.ceil(v.rows.length/100));
 $("datasetViewerTitle").textContent=v.dataset.name;
 $("datasetViewerMeta").textContent="Всего в наборе: "+Number(v.dataset.row_count||0).toLocaleString("ru-RU")+" строк";
 $("datasetViewerMessage").textContent="Пакет "+(v.chunkIndex+1)+": показаны строки "+(start+1)+"–"+(start+visible.length)+" из "+v.rows.length+" строк пакета. Программа загружает данные частями.";
 $("datasetPageInfo").textContent="Страница "+(v.page+1)+" из "+pageCount+" · пакет "+(v.chunkIndex+1);
 $("datasetPrev").disabled=v.page===0&&(v.legacy||v.chunkIndex===0);
 $("datasetNext").disabled=v.legacy&&v.page>=pageCount-1;
}
async function openDataset(id){
 const dataset=s.datasets.find(x=>x.id===id);if(!dataset)return;
 if((dataset.upload_status||"complete")!=="complete"){toast("Этот набор ещё не завершён.");return}
 const panel=$("datasetViewer");panel.classList.remove("hidden");
 $("datasetViewerTitle").textContent=dataset.name;
 $("datasetViewerMessage").textContent="Загружаю первые строки таблицы…";
 $("datasetTable").innerHTML="";
 try{
  let rows=await getDatasetChunk(id,0),columns=Array.isArray(dataset.columns)?dataset.columns:[];
  let legacy=false;
  if(!rows||!rows.length){
   const r=await s.db.from("datasets").select("columns,rows").eq("id",id).eq("workspace_id",s.wid).single();
   if(r.error)throw r.error;
   rows=Array.isArray(r.data.rows)?r.data.rows:[];
   if(Array.isArray(r.data.columns)&&r.data.columns.length)columns=r.data.columns;
   legacy=true;
  }
  if(!rows.length)throw new Error("В наборе не найдены сохранённые строки.");
  if(!columns.length)columns=Object.keys(rows[0]||{});
  s.datasetViewer={dataset,columns,rows,chunkIndex:0,page:0,legacy};
  renderDatasetViewer();
 }catch(error){
  $("datasetViewerMessage").textContent="Не удалось открыть таблицу: "+(error.message||String(error));
  $("datasetTable").innerHTML="";
 }
}
async function moveDatasetPage(direction){
 const v=s.datasetViewer;if(!v)return;
 try{
  const pageCount=Math.max(1,Math.ceil(v.rows.length/100));
  if(direction>0){
   if(v.page<pageCount-1){v.page++;renderDatasetViewer();return}
   if(v.legacy)return;
   const next=await getDatasetChunk(v.dataset.id,v.chunkIndex+1);
   if(!next||!next.length){toast("Это последняя часть таблицы.");return}
   v.chunkIndex++;v.rows=next;v.page=0;renderDatasetViewer();return;
  }
  if(v.page>0){v.page--;renderDatasetViewer();return}
  if(v.legacy||v.chunkIndex===0)return;
  const previous=await getDatasetChunk(v.dataset.id,v.chunkIndex-1);
  if(!previous||!previous.length){toast("Предыдущая часть таблицы не найдена.");return}
  v.chunkIndex--;v.rows=previous;v.page=Math.max(0,Math.ceil(previous.length/100)-1);renderDatasetViewer();
 }catch(error){toast("Ошибка чтения данных: "+(error.message||String(error)))}
}

function money(n){return Number(n||0).toLocaleString("ru-RU",{minimumFractionDigits:0,maximumFractionDigits:2})+" ₽"}
function qtyFmt(n){return Number(n||0).toLocaleString("ru-RU",{maximumFractionDigits:3})}
function numValue(v){
 if(typeof v==="number")return Number.isFinite(v)?v:0;
 if(v===null||v===undefined||v==="")return 0;
 const n=Number(String(v).replace(/\s/g,"").replace(",","."));
 return Number.isFinite(n)?n:0;
}
function renderAnalyticsOptions(){
 const sel=$("analyticsDataset");if(!sel)return;
 const old=sel.value;
 const choices=s.datasets.filter(d=>(d.upload_status||"complete")==="complete"&&Array.isArray(d.columns)&&d.columns.includes("Точка / подразделение")&&d.columns.includes("Артикул товара"));
 sel.innerHTML=choices.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+' · '+Number(d.row_count||0).toLocaleString("ru-RU")+' строк</option>').join("");
 if(choices.some(d=>d.id===old))sel.value=old;
 const note=$("analyticsDatasetHint");
 if(!choices.length){
  note.textContent="Пока нет объединённого набора закупок. Сначала откройте раздел «Данные» и загрузите подготовленный файл «Закупки сети — объединённый пилот».";
  $("analyticsBuild").disabled=true;
 }else{
  note.textContent="Найдено наборов для анализа: "+choices.length+". Данные остаются в закрытом рабочем пространстве Supabase.";
  $("analyticsBuild").disabled=false;
 }
}
async function buildPurchaseAnalytics(){
 const id=$("analyticsDataset").value;
 const ds=s.datasets.find(d=>d.id===id);
 if(!ds){$("analyticsStatus").textContent="Выберите объединённый набор данных.";return}
 $("analyticsBuild").disabled=true;
 $("analyticsStatus").textContent="Читаю сохранённые части набора из базы…";
 try{
  const expected=Number(ds.row_count||0),all=[];
  let index=0;
  while(all.length<expected&&index<10000){
   const result=await s.db.from("dataset_rows").select("chunk_index,rows").eq("dataset_id",id).eq("chunk_index",index).maybeSingle();
   if(result.error)throw result.error;
   if(!result.data)break;
   const part=Array.isArray(result.data.rows)?result.data.rows:[];
   all.push(...part);index++;
   $("analyticsStatus").textContent="Прочитано "+all.length.toLocaleString("ru-RU")+" из "+expected.toLocaleString("ru-RU")+" строк…";
   if(!part.length)break;
  }
  if(all.length!==expected)throw new Error("В базе найдено "+all.length+" из "+expected+" строк. Проверьте завершённость загрузки.");
  const stores=new Map(),products=new Map();
  let accepted=0,skipped=0;
  for(const row of all){
   const store=String(row["Точка / подразделение"]||"").trim();
   const sku=String(row["Артикул товара"]||"").trim();
   const name=String(row["Товар"]||"").trim();
   if(!store||!sku||!name){skipped++;continue}
   const q=numValue(row["Количество"]),amount=numValue(row["Сумма, ₽"]),price=numValue(row["Цена за единицу, ₽"]);
   accepted++;
   if(!stores.has(store))stores.set(store,{name:store,spend:0,rows:0,skus:new Set()});
   const st=stores.get(store);st.spend+=amount;st.rows++;st.skus.add(sku);
   if(!products.has(sku))products.set(sku,{sku,name,qty:0,spend:0,lines:0,byStore:new Map()});
   const p=products.get(sku);p.qty+=q;p.spend+=amount;p.lines++;
   if(!p.byStore.has(store))p.byStore.set(store,{store,qty:0,spend:0,lines:0});
   const ps=p.byStore.get(store);ps.qty+=q;ps.spend+=amount;ps.lines++;
  }
  const storeRows=Array.from(stores.values()).map(x=>({name:x.name,spend:x.spend,rows:x.rows,skus:x.skus.size})).sort((a,b)=>b.spend-a.spend);
  const productRows=Array.from(products.values()).map(p=>{
   const byStore=Array.from(p.byStore.values()).map(x=>({...x,avg:x.qty?x.spend/x.qty:null}));
   const valid=byStore.map(x=>x.avg).filter(x=>x!==null&&x>0);
   const min=valid.length?Math.min(...valid):null,max=valid.length?Math.max(...valid):null;
   return {...p,stores:byStore.length,avg:p.qty?p.spend/p.qty:null,min,max,spread:min&&max?(max/min-1)*100:null,byStore};
  }).sort((a,b)=>b.spend-a.spend);
  s.analytics={dataset:ds,expected,accepted,skipped,stores:storeRows,products:productRows,totalSpend:storeRows.reduce((n,x)=>n+x.spend,0)};
  $("analyticsStore").innerHTML='<option value="">Все точки / подразделения</option>'+storeRows.map(x=>'<option value="'+esc(x.name)+'">'+esc(x.name)+'</option>').join("");
  $("analyticsSearch").value="";
  $("analyticsStatus").textContent="Анализ готов: "+accepted.toLocaleString("ru-RU")+" строк обработано. Повторяющиеся артикулы объединены в сводных показателях.";
  renderPurchaseAnalytics();
 }catch(error){
  $("analyticsStatus").textContent="Не удалось построить анализ: "+(error.message||String(error));
 }finally{$("analyticsBuild").disabled=false}
}
function renderPurchaseAnalytics(){
 const a=s.analytics;if(!a)return;
 const storeFilter=$("analyticsStore").value,query=$("analyticsSearch").value.trim().toLowerCase();
 const selectedStore=a.stores.find(x=>x.name===storeFilter);
 const currentSpend=selectedStore?selectedStore.spend:a.totalSpend;
 const currentRows=selectedStore?selectedStore.rows:a.accepted;
 const currentSkus=selectedStore?selectedStore.skus:a.products.length;
 $("analyticsKpis").innerHTML=
  '<article><small>Сумма закупок</small><b>'+money(currentSpend)+'</b></article>'+
  '<article><small>Строк отчёта</small><b>'+Number(currentRows).toLocaleString("ru-RU")+'</b></article>'+
  '<article><small>Уникальных артикулов</small><b>'+Number(currentSkus).toLocaleString("ru-RU")+'</b></article>'+
  '<article><small>Точек / подразделений</small><b>'+ (storeFilter?"1":a.stores.length)+'</b></article>';
 const storeMax=Math.max(...a.stores.map(x=>x.spend),1);
 $("analyticsStoreBars").innerHTML=a.stores.map(x=>'<div class="analytics-bar-row"><div><b>'+esc(x.name)+'</b><span>'+money(x.spend)+'</span></div><div class="analytics-bar-track"><i style="width:'+Math.max(1,x.spend/storeMax*100)+'%"></i></div></div>').join("");
 let list=a.products;
 if(storeFilter)list=list.map(p=>{const v=p.byStore.find(x=>x.store===storeFilter);return v?{...p,qty:v.qty,spend:v.spend,lines:v.lines,stores:1,avg:v.avg}:null}).filter(Boolean).sort((x,y)=>y.spend-x.spend);
 if(query)list=list.filter(p=>(p.sku+" "+p.name).toLowerCase().includes(query));
 $("analyticsProductRows").innerHTML=list.slice(0,100).map(p=>'<tr data-purchase-sku="'+esc(p.sku)+'" class="analytics-select-row"><td>'+esc(p.sku)+'</td><td>'+esc(p.name)+'</td><td class="num">'+qtyFmt(p.qty)+'</td><td class="num">'+money(p.spend)+'</td><td class="num">'+(p.avg?money(p.avg):"—")+'</td><td class="num">'+p.stores+'</td></tr>').join("")||'<tr><td colspan="6">По заданному фильтру ничего не найдено.</td></tr>';
 $("analyticsProductCount").textContent="Показано "+Math.min(100,list.length)+" из "+list.length+" позиций. Нажмите на товар, чтобы сравнить цены по точкам.";
 const chosen=a.products.find(p=>p.sku===a.selectedSku)||a.products[0];
 if(chosen){
  a.selectedSku=chosen.sku;
  $("analyticsPriceTitle").textContent="Сравнение закупочной цены: "+chosen.name;
  $("analyticsPriceMeta").textContent="Артикул "+chosen.sku+" · закуплено в "+chosen.stores+" точках/подразделениях · суммарно "+qtyFmt(chosen.qty);
  $("analyticsPriceRows").innerHTML=chosen.byStore.slice().sort((x,y)=>(x.avg||0)-(y.avg||0)).map(x=>'<tr><td>'+esc(x.store)+'</td><td class="num">'+qtyFmt(x.qty)+'</td><td class="num">'+money(x.avg||0)+'</td><td class="num">'+money(x.spend)+'</td></tr>').join("");
  $("analyticsPriceSpread").textContent=chosen.spread===null?"Недостаточно данных для сравнения":"Разница между минимальной и максимальной средней ценой: "+chosen.spread.toLocaleString("ru-RU",{maximumFractionDigits:1})+"%. Это сигнал для проверки, не доказательство переплаты.";
 }else{
  $("analyticsPriceTitle").textContent="Сравнение закупочной цены";
  $("analyticsPriceMeta").textContent="Выберите товар в таблице выше.";
  $("analyticsPriceRows").innerHTML="";
  $("analyticsPriceSpread").textContent="";
 }
 const signals=a.products.filter(p=>p.stores>=3&&p.spread!==null&&p.spread>=10).sort((x,y)=>y.spread-x.spread).slice(0,8);
 $("analyticsSignals").innerHTML=signals.map(p=>'<tr data-purchase-sku="'+esc(p.sku)+'" class="analytics-select-row"><td>'+esc(p.sku)+'</td><td>'+esc(p.name)+'</td><td class="num">'+p.stores+'</td><td class="num">'+p.spread.toLocaleString("ru-RU",{maximumFractionDigits:1})+'%</td><td class="num">'+money(p.min)+' – '+money(p.max)+'</td></tr>').join("")||'<tr><td colspan="5">Сигналов для проверки нет.</td></tr>';
 $("analyticsCoverage").textContent="Источник: "+a.dataset.name+". Загружено "+a.expected.toLocaleString("ru-RU")+" строк; в расчёт включено "+a.accepted.toLocaleString("ru-RU")+". Пропущено строк без точки, артикула или названия: "+a.skipped+".";
}
function render(){
 let n=s.tasks.filter(x=>x.status==="open").length,p=s.tasks.filter(x=>x.status==="progress").length,d=s.tasks.filter(x=>x.status==="done").length;
 $("countOpen").textContent=n;$("countProgress").textContent=p;$("countDone").textContent=d;$("countFeedback").textContent=s.feedback.length;
 $("recentTasks").innerHTML=s.tasks.slice(0,4).map(taskCard).join("")||'<p class="muted">Задач пока нет.</p>';
 $("recentHistory").innerHTML=s.history.slice(0,4).map(historyCard).join("")||'<p class="muted">История пока пуста.</p>';
 $("taskList").innerHTML=s.tasks.filter(x=>s.filter==="all"||x.status===s.filter).map(taskCard).join("")||'<p class="muted">В этой категории задач нет.</p>';
 $("datasetList").innerHTML=s.datasets.map(datasetCard).join("")||'<p class="muted">Наборов пока нет.</p>';
 $("feedbackList").innerHTML=s.feedback.map(x=>'<article class="item"><b>'+types[x.feedback_type]+'</b><p>'+esc(x.message)+'</p><small>'+esc(x.page_name||"")+' · '+date(x.created_at)+'</small></article>').join("")||'<p class="muted">Отзывов пока нет.</p>';
 $("historyList").innerHTML=s.history.map(historyCard).join("")||'<p class="muted">История пока пуста.</p>';
}
async function refresh(){
 $("syncState").textContent="Синхронизация…";
 const q=await Promise.all([
  s.db.from("tasks").select("*").eq("workspace_id",s.wid).order("updated_at",{ascending:false}),
  s.db.from("feedback").select("*").eq("workspace_id",s.wid).order("created_at",{ascending:false}),
  s.db.from("activity_log").select("*").eq("workspace_id",s.wid).order("created_at",{ascending:false}).limit(100)
 ]);
 for(const x of q)if(x.error)throw x.error;
 const ds=await s.db.from("datasets").select("id,name,notes,row_count,columns,created_at,uploaded_by,upload_status,upload_error,stored_row_count,stored_chunks,source_file_name,source_file_size,source_file_last_modified,source_file_hash").eq("workspace_id",s.wid).order("created_at",{ascending:false});
 if(ds.error){
  const legacy=await s.db.from("datasets").select("id,name,notes,row_count,columns,created_at,uploaded_by").eq("workspace_id",s.wid).order("created_at",{ascending:false});
  if(legacy.error)throw legacy.error;
  s.schemaReady=false;
  s.datasets=(legacy.data||[]).map(x=>({...x,upload_status:"complete",stored_row_count:x.row_count||0}));
  $("uploadMsg").textContent="Для надёжной загрузки больших файлов требуется обновление базы данных. Сначала выполните миграцию 002_resumable_uploads.sql.";
 }else{
  s.schemaReady=true;s.datasets=ds.data||[];
 }
 [s.tasks,s.feedback,s.history]=q.map(x=>x.data||[]);
 render();$("syncState").textContent="Данные синхронизированы";
}
function openTask(id=""){let t=s.tasks.find(x=>x.id===id);$("taskForm").reset();$("taskId").value=t?.id||"";$("dialogTitle").textContent=t?"Изменить задачу":"Новая задача";$("taskTitle").value=t?.title||"";$("taskDescription").value=t?.description||"";$("taskStatus").value=t?.status||"open";$("taskPriority").value=t?.priority||"normal";$("taskComment").value=t?.last_comment||"";$("taskError").textContent="";$("taskDialog").showModal()}async function saveTask(e){e.preventDefault();let id=$("taskId").value,p={workspace_id:s.wid,title:$("taskTitle").value.trim(),description:$("taskDescription").value.trim(),status:$("taskStatus").value,priority:$("taskPriority").value,last_comment:$("taskComment").value.trim(),updated_by:s.user.id};let r=id?await s.db.from("tasks").update(p).eq("id",id).eq("workspace_id",s.wid):await s.db.from("tasks").insert({...p,created_by:s.user.id});if(r.error){$("taskError").textContent=r.error.message;return}await log(id?"Задача изменена":"Создана задача",p.title+(p.last_comment?" — "+p.last_comment:""));$("taskDialog").close();await refresh();toast("Задача сохранена")}async function deleteTask(id){if(!confirm("Удалить задачу?"))return;let r=await s.db.from("tasks").delete().eq("id",id).eq("workspace_id",s.wid);if(r.error){toast(r.error.message);return}await log("Задача удалена",id);await refresh()}async function upload(e){
 e.preventDefault();
 const f=$("dataFile").files[0],msg=$("uploadMsg"),btn=$("uploadForm").querySelector('button[type="submit"],button:not([type])');
 if(!f){msg.textContent="Сначала выберите файл.";return}
 if(!s.schemaReady){msg.textContent="Сначала выполните миграцию pilot/migrations/002_resumable_uploads.sql в Supabase SQL Editor. После этого обновите страницу.";return}
 if(f.size>100*1024*1024){msg.textContent="Файл больше 100 МБ. Для такого объёма потребуется отдельный серверный импорт.";return}
 if(btn)btn.disabled=true;
 msg.textContent="Читаю файл и проверяю его целостность…";
 let worker=null,datasetId=null,finished=false,totalRows=0,actualSavedRows=0,chunkCount=0,refreshPromise=null;
 const setStatus=async(status,errorText)=>{
  if(!datasetId)return;
  const result=await s.db.from("datasets").update({
   upload_status:status,upload_error:errorText||null,
   upload_started_at:new Date().toISOString()
  }).eq("id",datasetId).eq("workspace_id",s.wid);
  if(result.error)console.warn("Не удалось обновить статус загрузки:",result.error.message);
 };
 const fail=async err=>{
  if(finished)return;
  finished=true;
  if(worker)worker.terminate();
  const message=String(err?.message||err||"Неизвестная ошибка");
  if(datasetId){
   const u=await s.db.from("datasets").update({
    upload_status:"interrupted",upload_error:message
   }).eq("id",datasetId).eq("workspace_id",s.wid);
   if(u.error)console.warn("Не удалось сохранить статус прерванной загрузки:",u.error.message);
   s.resumeDatasetId=datasetId;
  }
  msg.textContent="Загрузка приостановлена: "+message+(datasetId?". Данные и уже сохранённые части оставлены в базе. Продолжить можно из карточки набора.":"");
  if(btn)btn.disabled=false;
  try{await refresh()}catch(refreshError){console.warn(refreshError)}
 };
 const expired=err=>/jwt expired|token.*expired|invalid jwt/i.test(String(err?.message||err||""));
 const retryable=err=>{
  const text=String(err?.message||err||"");
  return err instanceof TypeError||/failed to fetch|network|timeout|temporar|connection|load failed|gateway/i.test(text)||err?.status===429||Number(err?.status)>=500;
 };
 const refreshAuth=async()=>{
  if(!refreshPromise)refreshPromise=s.db.auth.refreshSession().finally(()=>{refreshPromise=null});
  const r=await refreshPromise;
  if(r.error||!r.data?.session)throw new Error("Не удалось обновить сессию. Войдите в приложение заново и продолжите загрузку.");
 };
 const saveChunk=async payload=>{
  let lastError=null;
  for(let attempt=0;attempt<7;attempt++){
   try{
    const session=await s.db.auth.getSession();
    if(session.error||!session.data?.session)await refreshAuth();
    else if(session.data.session.expires_at&&session.data.session.expires_at*1000<Date.now()+120000)await refreshAuth();
    const result=await s.db.from("dataset_rows").insert(payload);
    if(!result.error)return;
    if(result.error.code==="23505")return;
    lastError=result.error;
    if(expired(lastError)){await refreshAuth();continue}
    if(!retryable(lastError))throw lastError;
   }catch(error){
    if(error?.code==="23505")return;
    lastError=error;
    if(expired(error)){await refreshAuth();continue}
    if(!retryable(error))throw error;
   }
   if(attempt<6){
    msg.textContent="Повторяю передачу пакета "+(payload.chunk_index+1)+" ("+(attempt+2)+"/7)…";
    await new Promise(resolve=>setTimeout(resolve,Math.min(1000*Math.pow(2,attempt),12000)));
   }
  }
  throw lastError||new Error("Не удалось сохранить пакет после нескольких попыток.");
 };
 const existingChunks=async id=>{
  const found=[];let from=0,step=500;
  while(true){
   const r=await s.db.from("dataset_rows").select("chunk_index").eq("dataset_id",id).order("chunk_index").range(from,from+step-1);
   if(r.error)throw r.error;
   for(const row of r.data||[])found.push(row.chunk_index);
   if(!r.data||r.data.length<step)break;
   from+=step;
  }
  return found;
 };
 const handleMeta=async m=>{
  totalRows=m.totalRows;
  if(s.resumeDatasetId){
   const found=await s.db.from("datasets").select("id,name,notes,row_count,uploaded_by,upload_status,stored_row_count,source_file_size,source_file_last_modified,source_file_hash").eq("id",s.resumeDatasetId).eq("workspace_id",s.wid).single();
   if(found.error)throw found.error;
   const d=found.data;
   if(d.uploaded_by!==s.user.id)throw new Error("Продолжить загрузку может только пользователь, который её начал.");
   if(!d.source_file_hash||d.source_file_hash!==m.fileHash||Number(d.source_file_size)!==f.size||Number(d.row_count)!==Number(m.totalRows)){
    throw new Error("Выбран не тот исходный файл. Для продолжения выберите исходную версию Excel без изменений.");
   }
   datasetId=d.id;actualSavedRows=Number(d.stored_row_count||0);
   const u=await s.db.from("datasets").update({upload_status:"uploading",upload_error:null,upload_started_at:new Date().toISOString()}).eq("id",datasetId).eq("workspace_id",s.wid);
   if(u.error)throw u.error;
  }else{
   const created=await s.db.from("datasets").insert({
    workspace_id:s.wid,name:$("dataName").value.trim(),notes:$("dataNotes").value.trim(),
    row_count:m.totalRows,columns:m.columns,rows:[],uploaded_by:s.user.id,
    upload_status:"uploading",upload_error:null,stored_row_count:0,stored_chunks:0,
    source_file_name:f.name,source_file_size:f.size,
    source_file_last_modified:f.lastModified,source_file_hash:m.fileHash,
    upload_started_at:new Date().toISOString()
   }).select("id").single();
   if(created.error)throw created.error;
   datasetId=created.data.id;
  }
  const skipChunkIndexes=await existingChunks(datasetId);
  msg.textContent="Файл проверен. Уже сохранено "+actualSavedRows+" строк. Загружаю недостающие части…";
  worker.postMessage({type:"ack",requestId:m.requestId,skipChunkIndexes});
 };
 const handleChunk=async m=>{
  try{
   await saveChunk({dataset_id:datasetId,workspace_id:s.wid,chunk_index:m.chunkIndex,rows:m.rows,uploaded_by:s.user.id});
   if(finished)return;
   actualSavedRows+=Number(m.rowCount||m.rows?.length||0);chunkCount++;
   msg.textContent="Сохранено "+actualSavedRows+" из "+totalRows+" строк · передано пакетов: "+chunkCount+".";
   worker.postMessage({type:"ack",requestId:m.requestId});
  }catch(error){
   worker.postMessage({type:"ack",requestId:m.requestId,error:String(error?.message||error)});
   await fail(error);
  }
 };
 const handleDone=async m=>{
  if(!datasetId)throw new Error("Не создана запись набора данных.");
  const check=await s.db.from("datasets").select("stored_row_count,stored_chunks").eq("id",datasetId).eq("workspace_id",s.wid).single();
  if(check.error)throw check.error;
  const stored=Number(check.data.stored_row_count||0);
  if(stored!==Number(m.totalRows)){
   throw new Error("Проверка не пройдена: база подтвердила "+stored+" из "+m.totalRows+" строк. Набор оставлен для продолжения.");
  }
  const updated=await s.db.from("datasets").update({
   row_count:m.totalRows,upload_status:"complete",upload_error:null,
   upload_completed_at:new Date().toISOString()
  }).eq("id",datasetId).eq("workspace_id",s.wid);
  if(updated.error)throw updated.error;
  finished=true;worker.terminate();s.resumeDatasetId=null;
  $("uploadForm").reset();
  msg.textContent="Готово. База подтвердила сохранение всех "+m.totalRows+" строк.";
  if(btn)btn.disabled=false;
  try{await log("Загружен набор данных",f.name+" · "+m.totalRows+" строк")}catch(logError){console.warn(logError)}
  try{await refresh();const uploaded=s.datasets.find(x=>x.id===datasetId);if(uploaded?.columns?.includes("Точка / подразделение")&&uploaded?.columns?.includes("Артикул товара")){page("analytics");renderAnalyticsOptions();$("analyticsDataset").value=datasetId;await buildPurchaseAnalytics()}}catch(refreshError){console.warn(refreshError);toast("Данные сохранены, но список не обновился. Нажмите «Обновить».")}
 };
 try{
  worker=new Worker("parser-worker.js");
  worker.onerror=ev=>{ev.preventDefault();fail(new Error("Ошибка обработчика Excel. Сохраните файл как XLSX или CSV и повторите попытку."))};
  worker.onmessage=ev=>{
   const m=ev.data||{};
   if(finished)return;
   if(m.type==="meta")handleMeta(m).catch(fail);
   else if(m.type==="chunk")handleChunk(m);
   else if(m.type==="progress")msg.textContent="Разобрано "+m.processedRows+" из "+m.totalRows+" строк; подтверждено базой: "+actualSavedRows+".";
   else if(m.type==="done")handleDone(m).catch(fail);
   else if(m.type==="error")fail(new Error(m.message||"Не удалось прочитать файл."));
  };
  worker.postMessage({file:f});
 }catch(err){await fail(err)}
}
async function feedback(e){e.preventDefault();let p={workspace_id:s.wid,user_id:s.user.id,feedback_type:$("fbType").value,page_name:$("fbPage").value.trim(),message:$("fbText").value.trim(),priority:$("fbPriority").value},r=await s.db.from("feedback").insert(p);if(r.error){$("fbMsg").textContent=r.error.message;return}await log("Обратная связь",types[p.feedback_type]+": "+p.message.slice(0,140));$("feedbackForm").reset();$("fbMsg").textContent="Спасибо! Отзыв сохранён.";await refresh()}async function enter(){let r=await s.db.from("workspace_members").select("workspace_id,role").eq("workspace_id",c.workspaceId).eq("user_id",s.user.id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw Error("У этой учётной записи нет доступа к пилоту.");s.role=r.data.role;s.wid=r.data.workspace_id;$("login").classList.add("hidden");$("app").classList.remove("hidden");$("userEmail").textContent=s.user.email;$("userRole").textContent=s.role==="owner"?"Владелец пилота":"Тестировщик";await refresh()}async function init(){if(!c.supabaseUrl||!c.supabaseAnonKey||!c.workspaceId||!window.supabase){$("loginError").textContent="Нужно настроить config.js по инструкции README.";return}s.db=window.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey);let r=await s.db.auth.getSession();if(r.data.session){s.user=r.data.session.user;try{await enter()}catch(x){$("loginError").textContent=x.message}}s.db.auth.onAuthStateChange(async(_e,session)=>{if(!session){s.user=null;$("app").classList.add("hidden");$("login").classList.remove("hidden");return}s.user=session.user;try{await enter()}catch(x){$("loginError").textContent=x.message}})}$("loginForm").onsubmit=async e=>{e.preventDefault();$("loginError").textContent="";if(!s.db){$("loginError").textContent="Сначала настройте приложение.";return}let r=await s.db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(r.error)$("loginError").textContent=r.error.message};$("logout").onclick=()=>s.db.auth.signOut();$("nav").onclick=e=>{let b=e.target.closest("[data-page]");if(b)page(b.dataset.page)};document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>page(b.dataset.go));$("newTask").onclick=()=>openTask();$("closeDialog").onclick=$("cancelDialog").onclick=()=>$("taskDialog").close();$("taskForm").onsubmit=saveTask;$("taskList").onclick=e=>{let a=e.target.closest("[data-edit]"),b=e.target.closest("[data-delete]");if(a)openTask(a.dataset.edit);if(b)deleteTask(b.dataset.delete)};document.querySelector(".filters").onclick=e=>{let b=e.target.closest("[data-filter]");if(!b)return;s.filter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));render()};$("uploadForm").onsubmit=upload;$("datasetList").onclick=e=>{const b=e.target.closest("[data-resume]");if(b){e.stopPropagation();const d=s.datasets.find(x=>x.id===b.dataset.resume);if(!d)return;s.resumeDatasetId=d.id;$("dataName").value=d.name;$("dataNotes").value=d.notes||"";$("dataFile").value="";$("uploadMsg").textContent="Выберите тот же исходный файл Excel, который загружали ранее.";$("dataFile").click();return}const card=e.target.closest("[data-open-dataset]");if(card)openDataset(card.dataset.openDataset)};$("datasetList").onkeydown=e=>{if(e.key!=="Enter"&&e.key!==" ")return;const card=e.target.closest("[data-open-dataset]");if(card&&e.target===card){e.preventDefault();openDataset(card.dataset.openDataset)}};$("closeDatasetViewer").onclick=()=>{$("datasetViewer").classList.add("hidden");s.datasetViewer=null};$("datasetPrev").onclick=()=>moveDatasetPage(-1);$("datasetNext").onclick=()=>moveDatasetPage(1);$("analyticsBuild").onclick=buildPurchaseAnalytics;$("analyticsStore").onchange=renderPurchaseAnalytics;$("analyticsSearch").oninput=renderPurchaseAnalytics;$("analyticsProductRows").onclick=$("analyticsSignals").onclick=e=>{const row=e.target.closest("[data-purchase-sku]");if(!row||!s.analytics)return;s.analytics.selectedSku=row.dataset.purchaseSku;renderPurchaseAnalytics()};$("feedbackForm").onsubmit=feedback;$("refresh").onclick=()=>refresh().catch(x=>toast(x.message));init()})();