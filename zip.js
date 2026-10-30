const encoder = new TextEncoder();
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n=0;n<256;n++) { let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); table[n]=c>>>0; }
  return table;
})();
function crc32(bytes) { let c=0xffffffff; for(const b of bytes)c=CRC_TABLE[(c^b)&0xff]^(c>>>8); return (c^0xffffffff)>>>0; }
function u16(v){const a=new Uint8Array(2);new DataView(a.buffer).setUint16(0,v,true);return a;}
function u32(v){const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,v>>>0,true);return a;}
function join(parts){const size=parts.reduce((n,p)=>n+p.length,0);const out=new Uint8Array(size);let off=0;for(const p of parts){out.set(p,off);off+=p.length;}return out;}
function dosDateTime(date=new Date()) { const time=((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|((Math.floor(date.getSeconds()/2))&31); const day=((date.getFullYear()-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate(); return {time,day}; }

export async function createZip(files) {
  const localParts=[],centralParts=[]; let offset=0; const stamp=dosDateTime();
  for(const file of files){
    const name=encoder.encode(file.name.replace(/\\/g,'/'));
    const data=new Uint8Array(await file.blob.arrayBuffer());
    const crc=crc32(data);
    const local=join([u32(0x04034b50),u16(20),u16(0),u16(0),u16(stamp.time),u16(stamp.day),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    localParts.push(local);
    const central=join([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(stamp.time),u16(stamp.day),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    centralParts.push(central); offset+=local.length;
  }
  const central=join(centralParts);
  const end=join([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(central.length),u32(offset),u16(0)]);
  return new Blob([...localParts,central,end],{type:'application/zip'});
}
