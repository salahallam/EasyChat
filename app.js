const {createClient}=window.supabase||{};
const SUPABASE_URL=String(window.EASYCHAT_SUPABASE_URL||"").trim();
const SUPABASE_KEY=String(window.EASYCHAT_SUPABASE_KEY||"").trim();
const SUPABASE_READY=!!(createClient && /^https:\/\/[^\s]+\.supabase\.co(?:\/.*)?$/i.test(SUPABASE_URL) && SUPABASE_KEY && !/^YOUR[-_]/i.test(SUPABASE_KEY));
const supabase=SUPABASE_READY?createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}}):null;
const BUCKET=window.EASYCHAT_STORAGE_BUCKET||"chat-files";
let currentUser=null,profile=null,currentChat=null,chats=[],messages=[],chatMembers=[],chatChannel=null,messageChannel=null,typingTimer=null,replyTo=null;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const initials=s=>(s||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"?";
const toast=m=>{ $("toast").textContent=m;$("toast").classList.add("show");clearTimeout(window.__t);window.__t=setTimeout(()=>$("toast").classList.remove("show"),2800); };
const time=t=>new Date(t).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
const dateTime=t=>new Date(t).toLocaleString([], {dateStyle:"short",timeStyle:"short"});
function showAuth(){$("authView").classList.remove("hidden");$("appView").classList.add("hidden")}
function showApp(){$("authView").classList.add("hidden");$("appView").classList.remove("hidden")}
function appOrigin(){return window.location.origin.endsWith("/")?window.location.origin:window.location.origin+"/"}
function guardSupabase(){if(!SUPABASE_READY){$("configWarning")?.classList.remove("hidden");toast("Add your Supabase URL and publishable key in supabase-config.js");return false}return true}
function setBusy(button,busy,label){if(!button)return;button.disabled=busy;if(busy){button.dataset.oldLabel=button.textContent;button.textContent="Please wait…"}else{button.textContent=label||button.dataset.oldLabel||"Continue"}}
function showAuthMode(mode){
  document.querySelectorAll(".mode-btn").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  $("signupFields").classList.toggle("hidden",mode!=="signup");
  $("emailSubmit").textContent=mode==="signup"?"Create account":"Sign in";
  $("forgotPassword").classList.toggle("hidden",mode==="signup");
  $("password").autocomplete=mode==="signup"?"new-password":"current-password";
}
function avatar(p){return p?.avatar_url?`<img src="${esc(p.avatar_url)}">`:esc(initials(p?.full_name||p?.title))}
async function profileFor(id){const {data}=await supabase.from("profiles").select("*").eq("id",id).maybeSingle();return data}

async function init(){
  showAuth();
  if(!SUPABASE_READY){$("configWarning")?.classList.remove("hidden");return}
  try{
    const {data:{session},error}=await supabase.auth.getSession();
    if(error) throw error;
    if(session){currentUser=session.user;await startApp()}
    supabase.auth.onAuthStateChange(async(_e,s)=>{
      currentUser=s?.user||null;
      if(currentUser) await startApp(); else showAuth();
    });
  }catch(e){console.error(e);toast(e.message||"Unable to start EasyChat")}
}
async function startApp(){
 try{
  profile=await profileFor(currentUser.id);
  if(!profile){await supabase.from("profiles").insert({id:currentUser.id,full_name:currentUser.user_metadata?.full_name||currentUser.email?.split("@")[0]||"EasyChat User"});profile=await profileFor(currentUser.id)}
  showApp();$("meStrip").innerHTML=`<div class="avatar">${avatar(profile)}</div><div class="grow"><strong>${esc(profile.full_name)}</strong><div style="color:var(--muted)">@${esc(profile.username||"user")}</div></div><span class="online-dot"></span>`;
  await setOnline(true);await loadChats();await loadNotifications();subscribeGlobal();
 }catch(e){console.error(e);toast(e.message||"Startup error")}
}
async function setOnline(v){await supabase.from("profiles").update({is_online:v,last_seen:new Date().toISOString()}).eq("id",currentUser.id)}
window.addEventListener("beforeunload",()=>{if(currentUser)supabase.from("profiles").update({is_online:false,last_seen:new Date().toISOString()}).eq("id",currentUser.id)});
document.addEventListener("visibilitychange",()=>{if(currentUser&&!document.hidden)setOnline(true)});

async function loadChats(){
 const {data,error}=await supabase.from("chat_members").select("chat_id,last_read_at,chats(id,type,title,avatar_url,updated_at,created_by)").eq("user_id",currentUser.id);
 if(error)throw error;
 const raw=(data||[]).filter(x=>x.chats).map(x=>({...x.chats,last_read_at:x.last_read_at}));
 for(const c of raw){
  if(c.type==="direct"){
   const {data:mem}=await supabase.from("chat_members").select("user_id,profiles(full_name,avatar_url,is_online,last_seen)").eq("chat_id",c.id).neq("user_id",currentUser.id);
   const p=mem?.[0]?.profiles;if(p){c.title=p.full_name;c.avatar_url=p.avatar_url;c.other=p}
  }
  const {count}=await supabase.from("messages").select("id",{count:"exact",head:true}).eq("chat_id",c.id).gt("created_at",c.last_read_at||"1970-01-01").neq("sender_id",currentUser.id);
  c.unread=count||0;
 }
 chats=raw.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));renderChats(chats);
}
function renderChats(list){
 $("chatList").innerHTML=list.length?list.map(c=>`<div class="chat-item ${currentChat?.id===c.id?"active":""}" data-id="${c.id}">
 <div class="avatar">${c.avatar_url?`<img src="${esc(c.avatar_url)}">`:esc(initials(c.title||"Chat"))}</div>
 <div class="chat-meta"><strong>${esc(c.title||"Chat")}</strong><span>${c.unread?`<span class="unread">${c.unread} new</span>`:(c.type==="group"?"Group":"Direct message")}</span></div>
 </div>`).join(""):'<div class="empty-state" style="padding:35px 15px"><p>No chats yet.</p><p>Start a new conversation.</p></div>';
 $("chatList").querySelectorAll(".chat-item").forEach(x=>x.onclick=()=>openChat(x.dataset.id));
}
function subscribeGlobal(){
 if(window.globalChannel)supabase.removeChannel(window.globalChannel);
 window.globalChannel=supabase.channel("user-"+currentUser.id)
 .on("postgres_changes",{event:"*",schema:"public",table:"chats"},()=>loadChats())
 .on("postgres_changes",{event:"*",schema:"public",table:"chat_members",filter:`user_id=eq.${currentUser.id}`},()=>loadChats())
 .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`user_id=eq.${currentUser.id}`},p=>{toast(p.new.title);loadNotifications()})
 .subscribe();
}
async function openChat(id){
 currentChat=chats.find(c=>c.id===id);if(!currentChat)return;
 $("appView").classList.add("chat-open");$("conversationHead").classList.remove("empty");$("headName").textContent=currentChat.title||"Chat";$("headAvatar").innerHTML=avatar({avatar_url:currentChat.avatar_url,full_name:currentChat.title});$("headStatus").textContent=currentChat.type==="group"?"Group":(currentChat.other?.is_online?"online":`last seen ${currentChat.other?.last_seen?dateTime(currentChat.other.last_seen):"recently"}`);
 $("messageForm").classList.remove("hidden");$("chatInfoBtn").classList.remove("hidden");renderChats(chats);await loadMembers();await loadMessages();await markRead();subscribeChatRealtime();enterPresence();
}
async function loadMembers(){const {data}=await supabase.from("chat_members").select("user_id,role,profiles(full_name,username,avatar_url,is_online,last_seen)").eq("chat_id",currentChat.id);chatMembers=data||[]}
async function loadMessages(){
 const {data,error}=await supabase.from("messages").select("*,profiles:sender_id(full_name,avatar_url),message_reactions(*)").eq("chat_id",currentChat.id).order("created_at",{ascending:true}).limit(300);
 if(error){toast(error.message);return}messages=data||[];renderMessages();
}
const fileUrlCache=new Map();
async function getFileUrl(path){
  if(!path)return null;
  if(fileUrlCache.has(path))return fileUrlCache.get(path);
  const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,3600);
  if(error){console.warn(error);return null}
  fileUrlCache.set(path,data.signedUrl);return data.signedUrl;
}
async function attachmentHtml(m){
  if(!m.file_path)return"";
  const url=await getFileUrl(m.file_path);
  if(!url)return`<div class="file-card">📎 ${esc(m.file_name||"File")} <small>File unavailable</small></div>`;
  if(m.message_type==="image")return`<a class="attachment" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(m.file_name||"image")}"></a>`;
  return`<a class="attachment file-card" href="${esc(url)}" target="_blank" rel="noopener">📎 ${esc(m.file_name||"File")}</a>`;
}
async function renderMessages(){
 const box=$("messages");
 if(!messages.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">👋</div><h2>Start the conversation</h2><p>Send the first message.</p></div>';return}
 const rows=[];
 for(const m of messages){
  const attachment=await attachmentHtml(m);
  rows.push({m,attachment});
 }
 box.innerHTML=rows.map(({m,attachment})=>{
  const mine=m.sender_id===currentUser.id, deleted=!!m.deleted_at;
  const reactions=(m.message_reactions||[]).reduce((a,r)=>(a[r.reaction]=(a[r.reaction]||0)+1,a),{});
  const reacts=Object.entries(reactions).map(([r,n])=>`<button class="reaction" data-mid="${m.id}" data-reaction="${esc(r)}">${esc(r)} ${n}</button>`).join("");
  return `<div class="bubble ${mine?"me":""} ${deleted?"deleted":""}" data-mid="${m.id}">
   ${!mine&&currentChat.type==="group"?`<div class="sender">${esc(m.profiles?.full_name||"User")}</div>`:""}
   ${m.reply_to?`<div class="reply-preview">Replying to a message</div>`:""}
   ${deleted?"Message deleted":attachment+(m.body?esc(m.body):"")}
   ${reacts?`<div>${reacts}</div>`:""}
   <small>${m.edited_at?"edited ":""}${time(m.created_at)} ${mine?(isRead(m.id)?"✓✓":"✓"):""}</small>
   ${!deleted?`<button class="msg-options" data-options="${m.id}" title="Options">⋮</button>`:""}
  </div>`
 }).join("");
 box.scrollTop=box.scrollHeight;
 box.querySelectorAll("[data-options]").forEach(b=>b.onclick=e=>messageMenu(e,b.dataset.options));
 box.querySelectorAll(".reaction").forEach(b=>b.onclick=()=>toggleReaction(b.dataset.mid,b.dataset.reaction));
}
function isRead(id){return messages.some(m=>m.id===id&&m.sender_id===currentUser.id&&m.message_reads?.length)}
function messageMenu(e,id){
 e.stopPropagation();document.querySelectorAll(".msg-menu").forEach(x=>x.remove());
 const m=messages.find(x=>x.id===id),menu=document.createElement("div");menu.className="msg-menu";
 const mine=m.sender_id===currentUser.id;
 menu.innerHTML=`<button data-reply>↩ Reply</button><button data-react>❤️ React</button>${mine&&!m.deleted_at?'<button data-edit>✎ Edit</button><button data-delete>🗑 Delete</button>':""}`;
 const bubble=e.target.closest(".bubble");bubble.appendChild(menu);
 menu.querySelector("[data-reply]").onclick=()=>setReply(m);
 menu.querySelector("[data-react]").onclick=()=>toggleReaction(m.id,"❤️");
 if(mine&&!m.deleted_at){menu.querySelector("[data-edit]").onclick=()=>editMessage(m);menu.querySelector("[data-delete]").onclick=()=>deleteMessage(m)}
}
function setReply(m){replyTo=m;$("replyBar").classList.remove("hidden");$("replyBar").innerHTML=`Replying to: ${esc(m.body||m.file_name||"attachment")} <button id="cancelReply">×</button>`;$("cancelReply").onclick=clearReply;$("messageInput").focus()}
function clearReply(){replyTo=null;$("replyBar").classList.add("hidden")}
async function editMessage(m){const v=prompt("Edit message:",m.body);if(v===null||!v.trim())return;const {error}=await supabase.from("messages").update({body:v.trim(),edited_at:new Date().toISOString()}).eq("id",m.id).eq("sender_id",currentUser.id);if(error)toast(error.message)}
async function deleteMessage(m){if(!confirm("Delete this message?"))return;const {error}=await supabase.from("messages").update({deleted_at:new Date().toISOString(),body:""}).eq("id",m.id).eq("sender_id",currentUser.id);if(error)toast(error.message)}
async function toggleReaction(id,reaction){
 const {data:existing}=await supabase.from("message_reactions").select("*").eq("message_id",id).eq("user_id",currentUser.id).eq("reaction",reaction).maybeSingle();
 if(existing)await supabase.from("message_reactions").delete().eq("message_id",id).eq("user_id",currentUser.id).eq("reaction",reaction);
 else await supabase.from("message_reactions").insert({message_id:id,user_id:currentUser.id,reaction});
 await loadMessages();
}
function subscribeChatRealtime(){
 if(messageChannel)supabase.removeChannel(messageChannel);
 messageChannel=supabase.channel("chat-"+currentChat.id)
 .on("postgres_changes",{event:"*",schema:"public",table:"messages",filter:`chat_id=eq.${currentChat.id}`},async()=>{await loadMessages();await loadChats()})
 .on("postgres_changes",{event:"*",schema:"public",table:"message_reactions"},async()=>loadMessages())
 .on("postgres_changes",{event:"*",schema:"public",table:"message_reads"},async()=>loadMessages())
 .on("broadcast",{event:"typing"},p=>{if(p.payload.user_id!==currentUser.id){$("typingBar").textContent=p.payload.typing?`${p.payload.name} is typing…`:""}})
 .on("presence",{event:"sync"},()=>updatePresence())
 .on("presence",{event:"join"},()=>updatePresence())
 .on("presence",{event:"leave"},()=>updatePresence())
 .subscribe();
}
async function enterPresence(){if(messageChannel)await messageChannel.track({user_id:currentUser.id,name:profile.full_name,online:true})}
async function updatePresence(){}
async function markRead(){if(!currentChat)return;await supabase.rpc("mark_chat_read",{target_chat:currentChat.id});currentChat.unread=0;renderChats(chats)}
$("messageInput").addEventListener("input",()=>{
 if(!messageChannel||!currentChat)return;
 messageChannel.send({type:"broadcast",event:"typing",payload:{user_id:currentUser.id,name:profile.full_name,typing:true}});
 clearTimeout(typingTimer);typingTimer=setTimeout(()=>messageChannel?.send({type:"broadcast",event:"typing",payload:{user_id:currentUser.id,typing:false}}),900);
});
async function sendMessage(body,file){
 if(!currentChat)return;
 let path=null,type="text",name=null,size=null,mime=null;
 if(file){
  if(file.size>20*1024*1024){toast("Maximum file size is 20 MB");return}
  type=file.type.startsWith("image/")?"image":"file";name=file.name;size=file.size;mime=file.type||"application/octet-stream";
  path=`${currentChat.id}/${currentUser.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\- ]/g,"_")}`;
  const {error}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:mime,upsert:false});
  if(error){toast(error.message);return}
 }
 const row={chat_id:currentChat.id,sender_id:currentUser.id,body:body?.trim()||"",message_type:type,file_path:path,file_name:name,file_size:size,mime_type:mime,reply_to:replyTo?.id||null};
 const {error}=await supabase.from("messages").insert(row);if(error){toast(error.message);return}clearReply();
}
$("messageForm").onsubmit=async e=>{e.preventDefault();const i=$("messageInput");const f=$("fileInput").files[0];const body=i.value;i.value="";$("fileInput").value="";await sendMessage(body,f)}
$("attachBtn").onclick=()=>$("fileInput").click();

