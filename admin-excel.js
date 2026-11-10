// Tạo Excel .xlsx độc lập, không cần CDN hoặc thay đổi Supabase.
(function(){
'use strict';
const encoder=new TextEncoder();
const xmlEscape=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
const bytes=s=>encoder.encode(s);
const u16=n=>[n&255,(n>>>8)&255];
const u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
const crcTable=Array.from({length:256},(_,i)=>{let v=i;for(let j=0;j<8;j++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0});
function crc32(arr){let c=0xffffffff;for(const b of arr)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function zip(entries){const local=[],central=[];let pos=0;
 for(const [name,content] of entries){const nb=bytes(name),data=bytes(content),crc=crc32(data),sz=data.length;
 const lh=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(sz),...u32(sz),...u16(nb.length),...u16(0)]);
 local.push(lh,nb,data);
 const ch=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(sz),...u32(sz),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(pos)]);
 central.push(ch,nb);pos+=lh.length+nb.length+data.length;
 }
 const cdSize=central.reduce((s,a)=>s+a.length,0),count=entries.length;
 return new Blob([...local,...central,new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(count),...u16(count),...u32(cdSize),...u32(pos),...u16(0)])],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function column(i){let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s}
function sheetXML(rows){const cols=rows[0]||[], end=column(Math.max(0,cols.length-1));const xmlRows=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>{const addr=column(j)+(i+1);if(typeof v==='number'&&Number.isFinite(v))return '<c r="'+addr+'"'+(i===0?' s="1"':'')+'><v>'+v+'</v></c>';return '<c r="'+addr+'" t="inlineStr"'+(i===0?' s="1"':'')+'><is><t xml:space="preserve">'+xmlEscape(v)+'</t></is></c>'}).join('')+'</row>').join('');
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+end+Math.max(1,rows.length)+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>'+cols.map((v,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.min(55,Math.max(16,String(v).length+7))+'" customWidth="1"/>').join('')+'</cols><sheetData>'+xmlRows+'</sheetData>'+(cols.length?'<autoFilter ref="A1:'+end+Math.max(1,rows.length)+'"/>':'')+'</worksheet>';
}
window.exportExcel=function(sheets,filename){
 try{
  const valid=sheets.filter(s=>s.rows&&s.rows.length);
  if(!valid.length)return notify('Chưa có dữ liệu để xuất');
  const files=[['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+valid.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+valid.map((s,i)=>'<sheet name="'+xmlEscape(s.name.slice(0,31))+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+valid.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(valid.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
  ['xl/styles.xml','<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176B46"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>']];
  valid.forEach((s,i)=>files.push(['xl/worksheets/sheet'+(i+1)+'.xml',sheetXML(s.rows)]));
  const url=URL.createObjectURL(zip(files));const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
 }catch(e){notify('Không xuất được Excel: '+e.message,true)}
};
})();
