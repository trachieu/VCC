let members=[],restaurants=[],menu=[],toppingOptions=[],rounds=[],orders=[],current=null,history=[];const onlyAdmin='Bạn không có quyền quản trị.';
async function checkAdmin(){let {data:{user}}=await sb.auth.getUser();if(!user||user.is_anonymous)return false;let {data,error}=await sb.from('profiles').select('role,active').eq('id',user.id).single();return !error&&data?.role==='admin'&&data.active}
async function start(){try{if(await checkAdmin()){showDashboard()}else{await sb.auth.signOut();$('login').classList.remove('hidden')}}catch(e){notify(e.message,true)}}
async function showDashboard(){$('login').classList.add('hidden');$('dashboard').classList.remove('hidden');$('logout').classList.remove('hidden');await reloadAdmin()}
$('signIn').onclick=async()=>{let email=$('email').value.trim(),password=$('password').value;if(!email||!password)return notify('Nhập email và mật khẩu',true);$('signIn').disabled=true;try{let {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;if(!await checkAdmin())throw Error(onlyAdmin);await showDashboard()}catch(e){await sb.auth.signOut();notify(e.message,true)}finally{$('signIn').disabled=false}};
$('logout').onclick=async()=>{await sb.auth.signOut();location.reload()};
async function reloadAdmin(){try{[members,restaurants,menu,toppingOptions,rounds,orders]=await Promise.all(['members','restaurants','menu_items','toppings','order_rounds','orders'].map(query));rounds.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));current=rounds.find(x=>x.status!=='archived')||null;history=rounds.filter(x=>x.status==='archived');renderAdmin()}catch(e){notify(e.message,true)}}
function renderAdmin(){$('roundState').textContent=current?`${current.name} · ${current.status==='open'?'Đang mở':'Đã khóa'}`:'Chưa có đợt hiện tại';$('toggleLock').disabled=!current; $('toggleLock').textContent=!current?'Chưa có đợt':current.status==='open'?'🔒 Khóa đơn':'🔓 Mở khóa';$('toggleLock').className=current?.status==='open'?'danger':'secondary';$('roundState').className='pill '+(current?.status==='open'?'state-open':current?.status==='locked'?'state-locked':'state-none');$('archiveRound').disabled=!current;let live=orders.filter(x=>x.round_id===current?.id),people=new Set(live.map(x=>x.member_id));let paid=live.filter(x=>x.paid).reduce((a,x)=>a+x.total,0),total=live.reduce((a,x)=>a+x.total,0);$('stats').innerHTML=[['Người đặt',people.size],['Số đơn',live.length],['Số món',live.reduce((a,x)=>a+(x.items||[]).reduce((b,y)=>b+y.qty,0),0)],['Tổng tiền',money(total)],['Đã thu',money(paid)],['Chưa thu',money(total-paid)]].map(([a,b])=>`<div class="card"><div class="muted">${a}</div><div class="summary">${b}</div></div>`).join('');
$('orderRows').innerHTML=live.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(x=>`<tr><td>${safe(members.find(m=>m.id===x.member_id)?.name||'Đã xóa')}</td><td>${safe(restaurants.find(r=>r.id===x.restaurant_id)?.name||'Quán')}<div class="muted">${safe(formatItems(x.items))}</div></td><td>${money(x.total)}</td><td><label><input type="checkbox" data-pay="${x.id}" ${x.paid?'checked':''}> Đã thanh toán</label></td><td>${ts(x.created_at)}</td></tr>`).join('')||'<tr><td colspan="5">Chưa có đơn</td></tr>';document.querySelectorAll('[data-pay]').forEach(e=>e.onchange=async()=>{let{error}=await sb.from('orders').update({paid:e.checked}).eq('id',e.dataset.pay);if(error)notify(error.message,true);await reloadAdmin()});
$('memberList').innerHTML=members.filter(x=>x.active).sort((a,b)=>a.name.localeCompare(b.name,'vi')).map(x=>`<div class="item row spread"><span>${safe(x.name)}</span><span><button class="secondary mini" data-edit-member="${x.id}">Sửa</button> <button class="danger mini" data-remove-member="${x.id}">Xóa</button></span></div>`).join('');
$('restaurantList').innerHTML=restaurants.filter(x=>x.active).map(x=>`<div class="item row spread"><span>${safe(x.name)}</span><span><button class="secondary mini" data-edit-rest="${x.id}">Sửa</button> <button class="danger mini" data-remove-rest="${x.id}">Xóa</button></span></div>`).join('');
$('menuRestaurant').innerHTML=restaurants.filter(x=>x.active).map(x=>`<option value="${x.id}">${safe(x.name)}</option>`).join('');renderAdminMenu();$('toppingRestaurant').innerHTML=restaurants.filter(x=>x.active).map(x=>`<option value="${x.id}">${safe(x.name)}</option>`).join('');renderToppings();
$('archiveList').innerHTML=history.map(r=>`<div class="item">${safe(r.name)} · ${ts(r.archived_at)} · ${orders.filter(o=>o.round_id===r.id).length} đơn · ${money(orders.filter(o=>o.round_id===r.id).reduce((s,o)=>s+o.total,0))}</div>`).join('')||'<p class="muted">Chưa có lịch sử</p>';bindAdminButtons()}
function renderAdminMenu(){let id=$('menuRestaurant').value;$('menuAdminList').innerHTML=menu.filter(x=>x.restaurant_id===id&&x.active).map(x=>`<div class="item row spread"><span>${safe(x.name)} (${safe(x.category)}) · M ${money(x.price_m)}${x.price_l!=null?' · L '+money(x.price_l):''}</span><span><button class="secondary mini" data-edit-menu="${x.id}">Sửa</button> <button class="danger mini" data-remove-menu="${x.id}">Xóa</button></span></div>`).join('')};$('menuRestaurant').onchange=renderAdminMenu;
function bindAdminButtons(){for(let table of [['member','members'],['rest','restaurants'],['menu','menu_items']]){let [short,name]=table;document.querySelectorAll(`[data-remove-${short}]`).forEach(b=>b.onclick=()=>change(name,b.dataset['remove'+short[0].toUpperCase()+short.slice(1)],{active:false},'Xóa khỏi danh sách?'));document.querySelectorAll(`[data-edit-${short}]`).forEach(b=>b.onclick=async()=>{let id=b.dataset['edit'+short[0].toUpperCase()+short.slice(1)],obj=({members,restaurants,menu_items:menu})[name].find(x=>x.id===id);if(!obj)return;let patch={};if(short==='menu'){let n=prompt('Tên món',obj.name);if(n===null)return;let p=prompt('Giá M (đ)',obj.price_m);if(p===null)return;let l=prompt('Giá L (để trống nếu không có)',obj.price_l??'');if(l===null)return;patch={name:n.trim(),price_m:Number(p),price_l:l.trim()?Number(l):null};if(!n.trim()||!Number.isFinite(patch.price_m)||patch.price_m<0||patch.price_l!==null&&(!Number.isFinite(patch.price_l)||patch.price_l<0))return notify('Giá không hợp lệ',true)}else{let n=prompt('Tên mới',obj.name);if(!n?.trim())return;patch={name:n.trim()}}await change(name,id,patch)})}}
async function change(table,id,patch,message){if(message&&!confirm(message))return;try{let{error}=await sb.from(table).update(patch).eq('id',id);if(error)throw error;await reloadAdmin();notify('Đã cập nhật')}catch(e){notify(e.message,true)}}
async function add(table,record,clearIds=[]){try{let{error}=await sb.from(table).insert(record);if(error)throw error;clearIds.forEach(id=>$(id).value='');await reloadAdmin();notify('Đã thêm')}catch(e){notify(e.message,true)}}
// Nhập nhiều thành viên: mỗi dòng một tên, bỏ qua tên đã có (kể cả không dấu).
function memberKey(name){return norm(name).replace(/\s+/g,' ').trim()}
$('bulkAddMembers').onclick=async()=>{
 const button=$('bulkAddMembers'), box=$('bulkMemberNames'), result=$('bulkMemberResult');
 const names=box.value.split(/\r?\n/).map(x=>x.trim().replace(/\s+/g,' ')).filter(Boolean);
 if(!names.length)return notify('Hãy dán danh sách tên, mỗi người một dòng',true);
 const existing=new Set(members.filter(x=>x.active).map(x=>memberKey(x.name)));
 const inactiveByName=new Map(members.filter(x=>!x.active).map(x=>[memberKey(x.name),x]));
 const seen=new Set(),insert=[],reactivate=[];
 for(const name of names){const key=memberKey(name);if(!key||seen.has(key)||existing.has(key))continue;seen.add(key);if(inactiveByName.has(key))reactivate.push(inactiveByName.get(key));else insert.push({name})}
 const skipped=names.length-insert.length-reactivate.length;
 if(!insert.length&&!reactivate.length){result.textContent=`Đã bỏ qua ${skipped} tên có sẵn/trùng.`;return}
 button.disabled=true;result.textContent='Đang thêm...';
 let added=0,restored=0,errors=[];
 try{
  // Giới hạn mỗi đợt để danh sách dài không gây lỗi kích thước yêu cầu.
  for(let i=0;i<insert.length;i+=100){let chunk=insert.slice(i,i+100);let {error}=await sb.from('members').insert(chunk);if(error){errors.push(error.message);break}added+=chunk.length}
  for(const person of reactivate){let {error}=await sb.from('members').update({active:true}).eq('id',person.id);if(error){errors.push(error.message);break}restored++}
  await reloadAdmin();
  const remainder=[...insert.slice(added).map(x=>x.name),...reactivate.slice(restored).map(x=>x.name)];
  box.value=remainder.join('\n');
  result.textContent=`Đã thêm ${added}, khôi phục ${restored}, bỏ qua ${skipped}.`+(errors.length?' Có lỗi: '+errors.join('; '):'');
  notify(result.textContent,errors.length>0);
 }catch(e){notify(e.message,true)}finally{button.disabled=false}
};
$('addRestaurant').onclick=()=>{let n=$('restaurantName').value.trim();if(n)add('restaurants',{name:n},['restaurantName'])};


