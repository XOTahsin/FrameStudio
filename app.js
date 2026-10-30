import { getAllTemplates, saveTemplate, deleteTemplate, clearTemplates, estimateStorage, exportTemplateData, importTemplateData } from './db.js';
import { renderTemplate } from './renderer.js';
import { createZip } from './zip.js';
import { detectFrameCorners } from './detector.js';

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const state = {
  templates: [],
  currentPage: 'dashboard',
  creator: { sceneBlob:null, sceneBitmap:null, sceneName:'', corners:[[.22,.20],[.78,.20],[.78,.80],[.22,.80]], reflectionBlob:null, frameOverlayBlob:null, editId:null, layout:null, dragIndex:-1 },
  artwork: null,
  artworkURL: null,
  selectedTemplates: new Set(),
  results: [],
  templateThumbURLs: [],
  previewURL: null,
  previewToken: 0,
};

function escapeHTML(value='') {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function bytesLabel(bytes) {
  if (!bytes) return '0 KB';
  const units=['B','KB','MB','GB']; let i=0,n=bytes;
  while(n>=1024 && i<units.length-1){n/=1024;i++;}
  return `${n.toFixed(i===0?0:1)} ${units[i]}`;
}
function dimsLabel(w,h){return `${Number(w).toLocaleString()} × ${Number(h).toLocaleString()} px`;}
function uid(){return crypto.randomUUID?crypto.randomUUID():`tpl_${Date.now()}_${Math.random().toString(16).slice(2)}`;}
function toast(message,type='success') {
  const item=document.createElement('div'); item.className=`toast ${type==='error'?'error':''}`;
  item.innerHTML=`<i data-icon="${type==='error'?'alert-circle':'circle-check'}"></i><span>${escapeHTML(message)}</span>`;
  $('#toastRegion').append(item); window.refreshIcons(item);
  setTimeout(()=>item.remove(),3600);
}

function navigate(page) {
  const known=['dashboard','templates','studio','create','help','settings'];
  if(!known.includes(page)) page='dashboard';
  state.currentPage=page;
  $$('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  const labels={dashboard:'Overview',templates:'Template library',studio:'Mockup studio',create:'Create template',help:'Quick guide',settings:'Settings'};
  $('#pageCrumb').textContent=labels[page];
  $('#sidebar').classList.remove('open');
  if(page==='templates') renderTemplateLibrary();
  if(page==='studio') { renderStudioTemplates(); updateGenerateButton(); schedulePreview(); }
  if(page==='create') drawCornerEditor();
  if(page==='settings') refreshStorage();
  window.scrollTo({top:0,behavior:'smooth'});
}

function objectURL(blob){return URL.createObjectURL(blob);}
function thumbURL(blob){const url=objectURL(blob);state.templateThumbURLs.push(url);return url;}
function clearThumbURLs(){for(const url of state.templateThumbURLs)URL.revokeObjectURL(url);state.templateThumbURLs=[];}
function clearResults(){for(const item of state.results){if(item.url)URL.revokeObjectURL(item.url);}state.results=[];}
function renderTemplateCard(template, compact=false) {
  const url=thumbURL(template.sceneBlob);
  const card=document.createElement('article'); card.className='template-card';
  card.innerHTML=`<div class="template-image"><img src="${url}" alt="${escapeHTML(template.name)} scenario preview" loading="lazy"><span class="category-tag">${escapeHTML(template.category||'Scenario')}</span></div><div class="template-card-body"><div class="template-card-title"><div><h3>${escapeHTML(template.name)}</h3><p>${escapeHTML(template.notes||'Reusable frame mockup scenario')}</p></div></div><div class="template-dimensions"><span><i data-icon="image"></i> ${dimsLabel(template.width,template.height)}</span><span><i data-icon="layers"></i> ${template.reflectionBlob?'Reflection ready':'No glass overlay'}</span></div><div class="template-card-actions"><button class="card-action" data-action="use" data-id="${template.id}"><i data-icon="aperture"></i> Use</button><button class="card-action" data-action="edit" data-id="${template.id}"><i data-icon="sliders-horizontal"></i> Edit</button><button class="card-action" data-action="export" data-id="${template.id}"><i data-icon="download"></i> Export</button><button class="card-action" data-action="delete" data-id="${template.id}"><i data-icon="trash-2"></i> Delete</button></div></div>`;
  window.refreshIcons(card);
  return card;
}

function renderDashboard() {
  clearThumbURLs();
  $('#statTemplates').textContent=state.templates.length;
  $('#templateCount').textContent=state.templates.length;
  $('#statExports').textContent=Number(localStorage.getItem('framestudio_exports')||0).toLocaleString();
  const dash=$('#dashboardTemplates'); dash.innerHTML='';
  if(!state.templates.length){
    dash.innerHTML=`<div class="empty-state compact"><div class="empty-icon"><i data-icon="layout-template"></i></div><h3>Your first scenario starts here</h3><p>Add a room scene, set the frame corners, and save it as a reusable template.</p><button class="btn btn-secondary btn-small" data-goto="create">Create first template</button></div>`;
  }else{
    state.templates.slice(0,3).forEach(t=>dash.append(renderTemplateCard(t,true)));
  }
  window.refreshIcons(dash);
  estimateStorage().then(({bytes})=>$('#statStorage').textContent=bytesLabel(bytes)).catch(()=>$('#statStorage').textContent='—');
}

function renderTemplateLibrary() {
  clearThumbURLs();
  const q=($('#templateSearch')?.value||'').trim().toLowerCase();
  const filtered=state.templates.filter(t=>`${t.name} ${t.category||''} ${t.notes||''}`.toLowerCase().includes(q));
  $('#templateResults').textContent=`${filtered.length} template${filtered.length===1?'':'s'}`;
  const grid=$('#templateGrid'); grid.innerHTML='';
  if(!filtered.length){
    grid.innerHTML=state.templates.length?`<div class="empty-state"><div class="empty-icon"><i data-icon="search"></i></div><h3>No matching templates</h3><p>Try another search term.</p></div>`:`<div class="empty-state"><div class="empty-icon"><i data-icon="images"></i></div><h3>No templates yet</h3><p>Create your first scenario template. You can also import a .framekit file shared from another workspace.</p><button class="btn btn-primary" data-goto="create">Create your first template</button></div>`;
  }else filtered.forEach(t=>grid.append(renderTemplateCard(t)));
  window.refreshIcons(grid);
}

function renderStudioTemplates() {
  clearThumbURLs();
  const grid=$('#studioTemplateGrid'); grid.innerHTML='';
  if(!state.templates.length){grid.innerHTML=`<div class="inline-empty">No saved scenarios yet. <button class="text-action" data-goto="create">Create a template</button> to begin.</div>`;return;}
  for(const t of state.templates){
    const el=document.createElement('label'); el.className=`scenario-option ${state.selectedTemplates.has(t.id)?'selected':''}`;
    const url=thumbURL(t.sceneBlob);
    el.innerHTML=`<input type="checkbox" value="${t.id}" ${state.selectedTemplates.has(t.id)?'checked':''}><div class="scenario-thumb"><img src="${url}" alt=""></div><div class="scenario-info"><strong>${escapeHTML(t.name)}</strong><span>${escapeHTML(t.category||'Scenario')} · ${t.reflectionBlob?'Glass overlay':'No overlay'}</span></div>`;
    grid.append(el);
  }
  updateGenerateButton();
}

function updateGenerateButton(){
  const count=state.selectedTemplates.size;
  $('#generateCount').textContent=`(${count})`;
  $('#generateBtn').disabled=!(state.artwork&&count>0);
}

function resetCreator() {
  const c=state.creator;
  if(c.sceneBitmap?.close)c.sceneBitmap.close();
  c.sceneBlob=null;c.sceneBitmap=null;c.sceneName='';c.corners=[[.22,.20],[.78,.20],[.78,.80],[.22,.80]];c.reflectionBlob=null;c.frameOverlayBlob=null;c.editId=null;c.layout=null;c.dragIndex=-1;
  $('#sceneInput').value='';$('#reflectionInput').value='';$('#frameOverlayInput').value='';$('#templateName').value='';$('#templateCategory').value='Living room';$('#templateNotes').value='';
  $('#sceneFileName').textContent='Upload scenario image';$('#sceneFileHint').textContent='A clear, high-resolution scene works best · PNG, JPG, WEBP';
  updateLayerFileRows();$('#saveTemplateBtn').disabled=true;$('#autoDetectFrame').disabled=true;$('#resetCorners').disabled=true;$('#fitScene').disabled=true;$('#frameDetectStatus').querySelector('span').textContent='Upload a scene to attempt automatic frame detection. Always check the four handles and fine-tune them on the inner edge of the frame.';drawCornerEditor();
}

async function loadScene(file) {
  if(!file || !file.type.startsWith('image/')) return toast('Please choose a PNG, JPG or WEBP image.','error');
  try{
    const bitmap=await createImageBitmap(file);
    const c=state.creator;
    if(c.sceneBitmap?.close)c.sceneBitmap.close();
    c.sceneBlob=file;c.sceneBitmap=bitmap;c.sceneName=file.name;c.corners=[[.22,.20],[.78,.20],[.78,.80],[.22,.80]];c.reflectionBlob=null;c.frameOverlayBlob=null;c.editId=null;updateLayerFileRows();
    $('#sceneFileName').textContent=file.name;$('#sceneFileHint').textContent=dimsLabel(bitmap.width,bitmap.height);
    $('#resetCorners').disabled=false;$('#fitScene').disabled=false;$('#autoDetectFrame').disabled=false;$('#saveTemplateBtn').disabled=false;
    if(!$('#templateName').value) $('#templateName').value=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');
    drawCornerEditor();
    // Automatically suggest the frame opening after a scenario is loaded.
    await autoDetectCurrentScene({silent:true});
  }catch(error){toast(`Could not open that image: ${error.message}`,'error');}
}


async function autoDetectCurrentScene({silent=false}={}) {
  const c=state.creator,button=$('#autoDetectFrame'),status=$('#frameDetectStatus')?.querySelector('span');
  if(!c.sceneBitmap){if(!silent)toast('Upload a scenario image first.','error');return false;}
  if(button){button.disabled=true;button.dataset.originalText=button.innerHTML;button.innerHTML='<i data-icon="refresh-cw"></i> Detecting…';window.refreshIcons(button);}
  if(status)status.textContent='Analyzing frame borders and perspective lines…';
  try {
    const result=await detectFrameCorners(c.sceneBitmap);
    c.corners=result.corners;
    drawCornerEditor();
    if(status)status.textContent='Frame opening suggested automatically · '+result.confidence+'% confidence. Check the handles before saving.';
    if(!silent)toast('Frame opening detected ('+result.confidence+'% confidence). Check the four handles.');
    return true;
  } catch(error) {
    if(status)status.textContent='Auto-detection could not confirm the frame: '+error.message+' Drag the four corner handles manually.';
    if(!silent)toast(error.message,'error');
    return false;
  } finally {
    if(button){button.disabled=!c.sceneBitmap;button.innerHTML=button.dataset.originalText||'<i data-icon="scan"></i> Auto-detect';window.refreshIcons(button);}
  }
}

function getCanvasLayout(bitmap,canvas){
  const scale=Math.min(canvas.width/bitmap.width,canvas.height/bitmap.height);
  const width=bitmap.width*scale,height=bitmap.height*scale;
  return {scale,x:(canvas.width-width)/2,y:(canvas.height-height)/2,width,height};
}

function drawCornerEditor(){
  const canvas=$('#cornerCanvas'); if(!canvas)return;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#09100c';ctx.fillRect(0,0,canvas.width,canvas.height);
  const c=state.creator;
  if(!c.sceneBitmap){$('#cornerEmpty').classList.remove('hidden');return;}
  $('#cornerEmpty').classList.add('hidden');
  const layout=getCanvasLayout(c.sceneBitmap,canvas);c.layout=layout;
  ctx.drawImage(c.sceneBitmap,layout.x,layout.y,layout.width,layout.height);
  const pts=c.corners.map(([x,y])=>({x:layout.x+x*layout.width,y:layout.y+y*layout.height}));
  ctx.save();ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle='rgba(9,15,10,.37)';ctx.fill();ctx.strokeStyle='#e3bd71';ctx.lineWidth=3;ctx.setLineDash([10,7]);ctx.stroke();ctx.setLineDash([]);
  const colors=['#f0c56e','#7dc9a0','#73b9dc','#db91c3'];
  pts.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,16,0,Math.PI*2);ctx.fillStyle=colors[i];ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#111912';ctx.stroke();ctx.fillStyle='#162017';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),p.x,p.y+1);});
  ctx.restore();
}

function canvasPointerPosition(event){
  const canvas=$('#cornerCanvas');const rect=canvas.getBoundingClientRect();
  return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};
}
function pointerToNormalized(pos){
  const {layout}=state.creator;if(!layout)return null;
  return [Math.min(1,Math.max(0,(pos.x-layout.x)/layout.width)),Math.min(1,Math.max(0,(pos.y-layout.y)/layout.height))];
}
function onCornerPointerDown(e){
  const c=state.creator;if(!c.sceneBitmap||!c.layout)return;
  const pos=canvasPointerPosition(e);const l=c.layout;
  const pts=c.corners.map(([x,y])=>({x:l.x+x*l.width,y:l.y+y*l.height}));
  let hit=-1,dist=24;
  pts.forEach((p,i)=>{const d=Math.hypot(pos.x-p.x,pos.y-p.y);if(d<dist){dist=d;hit=i;}});
  if(hit>=0){c.dragIndex=hit;$('#cornerCanvas').setPointerCapture(e.pointerId);}
}
function onCornerPointerMove(e){
  const c=state.creator;if(c.dragIndex<0)return;
  const pos=canvasPointerPosition(e);const n=pointerToNormalized(pos);if(!n)return;
  c.corners[c.dragIndex]=n;drawCornerEditor();
}
function onCornerPointerUp(){state.creator.dragIndex=-1;}

