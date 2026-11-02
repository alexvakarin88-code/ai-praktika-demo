(()=>{const c=window.APP_CONFIG||{},$=id=>document.getElementById(id),s={db:null,user:null,role:null,wid:null,tasks:[],datasets:[],feedback:[],history:[],filter:"all",schemaReady:false,resumeDatasetId:null,datasetViewer:null,analyticsRows:null};const labels={open:"Новая",progress:"В работе",done:"Решена"},types={bug:"Ошибка",confusing:"Непонятно",idea:"Идея",positive:"Полезно"},esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),date=x=>x?new Date(x).toLocaleString("ru-RU"):"";function toast(t){$("toast").textContent=t;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",3000)}function page(p){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$("page-"+p).classList.add("active");document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===p));$("pageTitle").textContent=({overview:"Обзор",tasks:"Задачи",data:"Данные",analytics:"Аналитика",feedback:"Обратная связь",history:"История"})[p];if(p==="analytics")renderAnalyticsHome()}async function log(event,summary){let r=await s.db.from("activity_log").insert({workspace_id:s.wid,actor_id:s.user.id,event_type:event,details:{summary}});if(r.error)console.warn(r.error.message)}async function membership(){let r=await s.db.from("workspace_members").select("workspace_id,role").eq("workspace_id",c.workspaceId).eq("user_id",s.user.id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw Error("Для этого аккаунта не выдан доступ. Обратитесь к владельцу пилота.");s.role=r.data.role;s.wid=r.data.workspace_id}function taskCard(t){return '<article class="item"><div class="bar"><b>'+esc(t.title)+'</b><span class="tag '+t.status+'">'+labels[t.status]+'</span></div><p>'+esc(t.description||"Описание не добавлено")+'</p>'+(t.last_comment?'<p><b>Комментарий:</b> '+esc(t.last_comment)+'</p>':'')+'<small>'+date(t.updated_at)+'</small><div class="bar" style="justify-content:flex-start;margin-top:8px"><button class="ghost" data-edit="'+t.id+'">Открыть / изменить</button>'+(s.role==="owner"?'<button class="ghost" data-delete="'+t.id+'">Удалить</button>':'')+'</div></article>'}function historyCard(x){return '<article class="item"><b>'+esc(x.event_type)+'</b><p>'+esc(x.details?.summary||"")+'</p><small>'+date(x.created_at)+'</small></article>'}function datasetCard(x){
 const status=x.upload_status||"complete",done=status==="complete";
 const actual=Number(x.stored_row_count||0),expected=Number(x.row_count||0);
 const statusText=done?"Завершено":x.source_file_hash?"Загрузка прервана — можно продолжить":"Нужна повторная загрузка";
 const countText=done?expected+" строк":actual+" из "+expected+" строк сохранено";
 const resume=(!done&&x.uploaded_by===s.user.id&&x.source_file_hash)?'<button class="ghost" type="button" data-resume="'+esc(x.id)+'">Продолжить загрузку</button>':"";
 const canDelete=status!=="uploading"&&(s.role==="owner"||x.uploaded_by===s.user.id);
 const remove=canDelete?'<button class="ghost danger" type="button" data-delete-dataset="'+esc(x.id)+'">Удалить</button>':"";
 const openAttrs=done?' data-open-dataset="'+esc(x.id)+'" role="group" tabindex="0"':"";
 const openHint=done?'<small class="open-hint">Нажмите, чтобы просмотреть таблицу →</small>':"";
 const canAnalyze=done&&Array.isArray(x.columns)&&x.columns.includes("Тип отчёта");
 const analyze=canAnalyze?'<button class="primary" type="button" data-analyze-dataset="'+esc(x.id)+'">Открыть анализ</button>':"";
 return '<article class="item'+(done?' dataset-card':'')+'"'+openAttrs+'><div class="bar"><b>'+esc(x.name)+'</b><small>'+statusText+'</small></div><p>'+countText+' · '+esc(x.notes||"")+'</p>'+(x.upload_error?'<p class="error">'+esc(x.upload_error)+'</p>':"")+'<small>'+date(x.created_at)+'</small>'+openHint+'<div class="bar dataset-actions">'+'<div class="action-left">'+resume+'</div><div class="action-right">'+analyze+remove+'</div></div></article>';
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
function rub(value){return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(Number(value)||0)}
function numeric(row,key){const value=Number(row?.[key]);return Number.isFinite(value)?value:0}
function detectReportType(columns){
 const c=new Set(Array.isArray(columns)?columns:[]);
 if(c.has("Тип отчёта")&&c.has("Подразделение")&&c.has("Показатель для анализа, ₽"))return "combined";
 if(c.has("Позиция продажи")&&c.has("Выручка"))return "Продажи";
 if(c.has("Количество порчи")&&c.has("Сумма"))return "Порча";
 if(c.has("Тип расхождения")&&c.has("Сумма"))return "Инвентаризация";
 if(c.has("Товар")&&c.has("Количество")&&c.has("Цена")&&c.has("Сумма"))return "Закупки";
 return null;
}
function renderAnalyticsHome(){
 const loading=$("analyticsLoading"),content=$("analyticsContent");
 if(!loading||!content)return;
 const complete=s.datasets.filter(x=>(x.upload_status||"complete")==="complete");
 const ready=complete.filter(x=>detectReportType(x.columns)==="combined");
 const raw=complete.filter(x=>detectReportType(x.columns)&&detectReportType(x.columns)!=="combined");
 const unsupported=complete.filter(x=>!detectReportType(x.columns));
 const typeCounts={};
 raw.forEach(x=>{const t=detectReportType(x.columns);typeCounts[t]=(typeCounts[t]||0)+1});
 const typeSummary=Object.entries(typeCounts).map(([k,v])=>esc(k)+": "+v).join(" · ");
 const readyHtml=ready.map(x=>'<article class="item"><div class="bar"><b>'+esc(x.name)+'</b><span class="tag done">Готово к анализу</span></div><p>'+Number(x.row_count||0).toLocaleString("ru-RU")+' строк · '+date(x.created_at)+'</p><button class="primary" type="button" data-analyze-dataset="'+esc(x.id)+'">Открыть анализ →</button></article>').join("");
 const rawHtml=raw.map(x=>'<article class="item"><div class="bar"><b>'+esc(x.name)+'</b><span class="tag">'+esc(detectReportType(x.columns))+'</span></div><p>'+Number(x.row_count||0).toLocaleString("ru-RU")+' строк · '+date(x.created_at)+'</p></article>').join("");
 const noData=complete.length===0?'<div class="empty-state"><h3>Пока нет загруженных данных</h3><p>Сначала добавьте Excel-отчёты в разделе «Данные». После загрузки вернитесь сюда — система сможет объединить поддерживаемые отчёты и построить аналитику.</p><button class="primary" type="button" data-go-data>Перейти к загрузке данных</button></div>':
  raw.length===0&&ready.length===0?'<div class="empty-state"><h3>Не нашёл подходящих отчётов</h3><p>В хранилище есть '+complete.length+' наборов, но по названиям столбцов программа пока не распознаёт их как закупки, продажи, порчу или инвентаризацию. Откройте раздел «Данные» и проверьте состав таблиц.</p><button class="ghost" type="button" data-go-data>Проверить загруженные файлы</button></div>':"";
 content.innerHTML=
  '<div class="analytics-home">'+
   '<div class="analytics-home-intro"><div><span class="eyebrow">АНАЛИТИКА СЕТИ</span><h2>Анализ загруженных отчётов</h2><p class="muted">Выберите готовый объединённый набор или сформируйте его автоматически из отдельных Excel-файлов.</p></div><button class="ghost" type="button" data-go-data>Открыть раздел «Данные»</button></div>'+
   '<div class="analytics-home-stats"><div><small>Всего наборов</small><b>'+complete.length+'</b></div><div><small>Подходят для объединения</small><b>'+raw.length+'</b></div><div><small>Готовы к анализу</small><b>'+ready.length+'</b></div></div>'+
   (ready.length?'<section class="card"><h3>Готовые аналитические наборы</h3>'+readyHtml+'</section>':"")+
   (raw.length?'<section class="card"><div class="bar"><div><h3>Исходные Excel-отчёты</h3><p class="muted">'+(typeSummary||"")+'</p></div><button class="primary" type="button" data-build-analysis '+(!s.schemaReady?'disabled':'')+'>Сформировать анализ из этих файлов</button></div><p class="muted">Система объединит закупки, продажи, порчу и инвентаризационные расхождения. Исходные наборы останутся без изменений.</p>'+rawHtml+(!s.schemaReady?'<p class="error">Для объединения нужно обновить структуру базы данных: выполните миграцию 002 в Supabase SQL Editor.</p>':"")+'</section>':"")+
   noData+
   (unsupported.length?'<details class="card"><summary>Не распознано автоматически: '+unsupported.length+' наборов</summary><p class="muted">Проверьте заголовки столбцов в разделе «Данные». Нераспознанные наборы не включаются в расчёт.</p></details>':"")+
  '</div>';
 loading.classList.add("hidden");content.classList.remove("hidden");
 content.onclick=e=>{
  const a=e.target.closest("[data-analyze-dataset]");if(a){openAnalytics(a.dataset.analyzeDataset);return}
  if(e.target.closest("[data-build-analysis]")){buildCombinedDataset();return}
  if(e.target.closest("[data-go-data]"))page("data");
 };
}
async function readAllDatasetRows(dataset){
 const chunks=await s.db.from("dataset_rows").select("chunk_index,rows").eq("dataset_id",dataset.id).order("chunk_index",{ascending:true});
 if(chunks.error)throw chunks.error;
 if(chunks.data?.length)return chunks.data.flatMap(x=>Array.isArray(x.rows)?x.rows:[]);
 const legacy=await s.db.from("datasets").select("rows").eq("id",dataset.id).eq("workspace_id",s.wid).single();
 if(legacy.error)throw legacy.error;
 return Array.isArray(legacy.data?.rows)?legacy.data.rows:[];
}
function toNumber(value){
 if(typeof value==="number")return Number.isFinite(value)?value:0;
 const text=String(value??"").replace(/\u00a0/g," ").replace(/\s/g,"").replace(",",".").replace(/[^\d.-]/g,"");
 const n=Number(text);return Number.isFinite(n)?n:0;
}
function reportPeriod(source){
 const m=String(source||"").match(/с\s*(\d{2}\.\d{2}\.\d{4})\s*по\s*(\d{2}\.\d{2}\.\d{4})/i);
 return m?m[1]+"–"+m[2]:"Не подтверждён — уточнить в iiko";
}
async function buildCombinedDataset(){
 if(!s.schemaReady){toast("Сначала нужно обновить структуру базы данных (миграция 002).");return}
 const loading=$("analyticsLoading"),content=$("analyticsContent");
 loading.classList.remove("hidden");content.classList.add("hidden");
 loading.textContent="Проверяю загруженные отчёты…";
 const canonical=["Тип отчёта","Подразделение","Артикул","Наименование","Количество","Единица измерения","Показатель для анализа, ₽","Сумма в отчёте, ₽","Выручка, ₽","Вид операции","Период отчёта","Исходный файл","Склад"];
 let createdId=null;
 try{
  const sourceSets=s.datasets.filter(x=>(x.upload_status||"complete")==="complete"&&["Закупки","Продажи","Порча","Инвентаризация"].includes(detectReportType(x.columns)));
  if(!sourceSets.length)throw new Error("Нет завершённых Excel-наборов, распознанных как закупки, продажи, порча или инвентаризация.");
  const rows=[],seenHashes=new Set();
  for(let i=0;i<sourceSets.length;i++){
   const ds=sourceSets[i],kind=detectReportType(ds.columns);
   if(ds.source_file_hash&&seenHashes.has(ds.source_file_hash))continue;
   if(ds.source_file_hash)seenHashes.add(ds.source_file_hash);
   loading.textContent="Читаю отчёт "+(i+1)+" из "+sourceSets.length+": "+ds.name;
   const sourceRows=await readAllDatasetRows(ds);
   for(const r of sourceRows){
    if(!r||typeof r!=="object")continue;
    const item=String(r["Товар"]??r["Позиция продажи"]??r["Позиция"]??"").trim();
    if(/^итого\b/i.test(item))continue;
    const source=String(r["Исходный файл"]??r["Файл"]??ds.source_file_name??ds.name);
    const point=String(r["Точка"]??"Не указано").trim()||"Не указано";
    let type,name,quantity,unit,amount,operation,sku,warehouse="";
    if(kind==="Закупки"){
     type="Закупки";name=String(r["Товар"]??"Без названия");quantity=toNumber(r["Количество"]);unit=String(r["Единица измерения"]??"");amount=toNumber(r["Сумма"]);operation="Закупка";sku=String(r["Артикул"]??"");
    }else if(kind==="Продажи"){
     type="Продажи блюд";name=String(r["Позиция продажи"]??"Без названия");quantity=toNumber(r["Количество"]);unit="";amount=toNumber(r["Выручка"]);operation="Продажа блюда";sku="";
    }else if(kind==="Порча"){
     type="Порча";name=String(r["Позиция"]??"Без названия");quantity=Math.abs(toNumber(r["Количество порчи"]));unit=String(r["Ед. изм."]??"");amount=toNumber(r["Сумма"]);operation="Порча";sku=String(r["Артикул"]??"");
    }else{
     type="Инвентаризационные расхождения";name=String(r["Товар"]??"Без названия");quantity=toNumber(r["Количество"]);unit=String(r["Единица измерения"]??"");amount=toNumber(r["Сумма"]);operation=String(r["Тип расхождения"]??"Не указано");sku=String(r["Артикул"]??"");warehouse=String(r["Склад"]??"");
    }
    const metric=Math.abs(amount);
    rows.push({"Тип отчёта":type,"Подразделение":point,"Артикул":sku,"Наименование":name,"Количество":quantity,"Единица измерения":unit,"Показатель для анализа, ₽":metric,"Сумма в отчёте, ₽":amount,"Выручка, ₽":type==="Продажи блюд"?amount:0,"Вид операции":operation,"Период отчёта":reportPeriod(source),"Исходный файл":source,"Склад":warehouse});
   }
  }
  if(!rows.length)throw new Error("Отчёты распознаны, но в них не оказалось строк с данными.");
  const name="Автоанализ — "+new Date().toLocaleDateString("ru-RU");
  const created=await s.db.from("datasets").insert({workspace_id:s.wid,name,notes:"Автоматически объединено из "+sourceSets.length+" исходных Excel-наборов. Исходные файлы не изменялись.",row_count:rows.length,columns:canonical,rows:[],uploaded_by:s.user.id,upload_status:"uploading",upload_error:null,stored_row_count:0,stored_chunks:0,source_file_name:"Автоматическое объединение Excel",source_file_size:0,source_file_last_modified:Date.now(),upload_started_at:new Date().toISOString()}).select("id").single();
  if(created.error)throw created.error;
  createdId=created.data.id;
  const batchSize=400,total=Math.ceil(rows.length/batchSize);
  for(let start=0,chunkIndex=0;start<rows.length;start+=batchSize,chunkIndex++){
   const batch=rows.slice(start,start+batchSize);
   const saved=await s.db.from("dataset_rows").insert({dataset_id:createdId,workspace_id:s.wid,chunk_index:chunkIndex,rows:batch,uploaded_by:s.user.id});
   if(saved.error)throw saved.error;
   loading.textContent="Сохраняю объединённый набор: пакет "+(chunkIndex+1)+" из "+total+" · "+Math.min(start+batch.length,rows.length).toLocaleString("ru-RU")+" из "+rows.length.toLocaleString("ru-RU")+" строк";
  }
  const finished=await s.db.from("datasets").update({upload_status:"complete",upload_error:null,upload_completed_at:new Date().toISOString()}).eq("id",createdId).eq("workspace_id",s.wid);
  if(finished.error)throw finished.error;
  await log("Сформирован объединённый аналитический набор",name+" · "+rows.length+" строк · "+sourceSets.length+" исходных наборов");
  await refresh();
  const ready=s.datasets.find(x=>x.id===createdId);
  if(!ready)throw new Error("Набор сохранён, но не появился в списке. Нажмите «Обновить» в разделе «Данные».");
  await openAnalytics(createdId);
 }catch(error){
  if(createdId)await s.db.from("datasets").update({upload_status:"interrupted",upload_error:String(error?.message||error)}).eq("id",createdId).eq("workspace_id",s.wid);
  loading.textContent="Не удалось сформировать аналитику: "+(error.message||String(error))+". Исходные Excel-файлы не удалены и не изменены.";
  content.classList.add("hidden");loading.classList.remove("hidden");
 }
}
async function openAnalytics(id){
 const dataset=s.datasets.find(x=>x.id===id);if(!dataset)return;
 const required=["Тип отчёта","Подразделение","Наименование","Показатель для анализа, ₽","Сумма в отчёте, ₽","Вид операции"];
 if(!Array.isArray(dataset.columns)||!required.every(c=>dataset.columns.includes(c))){toast("Этот набор не является объединённым набором аналитики AI Практики.");return}
 page("analytics");
 const loading=$("analyticsLoading"),content=$("analyticsContent");
 loading.classList.remove("hidden");content.classList.add("hidden");
 loading.textContent="Загружаю сохранённые части набора и рассчитываю показатели…";
 content.innerHTML="";
 try{
  const chunkCount=Number(dataset.stored_chunks||Math.ceil(Number(dataset.row_count||0)/2000));
  const all=[];
  for(let i=0;i<chunkCount;i++){
   const part=await getDatasetChunk(id,i);
   if(part?.length)all.push(...part);
   loading.textContent="Загружено "+all.length.toLocaleString("ru-RU")+" из "+Number(dataset.row_count||0).toLocaleString("ru-RU")+" строк…";
  }
  if(!all.length)throw new Error("В наборе нет сохранённых строк.");
  const byPoint=new Map();
  const getPoint=name=>{if(!byPoint.has(name))byPoint.set(name,{point:name,purchases:0,sales:0,spoilage:0,shortages:0,surpluses:0,purchaseRows:0,salesRows:0,spoilageRows:0});return byPoint.get(name)};
  const topSpoil=new Map();
  let purchaseRows=0,salesRows=0,spoilRows=0,varianceRows=0,zeroQtyWithAmount=0;
  for(const row of all){
   const type=String(row["Тип отчёта"]||"");
   const point=String(row["Подразделение"]||"Не указано");
   const item=String(row["Наименование"]||"Без названия");
   const metric=numeric(row,"Показатель для анализа, ₽");
   const amount=numeric(row,"Сумма в отчёте, ₽");
   const q=numeric(row,"Количество");
   const g=getPoint(point);
   if(type==="Закупки"){g.purchases+=metric;g.purchaseRows++;purchaseRows++}
   else if(type==="Продажи блюд"){g.sales+=numeric(row,"Выручка, ₽");g.salesRows++;salesRows++}
   else if(type==="Порча"){
    g.spoilage+=metric;g.spoilageRows++;spoilRows++;
    if(q===0&&metric!==0)zeroQtyWithAmount++;
    const key=point+"||"+String(row["Артикул"]||"")+"||"+item;
    const v=topSpoil.get(key)||{point,item,sku:String(row["Артикул"]||""),unit:String(row["Единица измерения"]||""),quantity:0,amount:0};
    v.quantity+=q;v.amount+=metric;topSpoil.set(key,v);
   }else if(type==="Инвентаризационные расхождения"){
    varianceRows++;
    if(String(row["Вид операции"]).includes("Недостача"))g.shortages+=Math.abs(amount);
    if(String(row["Вид операции"]).includes("Излишки"))g.surpluses+=Math.abs(amount);
   }
  }
  const retail=[...byPoint.values()].filter(x=>x.point!=="ПРЦ");
  const prc=byPoint.get("ПРЦ");
  const sum=(key)=>retail.reduce((n,x)=>n+x[key],0);
  const spoilSorted=[...topSpoil.values()].sort((a,b)=>b.amount-a.amount).slice(0,10);
  const storeSorted=[...retail].sort((a,b)=>b.spoilage-a.spoilage);
  const pizzeriaCount=retail.length,missing=Math.max(0,19-pizzeriaCount);
  const moneyCell=v=>rub(v);
  const metricCard=(label,value,sub)=>'<article class="analytics-metric"><small>'+label+'</small><b>'+value+'</b><span>'+sub+'</span></article>';
  const tableRows=storeSorted.map(x=>'<tr><td><b>'+esc(x.point)+'</b></td><td>'+moneyCell(x.purchases)+'</td><td>'+moneyCell(x.sales)+'</td><td class="warn-cell">'+moneyCell(x.spoilage)+'</td><td>'+moneyCell(x.shortages)+'</td><td>'+moneyCell(x.surpluses)+'</td></tr>').join("");
  const topRows=spoilSorted.map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(x.point)+'</td><td>'+esc(x.item)+'</td><td>'+esc(x.unit||"—")+'</td><td>'+((Math.abs(x.quantity)||0).toLocaleString("ru-RU",{maximumFractionDigits:3}))+'</td><td class="warn-cell">'+moneyCell(x.amount)+'</td></tr>').join("");
  const actions=[];
  if(spoilSorted[0]?.amount>50000)actions.push({level:"Высокий",title:"Проверить крупнейшую запись порчи",text:spoilSorted[0].point+" · "+spoilSorted[0].item+" · "+moneyCell(spoilSorted[0].amount)+". Сверить первичный документ, период, склад, количество и единицу измерения."});
  const bb=byPoint.get("ББ");
  if(bb&&(bb.shortages>100000||bb.surpluses>100000))actions.push({level:"Высокий",title:"Разобрать расхождения на точке ББ",text:"Недостачи "+moneyCell(bb.shortages)+"; излишки "+moneyCell(bb.surpluses)+". Проверять раздельно, без взаимозачёта."});
  const varianceOutliers=[...retail].filter(x=>x.shortages>100000||x.surpluses>100000).sort((a,b)=>(b.shortages+b.surpluses)-(a.shortages+a.surpluses)).slice(0,5);
  varianceOutliers.forEach(point=>actions.push({level:"Высокий",title:"Разобрать расхождения · "+point.point,text:"Недостачи "+moneyCell(point.shortages)+"; излишки "+moneyCell(point.surpluses)+". Проверять раздельно, начиная с крупнейших артикулов и складов."}));
  if(zeroQtyWithAmount>0)actions.push({level:"Средний",title:"Проверить качество отчёта о порче",text:zeroQtyWithAmount+" строк имеют денежную сумму при нулевом количестве. До проверки не использовать их для расчёта количественных норм."});
  if(missing>0)actions.push({level:"Средний",title:"Дополнить покрытие сети",text:"В данных "+pizzeriaCount+" пиццерий при заявленных 19. Не хватает отчётов ещё по "+missing+" точкам."});
  const salesPeriods=[...new Set(all.filter(row=>row["Тип отчёта"]==="Продажи блюд").map(row=>String(row["Период отчёта"]||"").trim()).filter(x=>x&&!x.startsWith("Не подтверждён")))];
  actions.push({level:"Средний",title:"Подтвердить периоды отчётов",text:"Период продаж: "+(salesPeriods.join(", ")||"не указан")+". Для закупок, порчи и инвентаризации период следует подтвердить в исходных отчётах iiko."});
  const actionHtml=actions.map(a=>'<article class="action-card"><span class="tag '+(a.level==="Высокий"?"high":"normal")+'">'+a.level+'</span><b>'+esc(a.title)+'</b><p>'+esc(a.text)+'</p></article>').join("");
  const prcHtml=prc?'<p class="muted">ПРЦ анализируется отдельно: закупки '+moneyCell(prc.purchases)+', продажи/прочие позиции '+moneyCell(prc.sales)+', порча '+moneyCell(prc.spoilage)+'. Эти суммы не включены в показатели пиццерий.</p>':"";
  content.innerHTML=
   '<div class="analytics-head"><div><h2>Результат анализа</h2><p class="muted">Набор: '+esc(dataset.name)+' · '+all.length.toLocaleString("ru-RU")+' строк · '+pizzeriaCount+' пиццерий + ПРЦ</p></div><button class="ghost" type="button" id="analyticsBack">← К данным</button></div>'+
   '<div class="analytics-grid">'+
    metricCard("Закупки по пиццериям",moneyCell(sum("purchases")),purchaseRows.toLocaleString("ru-RU")+" строк, без ПРЦ")+
    metricCard("Выручка пиццерий",moneyCell(sum("sales")),salesRows.toLocaleString("ru-RU")+" строк отчёта")+
    metricCard("Порча по отчёту",moneyCell(sum("spoilage")),spoilRows.toLocaleString("ru-RU")+" строк; сумма по модулю")+
    metricCard("Недостачи",moneyCell(sum("shortages")), "отдельно от излишков")+
    metricCard("Излишки",moneyCell(sum("surpluses")),"не считать прибылью")+
    metricCard("Строк данных",all.length.toLocaleString("ru-RU"),"все 4 типа отчётов")+
   '</div>'+
   '<article class="card"><h3>Что требует внимания</h3><div class="action-list">'+actionHtml+'</div>'+prcHtml+'</article>'+
   '<article class="card"><h3>Сравнение пиццерий</h3><p class="muted">Суммы из разных типов отчётов показаны рядом, но не являются прямым сравнением эффективности: периоды и экономический смысл показателей различаются.</p><div class="table-scroll"><table class="data-preview"><thead><tr><th>Точка</th><th>Закупки</th><th>Выручка</th><th>Порча</th><th>Недостачи</th><th>Излишки</th></tr></thead><tbody>'+tableRows+'</tbody></table></div></article>'+
   '<article class="card"><h3>Крупнейшие позиции порчи</h3><div class="table-scroll"><table class="data-preview"><thead><tr><th>№</th><th>Точка</th><th>Позиция</th><th>Ед.</th><th>Кол-во</th><th>Сумма</th></tr></thead><tbody>'+topRows+'</tbody></table></div></article>'+
   '<article class="card"><h3>Как читать результат</h3><ul class="analytics-notes"><li>ПРЦ вынесен отдельно и не смешивается с розничными точками.</li><li>Недостачи и излишки показаны отдельно — их нельзя взаимозачитывать.</li><li>Порча — предварительная оценка по сумме из отчёта; часть строк требует проверки.</li><li>Это первый слой автоматической аналитики, а не автоматическое решение о закупке.</li></ul></article>';
  $("analyticsBack").onclick=()=>page("data");
  loading.classList.add("hidden");content.classList.remove("hidden");
  await log("Открыт анализ набора данных",dataset.name+" · "+all.length+" строк");
 }catch(error){
  loading.textContent="Не удалось выполнить анализ: "+(error.message||String(error));
 }
}
async function deleteDataset(id,button){
 const dataset=s.datasets.find(x=>x.id===id);if(!dataset)return;
 if(s.role!=="owner"&&dataset.uploaded_by!==s.user.id){toast("Удалить этот набор может только владелец или автор загрузки.");return}
 if((dataset.upload_status||"complete")==="uploading"){toast("Нельзя удалить набор во время загрузки.");return}
 const count=Number(dataset.row_count||dataset.stored_row_count||0).toLocaleString("ru-RU");
 if(!confirm("Удалить набор «"+dataset.name+"» ("+count+" строк)? Запись набора и все сохранённые строки будут удалены без возможности восстановления."))return;
 if(button)button.disabled=true;
 const result=await s.db.from("datasets").delete().eq("id",id).eq("workspace_id",s.wid).select("id").maybeSingle();
 if(result.error){if(button)button.disabled=false;toast("Не удалось удалить набор: "+result.error.message);return}
 if(!result.data){if(button)button.disabled=false;toast("Набор не найден или у вашей роли нет прав на удаление.");return}
 if(s.resumeDatasetId===id)s.resumeDatasetId=null;
 if(s.datasetViewer?.dataset?.id===id){$("datasetViewer").classList.add("hidden");s.datasetViewer=null}
 try{await log("Набор данных удалён",dataset.name+" · "+count+" строк")}catch(error){console.warn(error)}
 try{await refresh();toast("Набор удалён вместе со всеми сохранёнными строками.")}
 catch(error){toast("Набор удалён, но список не обновился. Нажмите «Обновить».")}
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
  try{await refresh()}catch(refreshError){console.warn(refreshError);toast("Данные сохранены, но список не обновился. Нажмите «Обновить».")}
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
async function feedback(e){e.preventDefault();let p={workspace_id:s.wid,user_id:s.user.id,feedback_type:$("fbType").value,page_name:$("fbPage").value.trim(),message:$("fbText").value.trim(),priority:$("fbPriority").value},r=await s.db.from("feedback").insert(p);if(r.error){$("fbMsg").textContent=r.error.message;return}await log("Обратная связь",types[p.feedback_type]+": "+p.message.slice(0,140));$("feedbackForm").reset();$("fbMsg").textContent="Спасибо! Отзыв сохранён.";await refresh()}async function enter(){let r=await s.db.from("workspace_members").select("workspace_id,role").eq("workspace_id",c.workspaceId).eq("user_id",s.user.id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw Error("У этой учётной записи нет доступа к пилоту.");s.role=r.data.role;s.wid=r.data.workspace_id;$("login").classList.add("hidden");$("app").classList.remove("hidden");$("userEmail").textContent=s.user.email;$("userRole").textContent=s.role==="owner"?"Владелец пилота":"Тестировщик";await refresh()}async function init(){if(!c.supabaseUrl||!c.supabaseAnonKey||!c.workspaceId||!window.supabase){$("loginError").textContent="Нужно настроить config.js по инструкции README.";return}s.db=window.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey);let r=await s.db.auth.getSession();if(r.data.session){s.user=r.data.session.user;try{await enter()}catch(x){$("loginError").textContent=x.message}}s.db.auth.onAuthStateChange(async(_e,session)=>{if(!session){s.user=null;$("app").classList.add("hidden");$("login").classList.remove("hidden");return}s.user=session.user;try{await enter()}catch(x){$("loginError").textContent=x.message}})}$("loginForm").onsubmit=async e=>{e.preventDefault();$("loginError").textContent="";if(!s.db){$("loginError").textContent="Сначала настройте приложение.";return}let r=await s.db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(r.error)$("loginError").textContent=r.error.message};$("logout").onclick=()=>s.db.auth.signOut();$("nav").onclick=e=>{let b=e.target.closest("[data-page]");if(b)page(b.dataset.page)};document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>page(b.dataset.go));$("newTask").onclick=()=>openTask();$("closeDialog").onclick=$("cancelDialog").onclick=()=>$("taskDialog").close();$("taskForm").onsubmit=saveTask;$("taskList").onclick=e=>{let a=e.target.closest("[data-edit]"),b=e.target.closest("[data-delete]");if(a)openTask(a.dataset.edit);if(b)deleteTask(b.dataset.delete)};document.querySelector(".filters").onclick=e=>{let b=e.target.closest("[data-filter]");if(!b)return;s.filter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));render()};$("uploadForm").onsubmit=upload;$("datasetList").onclick=e=>{const analyze=e.target.closest("[data-analyze-dataset]");if(analyze){e.stopPropagation();openAnalytics(analyze.dataset.analyzeDataset);return}const del=e.target.closest("[data-delete-dataset]");if(del){e.stopPropagation();deleteDataset(del.dataset.deleteDataset,del);return}const b=e.target.closest("[data-resume]");if(b){e.stopPropagation();const d=s.datasets.find(x=>x.id===b.dataset.resume);if(!d)return;s.resumeDatasetId=d.id;$("dataName").value=d.name;$("dataNotes").value=d.notes||"";$("dataFile").value="";$("uploadMsg").textContent="Выберите тот же исходный файл Excel, который загружали ранее.";$("dataFile").click();return}const card=e.target.closest("[data-open-dataset]");if(card&&!e.target.closest("button"))openDataset(card.dataset.openDataset)};$("datasetList").onkeydown=e=>{if(e.key!=="Enter"&&e.key!==" ")return;const card=e.target.closest("[data-open-dataset]");if(card&&e.target===card){e.preventDefault();openDataset(card.dataset.openDataset)}};$("closeDatasetViewer").onclick=()=>{$("datasetViewer").classList.add("hidden");s.datasetViewer=null};$("datasetPrev").onclick=()=>moveDatasetPage(-1);$("datasetNext").onclick=()=>moveDatasetPage(1);$("feedbackForm").onsubmit=feedback;$("refresh").onclick=()=>refresh().catch(x=>toast(x.message));init()})();