// Thêm món theo danh mục, mỗi dòng: Tên món | Giá M | Giá L.
$('addBulkMenu').onclick=async()=>{
 const input=$('bulkMenuText'),button=$('addBulkMenu'),result=$('bulkMenuResult');
 const restaurantId=$('menuRestaurant').value;
 if(!restaurantId)return notify('Chọn quán trước',true);
 const lines=input.value.split(/\r?\n/);let category='',items=[],problems=[];
 const normalizeName=x=>norm(x).replace(/\s+/g,' ').trim();
 const existing=new Set(menu.filter(x=>x.restaurant_id===restaurantId&&x.active).map(x=>normalizeName(x.name)));
 const seen=new Set();let skipped=0;
 for(let idx=0;idx<lines.length;idx++){
   const line=lines[idx].trim();if(!line)continue;
   const heading=line.match(/^\[(.+)\]$/);
   if(heading){category=heading[1].trim();if(!category)problems.push(`Dòng ${idx+1}: danh mục rỗng`);continue}
   const parts=line.split('|').map(x=>x.trim());
   if(!category||parts.length!==3||!parts[0]||!/^\d+$/.test(parts[1])||!/^\d+$/.test(parts[2])){problems.push(`Dòng ${idx+1}: ${line}`);continue}
   const m=Number(parts[1]),l=Number(parts[2]);
   if(!Number.isSafeInteger(m)||!Number.isSafeInteger(l)||m<0||l<0){problems.push(`Dòng ${idx+1}: giá không hợp lệ`);continue}
   const key=normalizeName(parts[0]);
   if(existing.has(key)||seen.has(key)){skipped++;continue}
   seen.add(key);items.push({restaurant_id:restaurantId,name:parts[0],category,price_m:m,price_l:l});
 }
 if(problems.length){result.textContent=`Có ${problems.length} dòng chưa đúng. Hãy sửa rồi thêm lại. ${problems.slice(0,3).join('; ')}`;return notify(result.textContent,true)}
 if(!items.length){result.textContent=`Không có món mới (${skipped} món đã có/trùng).`;return}
 button.disabled=true;let added=0;
 try{
   for(let i=0;i<items.length;i+=75){const chunk=items.slice(i,i+75);const {error}=await sb.from('menu_items').insert(chunk);if(error)throw error;added+=chunk.length}
   input.value='';await reloadAdmin();$('menuRestaurant').value=restaurantId;renderAdminMenu();
   result.textContent=`Đã thêm ${added} món, bỏ qua ${skipped} món trùng.`;notify(result.textContent);
 }catch(e){result.textContent=`Đã thêm ${added}/${items.length} món. ${e.message}`;notify(result.textContent,true)}finally{button.disabled=false}
};

