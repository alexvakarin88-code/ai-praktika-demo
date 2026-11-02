(()=>{const c=window.APP_CONFIG||{},$=id=>document.getElementById(id),s={db:null,user:null,role:null,wid:null,tasks:[],datasets:[],feedback:[],history:[],filter:"all",schemaReady:false,resumeDatasetId:null};const labels={open:"Новая",progress:"В работе",done:"Решена"},types={bug:"Ошибка",confusing:"Непонятно",idea:"Идея",positive:"Полезно"},esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),date=x=>x?new Date(x).toLocaleString("ru-RU"):"";function toast(t){$("toast").textContent=t;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",3000)}function page(p){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$("page-"+p).classList.add("active");document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===p));$("pageTitle").textContent=({overview:"Обзор",tasks:"Задачи",data:"Данные",feedback:"Обратная связь",history:"История"})[p]}async function log(event,summary){let r=await s.db.from("activity_log").insert({workspace_id:s.wid,actor_id:s.user.id,event_type:event,details:{summary}});if(r.error)console.warn(r.error.message)}async function membership(){let r=await s.db.from("workspace_members").select("workspace_id,role").eq("workspace_id",c.workspaceId).eq("user_id",s.user.id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw Error("Для этого аккаунта не выдан доступ. Обратитесь к владельцу пилота.");s.role=r.data.role;s.wid=r.data.workspace_id}function taskCard(t){return '<article class="item"><div class="bar"><b>'+esc(t.title)+'</b><span class="tag '+t.status+'">'+labels[t.status]+'</span></div><p>'+esc(t.description||"Описание не добавлено")+'</p>'+(t.last_comment?'<p><b>Комментарий:</b> '+esc(t.last_comment)+'</p>':'')+'<small>'+date(t.updated_at)+'</small><div class="bar" style="justify-content:flex-start;margin-top:8px"><button class="ghost" data-edit="'+t.id+'">Открыть / изменить</button>'+(s.role==="owner"?'<button class="ghost" data-delete="'+t.id+'">Удалить</button>':'')+'</div></article>'}function historyCard(x){return '<article class="item"><b>'+esc(x.event_type)+'</b><p>'+esc(x.details?.summary||"")+'</p><small>'+date(x.created_at)+'</small></article>'}function datasetCard(x){
 const status=x.upload_status||"complete",done=status==="complete";
 const actual=Number(x.stored_row_count||0),expected=Number(x.row_count||0);
 const statusText=done?"Завершено":status==="uploading"?"Загрузка прервана или ещё выполняется":"Можно продолжить";
 const countText=done?expected+" строк":actual+" из "+expected+" строк сохранено";
 const resume=(!done&&x.uploaded_by===s.user.id&&x.source_file_hash)?'<button class="ghost" data-resume="'+esc(x.id)+'">Продолжить загрузку</button>':"";
 return '<article class="item"><div class="bar"><b>'+esc(x.name)+'</b><small>'+statusText+'</small></div><p>'+countText+' · '+esc(x.notes||"")+'</p>'+(x.upload_error?'<p class="error">'+esc(x.upload_error)+'</p>':"")+'<small>'+date(x.created_at)+'</small><div style="margin-top:8px">'+resume+'</div></article>';
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
 const ds=await s.db.from("datasets").select("id,name,notes,row_count,created_at,uploaded_by,upload_status,upload_error,stored_row_count,stored_chunks,source_file_name,source_file_size,source_file_last_modified,source_file_hash").eq("workspace_id",s.wid).order("created_at",{ascending:false});
 if(ds.error){
  const legacy=await s.db.from("datasets").select("id,name,notes,row_count,created_at,uploaded_by").eq("workspace_id",s.wid).order("created_at",{ascending:false});
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
 let worker=null,datasetId=null,finished=false,totalRows=0,actualSavedRows=0,chunkCount=0;
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
  const r=await s.db.auth.refreshSession();
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
   if(!d.source_file_hash||d.source_file_hash!==m.fileHash||Number(d.source_file_size)!==f.size||Number(d.source_file_last_modified)!==Number(f.lastModified)||Number(d.row_count)!==Number(m.totalRows)){
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
async function feedback(e){e.preventDefault();let p={workspace_id:s.wid,user_id:s.user.id,feedback_type:$("fbType").value,page_name:$("fbPage").value.trim(),message:$("fbText").value.trim(),priority:$("fbPriority").value},r=await s.db.from("feedback").insert(p);if(r.error){$("fbMsg").textContent=r.error.message;return}await log("Обратная связь",types[p.feedback_type]+": "+p.message.slice(0,140));$("feedbackForm").reset();$("fbMsg").textContent="Спасибо! Отзыв сохранён.";await refresh()}async function enter(){let r=await s.db.from("workspace_members").select("workspace_id,role").eq("workspace_id",c.workspaceId).eq("user_id",s.user.id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw Error("У этой учётной записи нет доступа к пилоту.");s.role=r.data.role;s.wid=r.data.workspace_id;$("login").classList.add("hidden");$("app").classList.remove("hidden");$("userEmail").textContent=s.user.email;$("userRole").textContent=s.role==="owner"?"Владелец пилота":"Тестировщик";await refresh()}async function init(){if(!c.supabaseUrl||!c.supabaseAnonKey||!c.workspaceId||!window.supabase){$("loginError").textContent="Нужно настроить config.js по инструкции README.";return}s.db=window.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey);let r=await s.db.auth.getSession();if(r.data.session){s.user=r.data.session.user;try{await enter()}catch(x){$("loginError").textContent=x.message}}s.db.auth.onAuthStateChange(async(_e,session)=>{if(!session){s.user=null;$("app").classList.add("hidden");$("login").classList.remove("hidden");return}s.user=session.user;try{await enter()}catch(x){$("loginError").textContent=x.message}})}$("loginForm").onsubmit=async e=>{e.preventDefault();$("loginError").textContent="";if(!s.db){$("loginError").textContent="Сначала настройте приложение.";return}let r=await s.db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(r.error)$("loginError").textContent=r.error.message};$("logout").onclick=()=>s.db.auth.signOut();$("nav").onclick=e=>{let b=e.target.closest("[data-page]");if(b)page(b.dataset.page)};document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>page(b.dataset.go));$("newTask").onclick=()=>openTask();$("closeDialog").onclick=$("cancelDialog").onclick=()=>$("taskDialog").close();$("taskForm").onsubmit=saveTask;$("taskList").onclick=e=>{let a=e.target.closest("[data-edit]"),b=e.target.closest("[data-delete]");if(a)openTask(a.dataset.edit);if(b)deleteTask(b.dataset.delete)};document.querySelector(".filters").onclick=e=>{let b=e.target.closest("[data-filter]");if(!b)return;s.filter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));render()};$("uploadForm").onsubmit=upload;$("datasetList").onclick=e=>{const b=e.target.closest("[data-resume]");if(!b)return;const d=s.datasets.find(x=>x.id===b.dataset.resume);if(!d)return;s.resumeDatasetId=d.id;$("dataName").value=d.name;$("dataNotes").value=d.notes||"";$("dataFile").value="";$("uploadMsg").textContent="Выберите тот же исходный файл Excel, который загружали ранее.";$("dataFile").click()};$("feedbackForm").onsubmit=feedback;$("refresh").onclick=()=>refresh().catch(x=>toast(x.message));init()})();