function updateLayerFileRows(){
  const c=state.creator;
  $('#reflectionPick').classList.toggle('hidden',!!c.reflectionBlob);$('#reflectionFileRow').classList.toggle('hidden',!c.reflectionBlob);
  $('#frameOverlayPick').classList.toggle('hidden',!!c.frameOverlayBlob);$('#frameOverlayFileRow').classList.toggle('hidden',!c.frameOverlayBlob);
  if(c.reflectionBlob)$('#reflectionFileName').textContent=c.reflectionBlob.name||'Reflection overlay';
  if(c.frameOverlayBlob)$('#frameOverlayFileName').textContent=c.frameOverlayBlob.name||'Frame overlay';
}

async function attachLayer(file,kind){
  if(!file)return;
  if(!['image/png','image/webp'].includes(file.type))return toast('Use a transparent PNG or WEBP overlay for this layer.','error');
  try{
    const bitmap=await createImageBitmap(file);
    const c=state.creator;
    if(c.sceneBitmap && (bitmap.width!==c.sceneBitmap.width||bitmap.height!==c.sceneBitmap.height)){
      const ok=await confirmAction('Overlay dimensions differ','This overlay is not the same pixel size as your scenario image. It will be stretched to fit the scene. Continue?','Use overlay');
      if(!ok){bitmap.close?.();return;}
    }
    bitmap.close?.();
    if(kind==='reflection')c.reflectionBlob=file;else c.frameOverlayBlob=file;
    updateLayerFileRows();toast(`${kind==='reflection'?'Glass reflection':'Frame foreground'} added.`);
  }catch(error){toast(`Could not read overlay: ${error.message}`,'error');}
}