function renderToppings(){const restaurantId=$('toppingRestaurant').value;$('toppingAdminList').innerHTML=toppingOptions.filter(t=>t.restaurant_id===restaurantId&&t.active).sort((a,b)=>a.name.localeCompare(b.name,'vi')).map(t=>`<div class="item row spread"><span>${safe(t.name)} · ${money(t.price)}</span><span><button class="secondary mini" data-edit-top="${t.id}">Sửa</button> <button class="danger mini" data-remove-top="${t.id}">Xóa</button></span></div>`).join('')||'<p class="muted">Quán chưa có topping.</p>';document.querySelectorAll('[data-edit-top]').forEach(b=>b.onclick=async()=>{const t=toppingOptions.find(x=>x.id===b.dataset.editTop);if(!t)return;const name=prompt('Tên topping',t.name);if(name===null)return;const price=prompt('Giá topping (đ)',t.price);if(price===null)return;if(!name.trim()||price.trim()===''||!Number.isSafeInteger(Number(price))||Number(price)<0)return notify('Thông tin topping không hợp lệ',true);await change('toppings',t.id,{name:name.trim(),price:Number(price)})});document.querySelectorAll('[data-remove-top]').forEach(b=>b.onclick=()=>change('toppings',b.dataset.removeTop,{active:false},'Xóa topping này khỏi menu?'))}
$('toppingRestaurant').onchange=renderToppings;
$('addTopping').onclick=()=>{const name=$('toppingName').value.trim(),price=$('toppingPrice').value,restaurant_id=$('toppingRestaurant').value;if(!restaurant_id||!name||price===''||!Number.isSafeInteger(Number(price))||Number(price)<0)return notify('Nhập tên và giá topping hợp lệ',true);add('toppings',{name,price:Number(price),restaurant_id},['toppingName','toppingPrice'])};

