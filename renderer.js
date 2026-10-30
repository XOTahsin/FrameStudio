function loadImage(blob) {
  if (!blob) return Promise.reject(new Error('An image asset is missing.'));
  if ('createImageBitmap' in window) return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image asset.')); };
    img.src = url;
  });
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10) throw new Error('The four frame points are too close together. Adjust the corner markers.');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map(row => row[n]);
}

function makeHomography(srcW, srcH, dst) {
  const src = [[0,0],[srcW,0],[srcW,srcH],[0,srcH]];
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x,y] = src[i], [u,v] = dst[i];
    A.push([x,y,1,0,0,0,-u*x,-u*y]); B.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]); B.push(v);
  }
  const h = solveLinearSystem(A, B);
  return (x,y) => {
    const z = h[6]*x + h[7]*y + 1;
    return { x:(h[0]*x+h[1]*y+h[2])/z, y:(h[3]*x+h[4]*y+h[5])/z };
  };
}

function applyAffineForTriangle(ctx, source, s0, s1, s2, d0, d1, d2) {
  const sx1=s1.x-s0.x, sy1=s1.y-s0.y, sx2=s2.x-s0.x, sy2=s2.y-s0.y;
  const dx1=d1.x-d0.x, dy1=d1.y-d0.y, dx2=d2.x-d0.x, dy2=d2.y-d0.y;
  const det=sx1*sy2-sy1*sx2;
  if (Math.abs(det)<1e-9) return;
  const a=(dx1*sy2-dx2*sy1)/det;
  const c=(dx2*sx1-dx1*sx2)/det;
  const b=(dy1*sy2-dy2*sy1)/det;
  const d=(dy2*sx1-dy1*sx2)/det;
  const e=d0.x-a*s0.x-c*s0.y;
  const f=d0.y-b*s0.x-d*s0.y;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(d0.x,d0.y); ctx.lineTo(d1.x,d1.y); ctx.lineTo(d2.x,d2.y); ctx.closePath(); ctx.clip();
  ctx.setTransform(a,b,c,d,e,f);
  ctx.drawImage(source,0,0);
  ctx.restore();
}

function warpImage(ctx, source, sourceW, sourceH, points, grid=22) {
  const map = makeHomography(sourceW, sourceH, points);
  const steps = Math.max(8, Math.min(32, grid));
  const xs = Array.from({length:steps+1},(_,i)=>sourceW*i/steps);
  const ys = Array.from({length:steps+1},(_,i)=>sourceH*i/steps);
  for (let y=0;y<steps;y++) {
    for (let x=0;x<steps;x++) {
      const x0=xs[x],x1=xs[x+1],y0=ys[y],y1=ys[y+1];
      const s00={x:x0,y:y0},s10={x:x1,y:y0},s11={x:x1,y:y1},s01={x:x0,y:y1};
      const d00=map(x0,y0),d10=map(x1,y0),d11=map(x1,y1),d01=map(x0,y1);
      applyAffineForTriangle(ctx,source,s00,s10,s11,d00,d10,d11);
      applyAffineForTriangle(ctx,source,s00,s11,s01,d00,d11,d01);
    }
  }
}

function prepareArtwork(image, aspect, fitMode, targetLongSide) {
  const canvas = document.createElement('canvas');
  const srcRatio = image.width / image.height;
  let cropW=image.width, cropH=image.height, cropX=0, cropY=0;
  if (fitMode !== 'stretch') {
    if (srcRatio > aspect) { cropW=image.height*aspect; cropX=(image.width-cropW)/2; }
    else { cropH=image.width/aspect; cropY=(image.height-cropH)/2; }
  }
  const nativeLongSide=Math.max(cropW,cropH);
  // Keep the artwork's available detail while avoiding pointless oversampling beyond the frame.
  const longSide=Math.max(1,Math.min(nativeLongSide,Math.max(900,targetLongSide*1.15)));
  const scale=longSide/nativeLongSide;
  const outW=Math.max(1,Math.round((fitMode==='stretch'?image.width:cropW)*scale));
  const outH=Math.max(1,Math.round((fitMode==='stretch'?image.height:cropH)*scale));
  canvas.width=outW; canvas.height=outH;
  const ctx = canvas.getContext('2d', {alpha:true});
  ctx.clearRect(0,0,outW,outH);
  if (fitMode === 'stretch') ctx.drawImage(image,0,0,outW,outH);
  else ctx.drawImage(image,cropX,cropY,cropW,cropH,0,0,outW,outH);
  return canvas;
}