async function saveCurrentTemplate(){
  const c=state.creator;
  if(!c.sceneBlob||!c.sceneBitmap)return toast('Upload a scenario image first.','error');
  const name=$('#templateName').value.trim();if(!name)return toast('Give this scenario a name.','error');
  const quad=c.corners;
  const crossValues=quad.map((p,i)=>{const a=quad[(i+1)%4],b=quad[(i+2)%4];return (a[0]-p[0])*(b[1]-a[1])-(a[1]-p[1])*(b[0]-a[0]);});
  if(crossValues.some(v=>v<=0.00001))return toast('The four points must form a non-crossing clockwise frame shape. Check their order and position.','error');
  try{
    const existing=c.editId?state.templates.find(t=>t.id===c.editId):null;
    const template={
      id:c.editId||uid(),name,category:$('#templateCategory').value,notes:$('#templateNotes').value.trim(),
      sceneBlob:c.sceneBlob,reflectionBlob:c.reflectionBlob,frameOverlayBlob:c.frameOverlayBlob,
      width:c.sceneBitmap.width,height:c.sceneBitmap.height,corners:c.corners.map(p=>[Number(p[0]),Number(p[1])]),
      reflectionBlend:$('#reflectionBlend').value,reflectionOpacity:Number($('#reflectionOpacity').value),
      createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now(),
    };
    await saveTemplate(template);await reloadTemplates();resetCreator();navigate('templates');toast('Scenario template saved to this device.');
  }catch(error){toast(`Could not save template: ${error.message}`,'error');}
}