async function openNewChat(){
 const {data,error}=await supabase.from("profiles").select("id,full_name,username,phone,avatar_url,is_online,last_seen").neq("id",currentUser.id).order("full_name");
 if(error){toast(error.message);return}
 $("modalContent").innerHTML=`<h2>New chat</h2><div class="form-stack"><input id="contactSearch" placeholder="Search people"><div id="contactList"></div></div>`;$("modal").showModal();
 const render=()=>{const q=$("contactSearch").value.toLowerCase();$("contactList").innerHTML=(data||[]).filter(p=>(p.full_name||"").toLowerCase().includes(q)||(p.username||"").toLowerCase().includes(q)||(p.phone||"").includes(q)).map(p=>`<div class="contact-row"><div class="avatar">${avatar(p)}</div><div class="grow"><strong>${esc(p.full_name)}</strong><div style="color:var(--muted);font-size:12px">@${esc(p.username||"user")} ${p.is_online?"• online":""}</div></div><button class="primary" data-user="${p.id}">Chat</button></div>`).join("")||"<p>No people found.</p>";$("contactList").querySelectorAll("[data-user]").forEach(b=>b.onclick=()=>createDirect(b.dataset.user))};
 $("contactSearch").oninput=render;render();
}
async function createDirect(id){const {data,error}=await supabase.rpc("create_direct_chat",{other_user_id:id});if(error){toast(error.message);return}$("modal").close();await loadChats();openChat(data)}
async function createGroup(){
 const {data,error}=await supabase.from("profiles").select("id,full_name").neq("id",currentUser.id).order("full_name");if(error){toast(error.message);return}
 $("modalContent").innerHTML=`<h2>Create group</h2><div class="form-stack"><input id="groupTitle" placeholder="Group name"><div id="groupPeople">${(data||[]).map(p=>`<label style="display:flex;align-items:center;gap:10px;padding:8px 0"><input type="checkbox" value="${p.id}" style="width:auto">${esc(p.full_name)}</label>`).join("")}</div><button id="createGroupSubmit" class="primary">Create group</button></div>`;$("modal").showModal();
 $("createGroupSubmit").onclick=async()=>{const title=$("groupTitle").value.trim(),ids=[...document.querySelectorAll("#groupPeople input:checked")].map(x=>x.value);const {data,error}=await supabase.rpc("create_group_chat",{group_title:title,member_ids:ids});if(error){toast(error.message);return}$("modal").close();await loadChats();openChat(data)}
}
async function profileModal(){
 $("modalContent").innerHTML=`<h2>Your profile</h2><div class="form-stack"><label>Full name<input id="pName" value="${esc(profile.full_name)}"></label><label>Username<input id="pUsername" value="${esc(profile.username||"")}"></label><label>Bio<textarea id="pBio">${esc(profile.bio||"")}</textarea></label><label>Avatar URL<input id="pAvatar" value="${esc(profile.avatar_url||"")}" placeholder="https://..."></label><button id="saveProfile" class="primary">Save profile</button></div>`;$("modal").showModal();
 $("saveProfile").onclick=async()=>{const {data,error}=await supabase.from("profiles").update({full_name:$("pName").value.trim(),username:$("pUsername").value.trim().toLowerCase()||null,bio:$("pBio").value.trim(),avatar_url:$("pAvatar").value.trim()||null}).eq("id",currentUser.id).select().single();if(error){toast(error.message);return}profile=data;$("modal").close();toast("Profile updated");startApp()}
}
async function notificationsModal(){
 const {data,error}=await supabase.from("notifications").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(100);if(error){toast(error.message);return}
 $("modalContent").innerHTML=`<h2>Notifications</h2><div>${(data||[]).map(n=>`<div class="notification ${n.is_read?"":"unread"}"><strong>${esc(n.title)}</strong><div>${esc(n.body)}</div><small>${dateTime(n.created_at)}</small></div>`).join("")||"<p>No notifications.</p>"}</div>`;$("modal").showModal();await supabase.from("notifications").update({is_read:true}).eq("user_id",currentUser.id)
}
async function loadNotifications(){const {count}=await supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",currentUser.id).eq("is_read",false);$("notifBadge").textContent=count||0;$("notifBadge").classList.toggle("hidden",!(count>0))}
async function chatInfo(){
 if(!currentChat)return;await loadMembers();
 $("modalContent").innerHTML=`<h2>${esc(currentChat.title||"Chat")}</h2><p style="color:var(--muted)">${currentChat.type==="group"?"Group members":"Direct conversation"}</p><div>${chatMembers.map(m=>`<div class="contact-row"><div class="avatar">${avatar(m.profiles)}</div><div class="grow"><strong>${esc(m.profiles?.full_name||"User")}</strong><div style="color:var(--muted);font-size:12px">${esc(m.role)} ${m.profiles?.is_online?"• online":""}</div></div></div>`).join("")}</div>`;
 $("modal").showModal();
}
$("modalClose").onclick=()=>$("modal").close();$("newChatBtn").onclick=openNewChat;$("groupBtn").onclick=createGroup;$("profileBtn").onclick=profileModal;$("notificationsBtn").onclick=notificationsModal;$("chatInfoBtn").onclick=chatInfo;
$("signOutBtn").onclick=async()=>{await setOnline(false);await supabase.auth.signOut()};
$("mobileBack").onclick=()=>{$("appView").classList.remove("chat-open");currentChat=null;$("messageForm").classList.add("hidden");if(messageChannel){supabase.removeChannel(messageChannel);messageChannel=null}}
$("searchInput").oninput=e=>{const q=e.target.value.toLowerCase();renderChats(chats.filter(c=>(c.title||"").toLowerCase().includes(q)))};

let authMode="signin";
let otpPhone=null;

function switchAuthMethod(method){
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.auth===method));
  $("emailForm").classList.toggle("hidden",method!=="email");
  $("phoneForm").classList.toggle("hidden",method!=="phone");
}
document.querySelectorAll(".mode-btn").forEach(btn=>btn.addEventListener("click",()=>{
  authMode=btn.dataset.mode; showAuthMode(authMode); switchAuthMethod("email");
}));