function averageFrameAspect(corners, width, height) {
  const p = corners.map(([x,y])=>({x:x*width,y:y*height}));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const top=dist(p[0],p[1]),bottom=dist(p[3],p[2]);
  const left=dist(p[0],p[3]),right=dist(p[1],p[2]);
  return ((top+bottom)/2)/Math.max(1,(left+right)/2);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('The browser could not encode this output.')),type,quality));
}

export async function renderTemplate(template, artworkBlob, options={}) {
  const scene = await loadImage(template.sceneBlob);
  const artwork = await loadImage(artworkBlob);
  const nativeW = template.width || scene.width;
  const nativeH = template.height || scene.height;
  const requestedW = options.outputWidth || nativeW;
  const scale = requestedW / nativeW;
  const outW = Math.max(1, Math.round(requestedW));
  const outH = Math.max(1, Math.round(nativeH * scale));
  if (outW > 8000 || outH > 8000) throw new Error('Output dimensions are too large. Choose a width of 8000 px or less.');
  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d', {alpha:false, willReadFrequently:false});
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scene,0,0,outW,outH);
  const corners = (template.corners || [[.25,.2],[.75,.2],[.75,.8],[.25,.8]]).map(([x,y])=>[x*outW,y*outH]);
  const aspect = averageFrameAspect(template.corners || [[.25,.2],[.75,.2],[.75,.8],[.25,.8]],outW,outH);
  const frameLongSide = Math.max(
    Math.hypot(corners[1][0]-corners[0][0],corners[1][1]-corners[0][1]),
    Math.hypot(corners[2][0]-corners[3][0],corners[2][1]-corners[3][1]),
    Math.hypot(corners[3][0]-corners[0][0],corners[3][1]-corners[0][1]),
    Math.hypot(corners[2][0]-corners[1][0],corners[2][1]-corners[1][1])
  );
  const artworkCanvas = prepareArtwork(artwork,aspect,options.fitMode || 'cover',frameLongSide);
  warpImage(ctx,artworkCanvas,artworkCanvas.width,artworkCanvas.height,corners,options.meshQuality || 22);

  if (template.reflectionBlob && (options.reflectionStrength ?? 100) > 0) {
    const reflection = await loadImage(template.reflectionBlob);
    const defaultOpacity = (template.reflectionOpacity ?? 55) / 100;
    const strength = (options.reflectionStrength ?? 100) / 100;
    ctx.save();
    ctx.globalAlpha = Math.min(1.5, defaultOpacity * strength);
    ctx.globalCompositeOperation = template.reflectionBlend || 'screen';
    ctx.drawImage(reflection,0,0,outW,outH);
    ctx.restore();
    if (reflection.close) reflection.close();
  }
  if (template.frameOverlayBlob) {
    const frameOverlay = await loadImage(template.frameOverlayBlob);
    ctx.save(); ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
    ctx.drawImage(frameOverlay,0,0,outW,outH); ctx.restore();
    if (frameOverlay.close) frameOverlay.close();
  }
  const type = options.format || 'image/png';
  const blob = await canvasToBlob(canvas,type,type==='image/jpeg'?(options.quality ?? .92):undefined);
  if (scene.close) scene.close();
  if (artwork.close) artwork.close();
  return {canvas, blob, width:outW, height:outH};
}

export async function makePreviewURL(template, artworkBlob, options={}) {
  const result = await renderTemplate(template,artworkBlob,{...options,outputWidth:options.outputWidth || 1100,meshQuality:16,format:'image/jpeg',quality:.86});
  return URL.createObjectURL(result.blob);
}