async function editTemplate(id){
  const t=state.templates.find(x=>x.id===id);if(!t)return;
  try{
    const bitmap=await createImageBitmap(t.sceneBlob);const c=state.creator;
    if(c.sceneBitmap?.close)c.sceneBitmap.close();
    Object.assign(c,{sceneBlob:t.sceneBlob,sceneBitmap:bitmap,sceneName:t.name,corners:t.corners.map(p=>[...p]),reflectionBlob:t.reflectionBlob||null,frameOverlayBlob:t.frameOverlayBlob||null,editId:t.id});
    $('#templateName').value=t.name;$('#templateCategory').value=t.category||'Other';$('#templateNotes').value=t.notes||'';$('#reflectionBlend').value=t.reflectionBlend||'screen';$('#reflectionOpacity').value=t.reflectionOpacity??55;$('#reflectionOpacityLabel').textContent=`${$('#reflectionOpacity').value}%`;
    $('#sceneFileName').textContent=t.name;$('#sceneFileHint').textContent=dimsLabel(t.width,t.height);$('#saveTemplateBtn').disabled=false;$('#resetCorners').disabled=false;$('#fitScene').disabled=false;$('#autoDetectFrame').disabled=false;$('#frameDetectStatus').querySelector('span').textContent='Saved corner mapping loaded. Run Auto-detect to re-check the frame opening, or fine-tune the handles manually.';updateLayerFileRows();drawCornerEditor();navigate('create');
  }catch(error){toast(`Could not open template: ${error.message}`,'error');}
}

