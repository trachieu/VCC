let members=[],restaurants=[],menu=[],toppingOptions=[],round=null,person=null,restaurant=null,selectedItem=null,cart=[],myOrders=[];
let editingCartIndex=-1;
let editingOrderId=null;
let returnToCartAfterItemEdit=false;
let activeUser=null;
let allRounds=[];
function orderRound(o){return allRounds.find(r=>r.id===o.round_id)||null;}
async function init(){try{$('hintList').classList.add('hidden');let {data:{session}}=await sb.auth.getSession();if(!session){let r=await sb.auth.signInAnonymously();if(r.error)throw r.error;session=r.data.session}activeUser=session.user.id;await reload();}catch(e){notify('Không kết nối được: '+e.message,true)}}
async function reload(){[members,restaurants,menu,toppingOptions]=await Promise.all([query('members'),query('restaurants'),query('menu_items'),query('toppings')]);members=members.filter(x=>x.active);restaurants=restaurants.filter(x=>x.active);menu=menu.filter(x=>x.active);allRounds=await query('order_rounds');round=allRounds.filter(x=>x.status!=='archived').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]||null;renderNames();if(person){const latest=members.find(x=>x.id===person.id);if(!latest){resetToLogin();return}person=latest;const currentlyVisible=['restaurantsSection','menuSection','myOrdersSection'].find(id=>!$(id).classList.contains('hidden'));await showApp(currentlyVisible)}}
function renderNames(){
 let q=norm($('personSearch').value.trim());
 if(!q){$('hintList').innerHTML='';$('hintList').classList.add('hidden');return}
 let list=members.filter(x=>norm(x.name).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
 $('hintList').classList.remove('hidden');
 $('hintList').innerHTML=list.slice(0,70).map(x=>`<button data-id="${x.id}">${safe(x.name)}</button>`).join('')||'<p class="muted">Không tìm thấy tên</p>';
 document.querySelectorAll('#hintList button[data-id]').forEach(b=>b.onclick=()=>{person=members.find(x=>x.id===b.dataset.id);$('personSearch').value=person.name;$('selectedName').textContent='Đã chọn: '+person.name;$('goBtn').disabled=false;$('hintList').innerHTML='';$('hintList').classList.add('hidden')})
}
$('personSearch').oninput=()=>{person=null;$('goBtn').disabled=true;$('selectedName').textContent='Chưa chọn tên';renderNames()};
$('personSearch').onfocus=()=>{if($('personSearch').value.trim())renderNames()};
function resetToLogin(){person=null;restaurant=null;selectedItem=null;myOrders=[];cart=[];editingCartIndex=-1;editingOrderId=null;returnToCartAfterItemEdit=false;['itemModal','cartModal','payModal'].forEach(id=>$(id).classList.add('hidden'));$('payQr').removeAttribute('src');$('hello').textContent='';$('app').classList.add('hidden');$('sticky').classList.add('hidden');$('login').classList.remove('hidden');$('personSearch').value='';$('selectedName').textContent='Chưa chọn tên';$('goBtn').disabled=true;$('changePerson').classList.add('hidden');$('hintList').innerHTML='';$('hintList').classList.add('hidden');$('memberSidebar').classList.add('hidden');renderOrders();renderCart()}
$('goBtn').onclick=()=>showApp();$('changePerson').onclick=resetToLogin;
async function showApp(keepSection){if(!person)return; $('login').classList.add('hidden');$('app').classList.remove('hidden');$('sticky').classList.remove('hidden');$('changePerson').classList.remove('hidden');$('hello').textContent='Xin chào, '+person.name;$('welcome').textContent='Xin chào, '+person.name;$('roundInfo').textContent=round?(round.status==='open'?'Đang nhận đơn':'Đã khóa đơn'):'Chưa có đợt đặt món';renderRestaurants();await loadOrders();if(!person||$('app').classList.contains('hidden'))return;showSection(keepSection||'myOrdersSection');renderCart()}
function showSection(id){for(let s of ['restaurantsSection','menuSection','myOrdersSection'])$(s).classList.toggle('hidden',s!==id);$('memberSidebar').classList.toggle('hidden',id!=='myOrdersSection')}
function renderRestaurants(){$('restaurants').innerHTML=restaurants.length?restaurants.map(x=>`<div class="card"><h3>${safe(x.name)}</h3><button data-id="${x.id}">Xem menu</button></div>`).join(''):'<p>Chưa có quán. Quản trị cần thêm quán.</p>';document.querySelectorAll('#restaurants button').forEach(b=>b.onclick=()=>{const nextRestaurant=restaurants.find(r=>r.id===b.dataset.id);
 if(!nextRestaurant)return;
 if(cart.length&&restaurant&&restaurant.id!==nextRestaurant.id){
  if(!confirm('Giỏ hàng còn món của quán trước. Xóa giỏ để đổi quán?'))return;
  cart=[];renderCart();
 }
 restaurant=nextRestaurant;selectedCategory='Tất cả';$('searchMenu').value='';$('restTitle').textContent=restaurant.name;renderMenu();showSection('menuSection')})}
let selectedCategory='Tất cả';
function renderMenu(){
 const q=norm($('searchMenu').value),items=menu.filter(x=>x.restaurant_id===restaurant?.id);
 const categories=[...new Set(items.map(x=>x.category||'Khác'))];
 if(selectedCategory!=='Tất cả'&&!categories.includes(selectedCategory))selectedCategory='Tất cả';
 $('menuCategories').innerHTML=['Tất cả',...categories].map(c=>`<button class="${c===selectedCategory?'':'secondary'} mini" data-category="${safe(c)}">${safe(c)}</button>`).join('');
 document.querySelectorAll('#menuCategories button').forEach(b=>b.onclick=()=>{selectedCategory=b.dataset.category;renderMenu()});
 $('menuList').innerHTML=items.filter(x=>(selectedCategory==='Tất cả'||(x.category||'Khác')===selectedCategory)&&norm(x.name).includes(q)).map(x=>`<div class="card"><strong>${safe(x.name)}</strong><p class="muted">${safe(x.category)} · M ${money(x.price_m)} ${x.price_l!=null?' · L '+money(x.price_l):''}</p><button data-id="${x.id}" ${round?.status!=='open'?'disabled':''}>Chọn món</button></div>`).join('')||'<p>Chưa có món.</p>';
 document.querySelectorAll('#menuList button[data-id]').forEach(b=>b.onclick=()=>openItem(menu.find(i=>i.id===b.dataset.id)));
}
$('searchMenu').oninput=renderMenu;
function openItem(x,existing=null,editIndex=-1){
 selectedItem=x;editingCartIndex=editIndex;
 $('itemModal').classList.remove('hidden');
 $('modalName').textContent=editIndex>=0?'Sửa món đã chọn: '+x.name:x.name;
 $('sizes').innerHTML=`<label class="choice"><input type="radio" name="size" value="M">M · ${money(x.price_m)}</label>`+(x.price_l==null?'':`<label class="choice"><input type="radio" name="size" value="L">L · ${money(x.price_l)}</label>`);
 $('sugars').innerHTML=radioLevel('sugar');
 $('ices').innerHTML=radioLevel('ice');
 $('toppings').innerHTML=toppingOptions.filter(t=>t.active&&t.restaurant_id===restaurant?.id).map(t=>`<label class="choice"><input type="checkbox" name="topping" value="${safe(t.name)}">${safe(t.name)} (+${money(t.price)})</label>`).join('')||'<p class="muted">Không có topping</p>';
 const line=existing||{size:'M',sugar:0,ice:0,toppings:[],qty:1,note:''};
 const sizeEl=document.querySelector(`[name=size][value="${line.size}"]`)||document.querySelector('[name=size][value="M"]');
 if(sizeEl)sizeEl.checked=true;
 const sugarEl=document.querySelector(`[name=sugar][value="${line.sugar}"]`);if(sugarEl)sugarEl.checked=true;
 const iceEl=document.querySelector(`[name=ice][value="${line.ice}"]`);if(iceEl)iceEl.checked=true;
 document.querySelectorAll('[name=topping]').forEach(el=>{el.checked=(line.toppings||[]).includes(el.value)});
 $('qty').value=line.qty||1;
 $('note').value=line.note||'';
 $('addToCart').textContent=editingOrderId?'Lưu thay đổi lên hệ thống':(editIndex>=0?'Lưu thay đổi món':'Thêm vào giỏ');
 $('itemModal').querySelectorAll('input').forEach(e=>e.addEventListener('change',calcLine));
 calcLine();
}
function getLine(){let size=document.querySelector('[name=size]:checked')?.value||'M',toppings=[...document.querySelectorAll('[name=topping]:checked')].map(x=>x.value),qty=Math.max(1,Math.min(30,Number($('qty').value)||1));return {menu_id:selectedItem.id,name:selectedItem.name,size,qty,sugar:Number(document.querySelector('[name=sugar]:checked')?.value||0),ice:Number(document.querySelector('[name=ice]:checked')?.value||0),toppings,note:$('note').value.trim().slice(0,160),unit:(size==='L'?selectedItem.price_l:selectedItem.price_m)+toppings.reduce((s,t)=>s+(toppingOptions.find(x=>x.name===t&&x.restaurant_id===restaurant?.id&&x.active)?.price||0),0)}}
function calcLine(){let x=getLine();$('lineTotal').textContent=money(x.unit*x.qty)}
$('itemModal').addEventListener('input',e=>{if(e.target.id==='qty')calcLine()});
function closeItemEditor(){
 $('itemModal').classList.add('hidden');editingCartIndex=-1;
 if(returnToCartAfterItemEdit){returnToCartAfterItemEdit=false;renderCart();$('cartModal').classList.remove('hidden')}
}
$('closeModal').onclick=closeItemEditor;
$('addToCart').onclick=async()=>{
 const line=getLine();
 const oldIndex=editingCartIndex;
 const previousCart=cart.slice();
 const nextCart=cart.slice();
 if(oldIndex>=0&&oldIndex<nextCart.length)nextCart[oldIndex]=line;
 else nextCart.push(line);
 if(editingOrderId){
  // Đang sửa đơn đã đặt: lưu lên Supabase NGAY tại nút này.
  // Giữ nguyên cửa sổ và dữ liệu nếu RPC báo lỗi.
  const button=$('addToCart');
  button.disabled=true;button.textContent='Đang lưu lên hệ thống…';
  try{
   if(!person?.id)throw Error('Vui lòng chọn lại tên nhân viên');
   if(!restaurant||nextCart.some(x=>!menu.some(m=>m.id===x.menu_id&&m.restaurant_id===restaurant.id)))throw Error('Món không thuộc quán của đơn');
   const items=nextCart.map(({menu_id,size,qty,sugar,ice,toppings,note})=>({menu_id,size,qty,sugar,ice,toppings,note}));
   const {data,error}=await sb.rpc('edit_member_order',{p_order:editingOrderId,p_member:person.id,p_items:items});
   if(error)throw error;
   if(data!==true)throw Error('Máy chủ từ chối sửa đơn. Kiểm tra đợt, thanh toán và phiên đã đặt đơn.');
   cart=[];editingOrderId=null;editingCartIndex=-1;returnToCartAfterItemEdit=false;
   $('placeOrder').textContent='Xác nhận đặt hàng';
   $('itemModal').classList.add('hidden');$('cartModal').classList.add('hidden');
   renderCart();
   try{await loadOrders();showSection('myOrdersSection')}catch(refreshError){notify('Đã lưu nhưng chưa tải lại lịch sử: '+refreshError.message,true)}
   notify('Đã lưu sửa đơn lên hệ thống thành công');
  }catch(e){
   cart=previousCart;
   notify('Không lưu được đơn: '+e.message,true);
   alert('Không lưu được đơn: '+e.message);
   // Không đóng modal để nhân viên có thể thử lại.
  }finally{button.disabled=false;button.textContent='Lưu thay đổi';}
  return;
 }
 cart=nextCart;renderCart();
 notify(oldIndex>=0?'Đã cập nhật món trong giỏ':'Đã thêm vào giỏ');
 closeItemEditor();
};
function cartSum(){return cart.reduce((s,x)=>s+x.unit*x.qty,0)}
function renderCart(){
 $('cartCount').textContent=cart.reduce((s,x)=>s+x.qty,0)+' món';
 $('cartTotal').textContent=money(cartSum());
 $('sumCart').textContent='Tổng: '+money(cartSum());
 $('cartLines').innerHTML=cart.map((x,i)=>`<div class="item"><div class="row spread"><div><strong>${safe(x.name)} (${x.size}) ×${x.qty}</strong><div class="muted">Đường ${x.sugar}% · Đá ${x.ice}% · ${safe(x.toppings.join(', '))}</div><div>${money(x.unit*x.qty)}</div></div><div class="row"><button class="secondary mini" data-edit-cart="${i}">Sửa</button><button class="danger mini" data-remove-cart="${i}">Xóa</button></div></div></div>`).join('')||'<p>Giỏ hàng trống</p>';
 document.querySelectorAll('#cartLines button[data-edit-cart]').forEach(b=>b.onclick=()=>{
  const i=Number(b.dataset.editCart),line=cart[i],item=menu.find(m=>m.id===line?.menu_id);
  if(!line||!item)return notify('Món này không còn trong menu hiện tại.',true);
  $('cartModal').classList.add('hidden');
  returnToCartAfterItemEdit=true;openItem(item,line,i);
 });
 document.querySelectorAll('#cartLines button[data-remove-cart]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.removeCart),1);renderCart()});
}
$('openCart').onclick=()=>{$('cartModal').classList.remove('hidden');renderCart()};
$('closeCart').onclick=()=>{if(editingOrderId&&!confirm('Các thay đổi chưa lưu lên hệ thống. Đóng giỏ hàng?'))return;$('cartModal').classList.add('hidden')};
async function submitOrder(){
 if(!cart.length){notify('Giỏ hàng trống',true);return false;}
 if(!restaurant||cart.some(x=>!menu.some(m=>m.id===x.menu_id&&m.restaurant_id===restaurant.id))){notify('Giỏ hàng chứa món của quán khác. Vui lòng chọn lại.',true);return false;}
 if(!editingOrderId&&round?.status!=='open'){notify('Đợt đặt món hiện không mở',true);return false;}
 $('placeOrder').disabled=true;
 try{
  const items=cart.map(({menu_id,size,qty,sugar,ice,toppings,note})=>({menu_id,size,qty,sugar,ice,toppings,note}));
  if(editingOrderId){
   const {data,error}=await sb.rpc('edit_member_order',{p_order:editingOrderId,p_member:person.id,p_items:items});
   if(error)throw error;
   if(data!==true)throw Error('Không thể sửa đơn: đơn đã thanh toán, đợt đã khóa hoặc phiên đặt đơn không còn hợp lệ.');
   // RPC trả true sau khi UPDATE thành công. Không bắt buộc SELECT trực tiếp
   // từ orders vì RLS có thể không cho đọc bản ghi qua trình duyệt.
   notify('Đã lưu thay đổi vào đơn hàng thành công');
  }else{
   await rpc('place_order',{p_round:round.id,p_member:person.id,p_restaurant:restaurant.id,p_items:items});
   notify('Đặt hàng thành công');
  }
  cart=[];editingOrderId=null;$('placeOrder').textContent='Xác nhận đặt hàng';renderCart();$('cartModal').classList.add('hidden');$('itemModal').classList.add('hidden');returnToCartAfterItemEdit=false;editingCartIndex=-1;await loadOrders();showSection('myOrdersSection');return true;
 }catch(e){notify((editingOrderId?'Không sửa được đơn: ':'Không đặt được đơn: ')+e.message,true);return false}
 finally{$('placeOrder').disabled=false}
}
$('placeOrder').onclick=submitOrder;
// Lịch sử gắn với mã nhân viên, không gắn với điện thoại / phiên ẩn danh.
// RPC có kiểm tra quyền Supabase và trả về các đơn theo p_member.
async function loadOrders(){
 if(!person){myOrders=[];renderOrders();return}
 const selectedId=person.id;
 const {data,error}=await sb.rpc('member_order_history',{p_member:selectedId});
 if(!person||person.id!==selectedId)return;
 if(error){myOrders=[];renderOrders();notify('Không đọc được lịch sử: '+error.message,true);return}
 myOrders=(data||[]).filter(o=>o.member_id===selectedId);
 renderOrders();
}
// VietQR Quick Link: số tiền lấy từ bản ghi do Supabase tính, mỗi đơn có mã tham chiếu riêng.
const PAY_BANK='970432',PAY_ACCOUNT='316666663',PAY_NAME='CU THANH TUNG';
function paymentNote(o){const owner=members.find(m=>m.id===o.member_id);return ((owner?.name || person?.name || 'Nhan vien').trim()+' chuyen khoan').slice(0,100)}
function showPayment(o){
 if(o.paid)return notify('Đơn này đã được xác nhận thanh toán');
 const amount=Number(o.total);
 if(!Number.isInteger(amount)||amount<=0)return notify('Số tiền đơn không hợp lệ',true);
 const note=paymentNote(o);
 const url=`https://img.vietqr.io/image/${PAY_BANK}-${PAY_ACCOUNT}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(note)}&accountName=${encodeURIComponent(PAY_NAME)}`;
 $('payAmount').textContent=money(amount);
 $('payNote').textContent=note;
 $('payQr').src=url;
 $('payQrLink').href=url;
 $('qrIssue').textContent='';
 $('payModal').classList.remove('hidden');
}
$('payQr').onerror=()=>{$('qrIssue').textContent='Không tải được ảnh QR. Bạn có thể dùng thông tin chuyển khoản bên dưới.'};
$('closePay').onclick=()=>$('payModal').classList.add('hidden');
$('copyPayNote').onclick=async()=>{try{await navigator.clipboard.writeText($('payNote').textContent);notify('Đã sao chép nội dung chuyển khoản')}catch(e){notify('Hãy sao chép nội dung thủ công',true)}};
function renderOrders(){
 if(!person){$('ordersList').innerHTML='<p>Chưa chọn nhân viên.</p>';return}
 const mine=myOrders.filter(o=>o.member_id===person.id);
 const current=mine.filter(o=>o.round_id===round?.id);
 const previous=mine.filter(o=>o.round_id!==round?.id);
 function orderHtml(o,isCurrent){
  // Chỉ sửa đơn chưa thanh toán thuộc đợt hiện tại khi Admin đang mở đơn.
  const canEdit=!o.paid&&isCurrent&&round?.status==='open';
  const canCancel=!o.paid&&isCurrent&&round?.status==='open';
  return `<div class="item"><div class="row spread"><strong>${ts(o.created_at)} · ${money(o.total)}</strong><span class="pill">${o.paid?'✅ Đã thanh toán':'Chưa thanh toán'}</span></div><p>${safe(formatItems(o.items))}</p><div class="row">${!o.paid?`<button class="mini" data-pay="${o.id}">💳 Thanh toán</button>`:''}${canEdit?`<button class="secondary mini" data-edit-order="${o.id}">✏️ Sửa đơn</button>`:''}${canCancel?`<button class="danger mini" data-cancel="${o.id}">Hủy đơn</button>`:''}</div></div>`;
 }
 updateMemberStats(mine,current);
 $('ordersList').innerHTML='<h3>Đợt hiện tại</h3>'+(current.map(o=>orderHtml(o,true)).join('')||'<p>Chưa có đơn.</p>')+
   '<h3 style="margin-top:22px">Lịch sử các đợt trước</h3>'+(previous.map(o=>orderHtml(o,false)).join('')||'<p>Chưa có lịch sử.</p>');
 document.querySelectorAll('#ordersList button[data-pay]').forEach(b=>b.onclick=()=>{
  const o=myOrders.find(x=>x.id===b.dataset.pay&&x.member_id===person?.id);
  if(o)showPayment(o);
 });
 document.querySelectorAll('#ordersList button[data-edit-order]').forEach(b=>b.onclick=()=>{
  const o=myOrders.find(x=>x.id===b.dataset.editOrder&&x.member_id===person?.id&&!x.paid);
  if(!o)return notify('Không tìm thấy đơn chưa thanh toán.',true);
  if(o.round_id!==round?.id||round?.status!=='open')return notify('Đợt đã khóa, không thể sửa đơn.',true);
  if(cart.length&&!confirm('Giỏ hàng hiện tại sẽ được thay bằng các món của đơn này. Tiếp tục?'))return;
  const rest=restaurants.find(r=>r.id===o.restaurant_id);
  if(!rest)return notify('Quán của đơn này không còn hoạt động.',true);
  let lines;try{lines=(Array.isArray(o.items)?o.items:[]).map(line=>{
   const item=menu.find(m=>m.id===line.menu_id&&m.restaurant_id===rest.id);
   if(!item)throw Error('Một món trong đơn không còn bán.');
   return {menu_id:line.menu_id,name:item.name,size:line.size,qty:Number(line.qty)||1,sugar:Number(line.sugar)||0,ice:Number(line.ice)||0,toppings:Array.isArray(line.toppings)?line.toppings:[],note:line.note||'',unit:(line.size==='L'?item.price_l:item.price_m)+((Array.isArray(line.toppings)?line.toppings:[]).reduce((sum,t)=>sum+(toppingOptions.find(x=>x.name===t&&x.restaurant_id===rest.id&&x.active)?.price||0),0))};
  });
  }catch(e){return notify(e.message,true)}
  restaurant=rest;cart=lines;editingOrderId=o.id;editingCartIndex=-1;$('placeOrder').textContent='💾 Lưu sửa đơn';renderCart();$('cartModal').classList.remove('hidden');
 });
 document.querySelectorAll('#ordersList button[data-cancel]').forEach(b=>b.onclick=async()=>{
  const selectedId=person?.id;
  const o=myOrders.find(x=>x.id===b.dataset.cancel&&x.member_id===selectedId&&x.round_id===round?.id&&!x.paid);
  if(!o||round?.status!=='open')return notify('Không thể hủy đơn này.',true);
  if(!confirm('Hủy đơn này?'))return;
  b.disabled=true;
  try{
   const {data,error}=await sb.rpc('cancel_member_order',{p_order:o.id,p_member:selectedId});
   if(error)throw error;
   if(data!==true)throw Error('Đơn đã khóa, đã thanh toán hoặc không thuộc tên đang chọn.');
   notify('Đã hủy đơn');await loadOrders();
  }catch(e){notify('Không hủy được: '+e.message,true);await loadOrders()}
  finally{b.disabled=false}
 });
}
$('tabRestaurants').onclick=()=>showSection('restaurantsSection');$('tabOrders').onclick=async()=>{await loadOrders();showSection('myOrdersSection')};$('backRestaurants').onclick=()=>showSection('restaurantsSection');
sb.channel('member-rounds').on('postgres_changes',{event:'*',schema:'public',table:'order_rounds'},async()=>{await reload();}).subscribe();init();

function updateMemberStats(mine,current){
  // Hiển thị thống kê tất cả đợt: đóng đợt không đồng nghĩa đã thanh toán.
  const items=mine.flatMap(o=>Array.isArray(o.items)?o.items:[]);
  $('statQty').textContent=items.reduce((s,x)=>s+(Number(x.qty)||0),0);
  $('statTotal').textContent=money(mine.reduce((s,o)=>s+(Number(o.total)||0),0));
  $('statUnpaid').textContent=money(mine.filter(o=>!o.paid).reduce((s,o)=>s+(Number(o.total)||0),0));
  $('sidebarRoundStatus').textContent=round?(round.status==='open'?'Đang nhận đơn':'Đã khóa đơn'):'Chưa có đợt';
}
