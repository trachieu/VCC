const cfg=window.APP_CONFIG;
const sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>(Number(n)||0).toLocaleString('vi-VN')+'đ';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
const ts=s=>s?new Date(s).toLocaleString('vi-VN'):'';
function notify(msg,error=false){let e=$('notice');if(!e){alert(msg);return}e.textContent=msg;e.className='status'+(error?' err':'');e.classList.remove('hidden');setTimeout(()=>e.classList.add('hidden'),6000)}
async function query(table){let {data,error}=await sb.from(table).select('*');if(error)throw error;return data||[]}
async function rpc(name,arg={}){let{data,error}=await sb.rpc(name,arg);if(error)throw error;return data}
function formatItems(items){return (items||[]).map(x=>`${x.name} (${x.size||'M'}) ×${x.qty} | đường ${x.sugar??100}% đá ${x.ice??100}%${x.toppings?.length?', '+x.toppings.join(', '):''}${x.note?', '+x.note:''}`).join('; ')}
function exportCsv(rows,filename){if(!rows.length)return notify('Chưa có dữ liệu');let cols=Object.keys(rows[0]);let body=[cols,...rows.map(o=>cols.map(k=>o[k]??''))].map(arr=>arr.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');let url=URL.createObjectURL(new Blob(['\ufeff'+body],{type:'text/csv;charset=utf-8'}));let a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}
const levels=[0,25,50,70,100];
function radioLevel(group,chosen=100){return levels.map(n=>`<label class="choice"><input type="radio" name="${group}" value="${n}" ${n===chosen?'checked':''}>${n}%</label>`).join('')}