async function exportOneTemplate(id){
  const t=state.templates.find(x=>x.id===id);if(!t)return;
  try{
    const data=await exportTemplateData(t);const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
    downloadBlob(blob,`${safeFileName(t.name)}.framekit`);toast('Template backup exported.');
  }catch(error){toast(`Template export failed: ${error.message}`,'error');}
}
function safeFileName(name){return String(name||'mockup').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70)||'mockup';}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
}

function confirmAction(title,message,confirmLabel='Continue'){
  return new Promise(resolve=>{
    $('#modalTitle').textContent=title;$('#modalText').textContent=message;$('#modalConfirm').textContent=confirmLabel;$('#confirmModal').classList.remove('hidden');
    const close=value=>{$('#confirmModal').classList.add('hidden');$('#modalConfirm').removeEventListener('click',yes);$('#modalCancel').removeEventListener('click',no);resolve(value);};
    const yes=()=>close(true),no=()=>close(false);$('#modalConfirm').addEventListener('click',yes);$('#modalCancel').addEventListener('click',no);
  });
}

function selectTemplateForStudio(id){state.selectedTemplates.add(id);navigate('studio');renderStudioTemplates();schedulePreview();}

function clearArtwork(){state.artwork=null;if(state.artworkURL)URL.revokeObjectURL(state.artworkURL);state.artworkURL=null;$('#artworkInput').value='';$('#artworkFileName').textContent='Drop your artwork here';$('#artworkFileHint').textContent='or click to browse · PNG, JPG, WEBP';$('#artworkDetails').classList.add('hidden');$('#artworkDrop').classList.remove('hidden');$('#studioPreview').innerHTML=`<div class="preview-placeholder"><i data-icon="scan-eye"></i><span>Your mockup preview will appear here</span></div>`;window.refreshIcons($('#studioPreview'));$('#previewCaption').textContent='Select an artwork and a scenario to preview.';clearResults();$('#resultsSection').classList.add('hidden');updateGenerateButton();}

async function setArtwork(file){
  if(!file)return;if(!file.type.startsWith('image/'))return toast('Please choose a PNG, JPG or WEBP image.','error');
  try{const bmp=await createImageBitmap(file);const artW=bmp.width,artH=bmp.height;bmp.close?.();state.artwork=file;if(state.artworkURL)URL.revokeObjectURL(state.artworkURL);state.artworkURL=objectURL(file);
    $('#artworkFileName').textContent=file.name;$('#artworkFileHint').textContent='Artwork ready for compositing';$('#artworkDrop').classList.add('hidden');$('#artworkDetails').classList.remove('hidden');$('#artworkThumb').style.backgroundImage=`url("${state.artworkURL}")`;$('#artworkMetaName').textContent=file.name;$('#artworkMetaSize').textContent=`${dimsLabel(artW,artH)} · ${bytesLabel(file.size)}`;
    updateGenerateButton();schedulePreview();
  }catch(error){toast(`Could not open artwork: ${error.message}`,'error');}
}