$('newRound').onclick=async()=>{if(current)return notify('Hãy kết thúc đợt hiện tại trước',true);let name=$('roundName').value.trim();if(name)await add('order_rounds',{name,status:'open'},['roundName'])};$('toggleLock').onclick=()=>current&&change('order_rounds',current.id,{status:current.status==='open'?'locked':'open'});$('archiveRound').onclick=()=>current&&change('order_rounds',current.id,{status:'archived'},'Kết thúc đợt này? Lịch sử sẽ không sửa được.');$('refreshOrders').onclick=reloadAdmin;
function rowsFor(arr){return arr.map(o=>({Nguoi_dat:members.find(m=>m.id===o.member_id)?.name||'',Quan:restaurants.find(r=>r.id===o.restaurant_id)?.name||'',Mon:formatItems(o.items),Tong_tien:o.total,Thanh_toan:o.paid?'Đã thanh toán':'Chưa thanh toán',Ngay_dat:ts(o.created_at),Dot:rounds.find(x=>x.id===o.round_id)?.name||''}))}
$('exportOrders').onclick=()=>exportCsv(rowsFor(orders.filter(o=>o.round_id===current?.id)),'don-hien-tai.csv');$('exportArchive').onclick=()=>exportCsv(rowsFor(orders.filter(o=>history.some(r=>r.id===o.round_id))),'lich-su.csv');
sb.channel('admin-orders').on('postgres_changes',{event:'*',schema:'public',table:'orders'},reloadAdmin).on('postgres_changes',{event:'*',schema:'public',table:'order_rounds'},reloadAdmin).subscribe();start();

// Chỉ đổi mật khẩu quản trị qua Supabase Auth.
$('changeAdminPassword').onclick=async()=>{
 const button=$('changeAdminPassword'),status=$('passwordChangeStatus');
 const current=$('adminCurrentPassword').value,pass=$('adminNewPassword').value,confirmPass=$('adminConfirmPassword').value;
 if(!current)return status.textContent='Nhập mật khẩu hiện tại.';
 if(!pass)return status.textContent='Nhập mật khẩu mới.';
 if(pass!==confirmPass)return status.textContent='Mật khẩu nhập lại không khớp.';
 if(current===pass)return status.textContent='Mật khẩu mới phải khác mật khẩu cũ.';
 try{
  if(!await checkAdmin())throw Error('Bạn cần đăng nhập quản trị.');
  button.disabled=true;status.textContent='Đang cập nhật...';
  // Thử xác minh mật khẩu cũ bằng tính năng current_password của Supabase Auth.
  const {error}=await sb.auth.updateUser({password:pass,current_password:current});if(error)throw error;
  status.textContent='Đổi mật khẩu thành công. Lần đăng nhập sau dùng mật khẩu mới.';
 }catch(e){status.textContent=e.message+' (Độ dài tối thiểu do Supabase quy định.)'}finally{
  $('adminCurrentPassword').value='';$('adminNewPassword').value='';$('adminConfirmPassword').value='';button.disabled=false;
 }
};
