let members=[],restaurants=[],menu=[],toppingOptions=[],round=null,person=null,restaurant=null,selectedItem=null,cart=[],myOrders=[];
let activeUser=null;
async function init(){try{let {data:{session}}=await sb.auth.getSession();if(!session){let r=await sb.auth.signInAnonymously();if(r.error)throw r.error;session=r.data.session}activeUser=session.user.id;await reload();}catch(e){notify('Không kết nối được: '+e.message,true)}}
async function reload(){[members,restaurants,menu,toppingOptions]=await Promise.all([query('members'),query('restaurants'),query('menu_items'),query('toppings')]);members=members.filter(x=>x.active);restaurants=restaurants.filter(x=>x.active);menu=menu.filter(x=>x.active);let rounds=await query('order_rounds');round=rounds.filter(x=>x.status!=='archived').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]||null;renderNames();if(person)await showApp()}
function renderNames(){let q=norm($('personSearch').value);let list=members.filter(x=>norm(x.name).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'vi'));$('hintList').innerHTML=list.slice(0,70).map(x=>`<button data-id="${x.id}">${safe(x.name)}</button>`).join('')||'<p class="muted">Không tìm thấy tên</p>';document.querySelectorAll('#hintList button[data-id]').forEach(b=>b.onclick=()=>{person=members.find(x=>x.id===b.dataset.id);$('personSearch').value=person.name;$('selectedName').textContent='Đã chọn: '+person.name;$('goBtn').disabled=false;$('hintList').innerHTML=''})}
$('personSearch').oninput=()=>{person=null;$('goBtn').disabled=true;$('selectedName').textContent='Chưa chọn tên';renderNames()};$('personSearch').onfocus=renderNames;
$('goBtn').onclick=showApp;$('changePerson').onclick=()=>{person=null;myOrders=[];cart=[];renderOrders();$('app').classList.add('hidden');$('sticky').classList.add('hidden');$('login').classList.remove('hidden');$('personSearch').value='';$('goBtn').disabled=true;renderNames()};
async function showApp(){if(!person)return; $('login').classList.add('hidden');$('app').classList.remove('hidden');$('sticky').classList.remove('hidden');$('hello').textContent='Xin chào, '+person.name;$('welcome').textContent='Xin chào, '+person.name;$('roundInfo').textContent=round?(round.status==='open'?'Đang nhận đơn':'Đã khóa đơn'):'Chưa có đợt đặt món';renderRestaurants();showSection('restaurantsSection');await loadOrders();renderCart()}
function showSection(id){for(let s of ['restaurantsSection','menuSection','myOrdersSection'])$(s).classList.toggle('hidden',s!==id)}
function renderRestaurants(){$('restaurants').innerHTML=restaurants.length?restaurants.map(x=>`<div class="card"><h3>${safe(x.name)}</h3><button data-id="${x.id}">Xem menu</button></div>`).join(''):'<p>Chưa có quán. Quản trị cần thêm quán.</p>';document.querySelectorAll('#restaurants button').forEach(b=>b.onclick=()=>{restaurant=restaurants.find(r=>r.id===b.dataset.id);selectedCategory='Tất cả';$('searchMenu').value='';$('restTitle').textContent=restaurant.name;renderMenu();showSection('menuSection')})}
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
function openItem(x){selectedItem=x;$('itemModal').classList.remove('hidden');$('modalName').textContent=x.name;$('sizes').innerHTML=`<label class="choice"><input type="radio" name="size" value="M" checked>M · ${money(x.price_m)}</label>`+(x.price_l==null?'':`<label class="choice"><input type="radio" name="size" value="L">L · ${money(x.price_l)}</label>`);$('sugars').innerHTML=radioLevel('sugar');$('ices').innerHTML=radioLevel('ice');$('toppings').innerHTML=toppingOptions.filter(t=>t.active&&t.restaurant_id===restaurant?.id).map(t=>`<label class="choice"><input type="checkbox" name="topping" value="${safe(t.name)}">${safe(t.name)} (+${money(t.price)})</label>`).join('')||'<p class="muted">Không có topping</p>';$('qty').value=1;$('note').value='';$('itemModal').querySelectorAll('input').forEach(e=>e.addEventListener('change',calcLine));calcLine()}
function getLine(){let size=document.querySelector('[name=size]:checked')?.value||'M',toppings=[...document.querySelectorAll('[name=topping]:checked')].map(x=>x.value),qty=Math.max(1,Math.min(30,Number($('qty').value)||1));return {menu_id:selectedItem.id,name:selectedItem.name,size,qty,sugar:Number(document.querySelector('[name=sugar]:checked')?.value||0),ice:Number(document.querySelector('[name=ice]:checked')?.value||0),toppings,note:$('note').value.trim().slice(0,160),unit:(size==='L'?selectedItem.price_l:selectedItem.price_m)+toppings.reduce((s,t)=>s+(toppingOptions.find(x=>x.name===t&&x.restaurant_id===restaurant?.id&&x.active)?.price||0),0)}}
function calcLine(){let x=getLine();$('lineTotal').textContent=money(x.unit*x.qty)}$('itemModal').addEventListener('input',e=>{if(e.target.id==='qty')calcLine()});$('closeModal').onclick=()=>$('itemModal').classList.add('hidden');$('addToCart').onclick=()=>{cart.push(getLine());$('itemModal').classList.add('hidden');renderCart();notify('Đã thêm vào giỏ')};
function cartSum(){return cart.reduce((s,x)=>s+x.unit*x.qty,0)}function renderCart(){$('cartCount').textContent=cart.reduce((s,x)=>s+x.qty,0)+' món';$('cartTotal').textContent=money(cartSum());$('sumCart').textContent='Tổng: '+money(cartSum());$('cartLines').innerHTML=cart.map((x,i)=>`<div class="item"><div class="row spread"><div><strong>${safe(x.name)} (${x.size}) ×${x.qty}</strong><div class="muted">Đường ${x.sugar}% · Đá ${x.ice}% · ${safe(x.toppings.join(', '))}</div><div>${money(x.unit*x.qty)}</div></div><button class="danger mini" data-i="${i}">Xóa</button></div></div>`).join('')||'<p>Giỏ hàng trống</p>';document.querySelectorAll('#cartLines button').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.i),1);renderCart()})}
$('openCart').onclick=()=>{$('cartModal').classList.remove('hidden');renderCart()};$('closeCart').onclick=()=>$('cartModal').classList.add('hidden');$('placeOrder').onclick=async()=>{if(!cart.length)return notify('Giỏ hàng trống',true);if(round?.status!=='open')return notify('Đợt đặt đã khóa',true);$('placeOrder').disabled=true;try{await rpc('place_order',{p_round:round.id,p_member:person.id,p_restaurant:restaurant.id,p_items:cart.map(({menu_id,size,qty,sugar,ice,toppings,note})=>({menu_id,size,qty,sugar,ice,toppings,note}))});cart=[];renderCart();$('cartModal').classList.add('hidden');notify('Đặt hàng thành công');await loadOrders(); showSection('myOrdersSection')}catch(e){notify(e.message,true)}finally{$('placeOrder').disabled=false}};
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
  const canCancel=isCurrent&&round?.status==='open'&&!o.paid;
  return `<div class="item"><div class="row spread"><strong>${ts(o.created_at)} · ${money(o.total)}</strong><span class="pill">${o.paid?'✅ Đã thanh toán':'Chưa thanh toán'}</span></div><p>${safe(formatItems(o.items))}</p><div class="row">${isCurrent&&!o.paid?`<button class="mini" data-pay="${o.id}">💳 Thanh toán</button>`:''}${canCancel?`<button class="danger mini" data-cancel="${o.id}">Hủy đơn</button>`:''}</div></div>`;
 }
 $('ordersList').innerHTML='<h3>Đợt hiện tại</h3>'+(current.map(o=>orderHtml(o,true)).join('')||'<p>Chưa có đơn.</p>')+
   '<h3 style="margin-top:22px">Lịch sử các đợt trước</h3>'+(previous.map(o=>orderHtml(o,false)).join('')||'<p>Chưa có lịch sử.</p>');
 document.querySelectorAll('#ordersList button[data-pay]').forEach(b=>b.onclick=()=>{
  const o=myOrders.find(x=>x.id===b.dataset.pay&&x.member_id===person?.id&&x.round_id===round?.id);
  if(o)showPayment(o);
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