function getRenderOptions(preview=false){
  const mode=$('#resolutionSelect').value;let outputWidth;
  if(preview)outputWidth=1050;
  else if(mode==='native')outputWidth=null;
  else if(mode==='custom')outputWidth=Math.max(500,Math.min(8000,Number($('#customWidth').value)||3000));
  else outputWidth=Number(mode);
  return {outputWidth,fitMode:$('#fitMode').value,format:preview?'image/jpeg':$('#exportFormat').value,quality:Number($('#jpegQuality').value)/100,reflectionStrength:Number($('#reflectionStrength').value),meshQuality:preview?16:24};
}

function schedulePreview(){
  if(state.currentPage!=='studio')return;
  const token=++state.previewToken;
  setTimeout(()=>{if(token===state.previewToken)renderPreview(token);},160);
}
async function renderPreview(token){
  if(!state.artwork||!state.selectedTemplates.size){return;}
  const template=state.templates.find(t=>state.selectedTemplates.has(t.id));if(!template)return;
  $('#previewCaption').textContent=`Preview · ${template.name}`;
  try{
    const output=await renderTemplate(template,state.artwork,getRenderOptions(true));if(token!==state.previewToken)return;
    const old=$('#studioPreview canvas');if(old)old.remove();$('#studioPreview').innerHTML='';
    output.canvas.className='preview-render-canvas';output.canvas.setAttribute('aria-label',`Preview of ${template.name}`);$('#studioPreview').append(output.canvas);
  }catch(error){if(token===state.previewToken){$('#previewCaption').textContent=error.message;toast(`Preview failed: ${error.message}`,'error');}}
}

async function generateBatch(){
  if(!state.artwork||!state.selectedTemplates.size)return;
  const templates=state.templates.filter(t=>state.selectedTemplates.has(t.id));if(!templates.length)return;
  clearResults();$('#resultsGrid').innerHTML='';$('#resultsSection').classList.remove('hidden');$('#progressWrap').classList.remove('hidden');$('#progressBar').style.width='0%';$('#progressPercent').textContent='0%';$('#generateBtn').disabled=true;$('#generateBtn').innerHTML='<i data-icon="cpu"></i> Rendering…';window.refreshIcons($('#generateBtn'));
  const settings=getRenderOptions(false);
  try{
    for(let i=0;i<templates.length;i++){
      const template=templates[i];$('#progressLabel').textContent=`Rendering ${template.name} (${i+1} of ${templates.length})…`;
      const result=await renderTemplate(template,state.artwork,settings);
      const item={name:template.name,fileName:`${safeFileName(template.name)}-${safeFileName(state.artwork.name.replace(/\.[^.]+$/,''))}.${settings.format==='image/png'?'png':'jpg'}`,blob:result.blob,width:result.width,height:result.height,templateId:template.id};
      state.results.push(item);renderResultCard(item);
      const pct=Math.round(((i+1)/templates.length)*100);$('#progressBar').style.width=`${pct}%`;$('#progressPercent').textContent=`${pct}%`;
      await new Promise(requestAnimationFrame);
    }
    $('#progressLabel').textContent='All mockups generated successfully.';$('#resultsSummary').textContent=`${state.results.length} mockup${state.results.length===1?'':'s'} · ${settings.format==='image/png'?'PNG':'JPEG'} · ${settings.outputWidth?`${settings.outputWidth.toLocaleString()} px wide`:'native scene size'}`;
    const count=Number(localStorage.getItem('framestudio_exports')||0)+state.results.length;localStorage.setItem('framestudio_exports',String(count));$('#statExports').textContent=count.toLocaleString();toast(`${state.results.length} mockup${state.results.length===1?'':'s'} generated.`);
  }catch(error){toast(`Rendering stopped: ${error.message}`,'error');$('#progressLabel').textContent='Rendering stopped. Check the error and try again.';}
  finally{$('#generateBtn').disabled=!(state.artwork&&state.selectedTemplates.size);$('#generateBtn').innerHTML='<i data-icon="sparkles"></i> Generate mockups <span id="generateCount">('+state.selectedTemplates.size+')</span>';window.refreshIcons($('#generateBtn'));}
}

