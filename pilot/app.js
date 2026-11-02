(()=>{const c=window.APP_CONFIG||{},$=id=>document.getElementById(id),s={db:null,user:null,role:null,wid:null,tasks:[],datasets:[],feedback:[],history:[],filter:"all"};const labels={open:"Новая",progress:"В работе",done:"Решена"},types={bug:"Ошибка",confusing:"Непонятно",idea:"Идея",positive:"Полезно"},esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),date=x=>x?new Date(x).toLocaleString("ru-RU"):"";function toast(t){$("toast").textContent=t;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",3000)}function page(p){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$("page-"+p).classList.add("active");document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===p));$("pageTitle").textContent=({overview:"Обзор",tasks:"Задачи",data:"Данные",feedback:"Обратная связь",history:"История"})[p]}async function log(event,summary){let r=await s.db.from("activity_log").insert({workspace_id:s.wid,actor_id:s.user.id,event_type:event,details:{summary}});if(r.error)console.warn(r.error.message)}async function membership(){let r=await s.db.from("workspace_members").select("workspace_id,role").eq("workspace_id",c.workspaceId).eq("user_id",s.user.id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw Error("Для этого аккаунта не выдан доступ. Обратитесь к владельцу пилота.");s.role=r.data.role;s.wid=r.data.workspace_id}function taskCard(t){return '<article class="item"><div class="bar"><b>'+esc(t.title)+'</b><span class="tag '+t.status+'">'+labels[t.status]+'</span></div><p>'+esc(t.description||"Описание не добавлено")+'</p>'+(t.last_comment?'<p><b>Комментарий:</b> '+esc(t.last_comment)+'</p>':'')+'<small>'+date(t.updated_at)+'</small><div class="bar" style="justify-content:flex-start;margin-top:8px"><button class="ghost" data-edit="'+t.id+'">Открыть / изменить</button>'+(s.role==="owner"?'<button class="ghost" data-delete="'+t.id+'">Удалить</button>':'')+'</div></article>'}function historyCard(x){return '<article class="item"><b>'+esc(x.event_type)+'</b><p>'+esc(x.details?.summary||"")+'</p><small>'+date(x.created_at)+'</small></article>'}function render(){let n=s.tasks.filter(x=>x.status==="open").length,p=s.tasks.filter(x=>x.status==="progress").length,d=s.tasks.filter(x=>x.status==="done").length;$("countOpen").textContent=n;$("countProgress").textContent=p;$("countDone").textContent=d;$("countFeedback").textContent=s.feedback.length;$("recentTasks").innerHTML=s.tasks.slice(0,4).map(taskCard).join("")||'<p class="muted">Задач пока нет.</p>';$("recentHistory").innerHTML=s.history.slice(0,4).map(historyCard).join("")||'<p class="muted">История пока пуста.</p>';$("taskList").innerHTML=s.tasks.filter(x=>s.filter==="all"||x.status===s.filter).map(taskCard).join("")||'<p class="muted">В этой категории задач нет.</p>';$("datasetList").innerHTML=s.datasets.map(x=>'<article class="item"><b>'+esc(x.name)+'</b><p>'+x.row_count+' строк · '+esc(x.notes||"")+'</p><small>'+date(x.created_at)+'</small></article>').join("")||'<p class="muted">Наборов пока нет.</p>';$("feedbackList").innerHTML=s.feedback.map(x=>'<article class="item"><b>'+types[x.feedback_type]+'</b><p>'+esc(x.message)+'</p><small>'+esc(x.page_name||"")+' · '+date(x.created_at)+'</small></article>').join("")||'<p class="muted">Отзывов пока нет.</p>';$("historyList").innerHTML=s.history.map(historyCard).join("")||'<p class="muted">История пока пуста.</p>'}async function refresh(){ $("syncState").textContent="Синхронизация…";let q=await Promise.all([s.db.from("tasks").select("*").eq("workspace_id",s.wid).order("updated_at",{ascending:false}),s.db.from("datasets").select("id,name,notes,row_count,created_at").eq("workspace_id",s.wid).order("created_at",{ascending:false}),s.db.from("feedback").select("*").eq("workspace_id",s.wid).order("created_at",{ascending:false}),s.db.from("activity_log").select("*").eq("workspace_id",s.wid).order("created_at",{ascending:false}).limit(100)]);for(let x of q)if(x.error)throw x.error;[s.tasks,s.datasets,s.feedback,s.history]=q.map(x=>x.data||[]);render();$("syncState").textContent="Данные синхронизированы"}function openTask(id=""){let t=s.tasks.find(x=>x.id===id);$("taskForm").reset();$("taskId").value=t?.id||"";$("dialogTitle").textContent=t?"Изменить задачу":"Новая задача";$("taskTitle").value=t?.title||"";$("taskDescription").value=t?.description||"";$("taskStatus").value=t?.status||"open";$("taskPriority").value=t?.priority||"normal";$("taskComment").value=t?.last_comment||"";$("taskError").textContent="";$("taskDialog").showModal()}async function saveTask(e){e.preventDefault();let id=$("taskId").value,p={workspace_id:s.wid,title:$("taskTitle").value.trim(),description:$("taskDescription").value.trim(),status:$("taskStatus").value,priority:$("taskPriority").value,last_comment:$("taskComment").value.trim(),updated_by:s.user.id};let r=id?await s.db.from("tasks").update(p).eq("id",id).eq("workspace_id",s.wid):await s.db.from("tasks").insert({...p,created_by:s.user.id});if(r.error){$("taskError").textContent=r.error.message;return}await log(id?"Задача изменена":"Создана задача",p.title+(p.last_comment?" — "+p.last_comment:""));$("taskDialog").close();await refresh();toast("Задача сохранена")}async function deleteTask(id){if(!confirm("Удалить задачу?"))return;let r=await s.db.from("tasks").delete().eq("id",id).eq("workspace_id",s.wid);if(r.error){toast(r.error.message);return}await log("Задача удалена",id);await refresh()}async function upload(e){
e.preventDefault();
const f=$("dataFile").files[0],msg=$("uploadMsg"),btn=$("uploadForm").querySelector('button[type="submit"],button:not([type])');
if(!f){msg.textContent="Сначала выберите файл.";return}
if(f.size>100*1024*1024){msg.textContent="Файл больше 100 МБ. Для такой ведомости потребуется отдельная обработка.";return}
if(btn)btn.disabled=true;
msg.textContent=f.size>25*1024*1024?"Большой файл. Подготовка в отдельном потоке…":"Подготовка файла…";
let worker=null,datasetId=null,chunkCount=0,finished=false;
const cleanup=async()=>{
 if(!datasetId)return;
 const d=await s.db.from("datasets").delete().eq("id",datasetId).eq("workspace_id",s.wid);
 if(d.error)console.warn("Не удалось удалить неполный набор:",d.error.message);
 datasetId=null;
};
const fail=async err=>{
 if(finished)return;
 finished=true;
 if(worker)worker.terminate();
 try{await cleanup()}catch(_){}
 msg.textContent="Не удалось сохранить файл: "+(err?.message||String(err));
 if(btn)btn.disabled=false;
};
const transientError=err=>{
 const message=String(err?.message||err||"");
 return err instanceof TypeError ||
  /failed to fetch|network|timeout|temporar|connection|load failed/i.test(message) ||
  err?.status===429 || Number(err?.status)>=500;
};
const saveChunk=async payload=>{
 let lastError=null;
 for(let attempt=0;attempt<5;attempt++){
  try{
   const result=await s.db.from("dataset_rows").insert(payload);
   if(!result.error)return;
   if(result.error.code==="23505")return;
   lastError=result.error;
   if(!transientError(result.error))throw result.error;
  }catch(error){
   if(error?.code==="23505")return;
   lastError=error;
   if(!transientError(error))throw error;
  }
  if(attempt<4){
   msg.textContent="Связь прервалась. Повторяю отправку части "+(payload.chunk_index+1)+" ("+(attempt+2)+"/5)…";
   await new Promise(resolve=>setTimeout(resolve,Math.min(800*Math.pow(2,attempt),8000)));
  }
 }
 throw lastError||new Error("Не удалось передать часть файла после нескольких попыток.");
};
try{
 worker=new Worker("parser-worker.js");
 worker.onerror=ev=>{ev.preventDefault();fail(new Error("Ошибка фонового обработчика. Попробуйте сохранить файл в формате XLSX или CSV."))};
 worker.onmessage=async ev=>{
  const m=ev.data||{};
  if(finished)return;
  try{
   if(m.type==="meta"){
    const r=await s.db.from("datasets").insert({
     workspace_id:s.wid,name:$("dataName").value.trim(),notes:$("dataNotes").value.trim(),
     row_count:m.totalRows,columns:m.columns,rows:[],uploaded_by:s.user.id
    }).select("id").single();
    if(r.error)throw r.error;
    datasetId=r.data.id;
    msg.textContent="Файл прочитан. Сохраняю "+m.totalRows+" строк небольшими пакетами…";
    worker.postMessage({type:"ack"});
   }else if(m.type==="chunk"){
    if(!datasetId)throw new Error("Не удалось создать запись набора данных.");
    await saveChunk({
     dataset_id:datasetId,workspace_id:s.wid,chunk_index:m.chunkIndex,
     rows:m.rows,uploaded_by:s.user.id
    });
    chunkCount++;
    msg.textContent="Сохранение: "+m.processedRows+" из "+m.totalRows+" строк ("+chunkCount+" частей)…";
    worker.postMessage({type:"ack"});
   }else if(m.type==="done"){
    if(!datasetId)throw new Error("Файл не содержит строк с данными.");
    await log("Загружен набор данных",f.name+" · "+m.totalRows+" строк");
    finished=true;
    worker.terminate();
    $("uploadForm").reset();
    msg.textContent="Данные сохранены: "+m.totalRows+" строк, "+chunkCount+" частей.";
    if(btn)btn.disabled=false;
    try{await refresh()}catch(refreshError){console.warn(refreshError);toast("Данные сохранены, но список не обновился. Нажмите «Обновить».")}
   }else if(m.type==="error"){
    throw new Error(m.message||"Не удалось прочитать файл.");
   }
  }catch(error){await fail(error)}
 };
 worker.postMessage({file:f});
}catch(err){await fail(err)}
}async function feedback(e){e.preventDefault();let p={workspace_id:s.wid,user_id:s.user.id,feedback_type:$("fbType").value,page_name:$("fbPage").value.trim(),message:$("fbText").value.trim(),priority:$("fbPriority").value},r=await s.db.from("feedback").insert(p);if(r.error){$("fbMsg").textContent=r.error.message;return}await log("Обратная связь",types[p.feedback_type]+": "+p.message.slice(0,140));$("feedbackForm").reset();$("fbMsg").textContent="Спасибо! Отзыв сохранён.";await refresh()}async function enter(){let r=await s.db.from("workspace_members").select("workspace_id,role").eq("workspace_id",c.workspaceId).eq("user_id",s.user.id).maybeSingle();if(r.error)throw r.error;if(!r.data)throw Error("У этой учётной записи нет доступа к пилоту.");s.role=r.data.role;s.wid=r.data.workspace_id;$("login").classList.add("hidden");$("app").classList.remove("hidden");$("userEmail").textContent=s.user.email;$("userRole").textContent=s.role==="owner"?"Владелец пилота":"Тестировщик";await refresh()}async function init(){if(!c.supabaseUrl||!c.supabaseAnonKey||!c.workspaceId||!window.supabase){$("loginError").textContent="Нужно настроить config.js по инструкции README.";return}s.db=window.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey);let r=await s.db.auth.getSession();if(r.data.session){s.user=r.data.session.user;try{await enter()}catch(x){$("loginError").textContent=x.message}}s.db.auth.onAuthStateChange(async(_e,session)=>{if(!session){s.user=null;$("app").classList.add("hidden");$("login").classList.remove("hidden");return}s.user=session.user;try{await enter()}catch(x){$("loginError").textContent=x.message}})}$("loginForm").onsubmit=async e=>{e.preventDefault();$("loginError").textContent="";if(!s.db){$("loginError").textContent="Сначала настройте приложение.";return}let r=await s.db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(r.error)$("loginError").textContent=r.error.message};$("logout").onclick=()=>s.db.auth.signOut();$("nav").onclick=e=>{let b=e.target.closest("[data-page]");if(b)page(b.dataset.page)};document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>page(b.dataset.go));$("newTask").onclick=()=>openTask();$("closeDialog").onclick=$("cancelDialog").onclick=()=>$("taskDialog").close();$("taskForm").onsubmit=saveTask;$("taskList").onclick=e=>{let a=e.target.closest("[data-edit]"),b=e.target.closest("[data-delete]");if(a)openTask(a.dataset.edit);if(b)deleteTask(b.dataset.delete)};document.querySelector(".filters").onclick=e=>{let b=e.target.closest("[data-filter]");if(!b)return;s.filter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));render()};$("uploadForm").onsubmit=upload;$("feedbackForm").onsubmit=feedback;$("refresh").onclick=()=>refresh().catch(x=>toast(x.message));init()})();