document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>switchAuthMethod(t.dataset.auth)));

$("emailForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!guardSupabase())return;
  const email=$("email").value.trim();
  const password=$("password").value;
  const button=$("emailSubmit");
  if(!email||!password){toast("Enter your email and password");return}
  if(authMode==="signup"){
    const name=$("signupName").value.trim()||"EasyChat User";
    const confirm=$("passwordConfirm").value;
    if(password.length<6){toast("Password must be at least 6 characters");return}
    if(password!==confirm){toast("Passwords do not match");return}
    setBusy(button,true);
    try{
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name}}});
      if(error) throw error;
      if(data.session){toast("Account created");}
      else{toast("Account created. Check your email to confirm it.");showAuthMode("signin");}
    }catch(e){toast(e.message||"Unable to create account")}
    finally{setBusy(button,false,"Create account")}
    return;
  }
  setBusy(button,true);
  try{
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error) throw error;
  }catch(e){toast(e.message||"Unable to sign in")}
  finally{setBusy(button,false,"Sign in")}
});

$("forgotPassword").addEventListener("click",async()=>{
  if(!guardSupabase())return;
  const email=$("email").value.trim();
  if(!email){toast("Enter your email first");$("email").focus();return}
  const button=$("forgotPassword");setBusy(button,true);
  try{
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:appOrigin()});
    if(error) throw error;
    toast("Password reset email sent.");
  }catch(e){toast(e.message||"Unable to send reset email")}
  finally{setBusy(button,false,"Forgot password?")}
});