function renderResultCard(item){
  const url=objectURL(item.blob);item.url=url;
  const card=document.createElement('article');card.className='result-card';
  card.innerHTML=`<div class="result-image"><img src="${url}" alt="${escapeHTML(item.name)} mockup"></div><div class="result-info"><div><strong>${escapeHTML(item.name)}</strong><span>${dimsLabel(item.width,item.height)}</span></div><button class="icon-btn" data-result-download="${state.results.length-1}" title="Download image"><i data-icon="download"></i></button></div>`;
  $('#resultsGrid').append(card);window.refreshIcons(card);
}

async function downloadResultsZip(){
  if(!state.results.length)return;
  try{const blob=await createZip(state.results.map(r=>({name:r.fileName,blob:r.blob})));downloadBlob(blob,`framestudio-mockups-${new Date().toISOString().slice(0,10)}.zip`);toast('Mockup ZIP is ready.');}
  catch(error){toast(`ZIP creation failed: ${error.message}`,'error');}
}

async function refreshStorage(){
  try{const {bytes,count}=await estimateStorage();const label=bytesLabel(bytes);$('#settingsStorage').textContent=label;$('#statStorage').textContent=label;const pct=Math.min(100,bytes/(200*1024*1024)*100);$('#storageMeterBar').style.width=`${pct}%`;$('#settingsStorage').title=`${count} templates`;}
  catch(error){$('#settingsStorage').textContent='Unavailable';}
}

async function reloadTemplates(){state.templates=await getAllTemplates();$('#templateCount').textContent=state.templates.length;renderDashboard();if(state.currentPage==='templates')renderTemplateLibrary();if(state.currentPage==='studio')renderStudioTemplates();}