$("sendOtp").addEventListener("click",async()=>{
  if(!guardSupabase())return;
  const phone=$("phone").value.trim();
  if(!phone){toast("Enter your phone number");$("phone").focus();return}
  const button=$("sendOtp");setBusy(button,true);
  try{
    const {error}=await supabase.auth.signInWithOtp({phone});
    if(error) throw error;
    otpPhone=phone;$("phoneStep").classList.add("hidden");$("otpStep").classList.remove("hidden");
    $("otp").focus();toast("Verification code sent");
  }catch(e){toast(e.message||"Unable to send code")}
  finally{setBusy(button,false,"Send code")}
});

$("verifyOtp").addEventListener("click",async()=>{
  if(!guardSupabase())return;
  if(!otpPhone){toast("Enter your phone number first");return}
  const token=$("otp").value.trim();
  if(!/^\d{6}$/.test(token)){toast("Enter the 6-digit verification code");return}
  const button=$("verifyOtp");setBusy(button,true);
  try{
    const {error}=await supabase.auth.verifyOtp({phone:otpPhone,token,type:"sms"});
    if(error) throw error;
  }catch(e){toast(e.message||"Invalid verification code")}
  finally{setBusy(button,false,"Verify code")}
});

$("backPhone").addEventListener("click",()=>{
  otpPhone=null;$("otp").value="";$("otpStep").classList.add("hidden");$("phoneStep").classList.remove("hidden");
});

showAuthMode("signin");
switchAuthMethod("email");

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
init();