function bindEvents(){
  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-goto]');if(nav){navigate(nav.dataset.goto);return;}
    const page=e.target.closest('[data-page]');if(page){navigate(page.dataset.page);return;}
    const action=e.target.closest('[data-action]');if(action){const id=action.dataset.id;const type=action.dataset.action;
      if(type==='use')selectTemplateForStudio(id);
      if(type==='edit')editTemplate(id);
      if(type==='export')exportOneTemplate(id);
      if(type==='delete')confirmAction('Delete this template?','The scenario and its stored overlays will be removed from this browser. This cannot be undone.','Delete template').then(async ok=>{if(ok){await deleteTemplate(id);state.selectedTemplates.delete(id);await reloadTemplates();toast('Template deleted.');}});
    }
    const resultButton=e.target.closest('[data-result-download]');if(resultButton){const item=state.results[Number(resultButton.dataset.resultDownload)];if(item)downloadBlob(item.blob,item.fileName);}
  });
  $('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  $('#quickHelp').addEventListener('click',()=>navigate('help'));
  $('#templateSearch').addEventListener('input',renderTemplateLibrary);
  $('#sceneInput').addEventListener('change',e=>loadScene(e.target.files[0]));
  $('#artworkInput').addEventListener('change',e=>setArtwork(e.target.files[0]));
  $('#reflectionInput').addEventListener('change',e=>attachLayer(e.target.files[0],'reflection'));
  $('#frameOverlayInput').addEventListener('change',e=>attachLayer(e.target.files[0],'frame'));
  $('#removeReflection').addEventListener('click',()=>{state.creator.reflectionBlob=null;$('#reflectionInput').value='';updateLayerFileRows();});
  $('#removeFrameOverlay').addEventListener('click',()=>{state.creator.frameOverlayBlob=null;$('#frameOverlayInput').value='';updateLayerFileRows();});
  $('#reflectionOpacity').addEventListener('input',e=>$('#reflectionOpacityLabel').textContent=`${e.target.value}%`);
  $('#reflectionStrength').addEventListener('input',e=>{$('#reflectionValue').textContent=`${e.target.value}%`;schedulePreview();});
  $('#jpegQuality').addEventListener('input',e=>$('#qualityValue').textContent=`${e.target.value}%`);
  $('#qualityWrap').classList.toggle('hidden',$('#exportFormat').value!=='image/jpeg');
  $('#exportFormat').addEventListener('change',e=>$('#qualityWrap').classList.toggle('hidden',e.target.value!=='image/jpeg'));
  $('#resolutionSelect').addEventListener('change',e=>$('#customWidthWrap').classList.toggle('hidden',e.target.value!=='custom'));
  $('#fitMode').addEventListener('change',schedulePreview);
  $('#generateBtn').addEventListener('click',generateBatch);
  $('#downloadZip').addEventListener('click',downloadResultsZip);
  $('#removeArtwork').addEventListener('click',clearArtwork);
  $('#studioTemplateGrid').addEventListener('change',e=>{
    if(e.target.matches('input[type=checkbox]')){if(e.target.checked)state.selectedTemplates.add(e.target.value);else state.selectedTemplates.delete(e.target.value);e.target.closest('.scenario-option').classList.toggle('selected',e.target.checked);updateGenerateButton();schedulePreview();}
  });
  $('#selectAllTemplates').addEventListener('click',()=>{state.templates.forEach(t=>state.selectedTemplates.add(t.id));renderStudioTemplates();schedulePreview();});
  $('#clearTemplates').addEventListener('click',()=>{state.selectedTemplates.clear();renderStudioTemplates();updateGenerateButton();schedulePreview();});
  $('#saveTemplateBtn').addEventListener('click',saveCurrentTemplate);
  $('#autoDetectFrame').addEventListener('click',()=>autoDetectCurrentScene());
  $('#cancelTemplateBtn').addEventListener('click',()=>{resetCreator();navigate('templates');});
  $('#resetCorners').addEventListener('click',()=>{state.creator.corners=[[.22,.20],[.78,.20],[.78,.80],[.22,.80]];drawCornerEditor();});
  $('#fitScene').addEventListener('click',drawCornerEditor);
  $('#cornerCanvas').addEventListener('pointerdown',onCornerPointerDown);
  $('#cornerCanvas').addEventListener('pointermove',onCornerPointerMove);
  $('#cornerCanvas').addEventListener('pointerup',onCornerPointerUp);
  $('#cornerCanvas').addEventListener('pointercancel',onCornerPointerUp);
  $('#artworkDrop').addEventListener('dragover',e=>{e.preventDefault();$('#artworkDrop').classList.add('dragover');});
  $('#artworkDrop').addEventListener('dragleave',()=>$('#artworkDrop').classList.remove('dragover'));
  $('#artworkDrop').addEventListener('drop',e=>{e.preventDefault();$('#artworkDrop').classList.remove('dragover');setArtwork(e.dataTransfer.files[0]);});
  $('#sceneDrop').addEventListener('dragover',e=>{e.preventDefault();$('#sceneDrop').style.borderColor='#d8b66e';});
  $('#sceneDrop').addEventListener('dragleave',()=>$('#sceneDrop').style.borderColor='');
  $('#sceneDrop').addEventListener('drop',e=>{e.preventDefault();$('#sceneDrop').style.borderColor='';loadScene(e.dataTransfer.files[0]);});
  $('#importTemplateBtn').addEventListener('click',()=>$('#importTemplateFile').click());
  $('#importTemplateFile').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{const data=JSON.parse(await file.text());const template=importTemplateData(data);await saveTemplate(template);await reloadTemplates();toast('Template imported successfully.');}
    catch(error){toast(`Import failed: ${error.message}`,'error');}finally{e.target.value='';}
  });
  $('#refreshStorage').addEventListener('click',refreshStorage);
  $('#clearWorkspaceBtn').addEventListener('click',()=>confirmAction('Delete all local templates?','This removes every saved scenario and overlay from this browser. Export any templates you need before deleting.','Delete everything').then(async ok=>{if(ok){await clearTemplates();state.selectedTemplates.clear();await reloadTemplates();toast('Local template library cleared.');}}));
  $('#reflectionBlend').addEventListener('change',()=>{});
  $('#resolutionSelect').addEventListener('change',schedulePreview);
}

async function init(){
  bindEvents();window.refreshIcons();
  try{await reloadTemplates();}catch(error){toast(`Local storage could not start: ${error.message}`,'error');}
  renderStudioTemplates();resetCreator();
  $('#connectionLabel').textContent=navigator.onLine?'Offline-ready':'Offline mode';
  window.addEventListener('online',()=>$('#connectionLabel').textContent='Offline-ready');
  window.addEventListener('offline',()=>$('#connectionLabel').textContent='Offline mode');
  if('serviceWorker' in navigator && location.protocol!=='file:'){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}

init();
