/* Lightweight offline quadrilateral detector for photo-frame openings.
   Sobel edges + a coarse Hough transform; detection is a suggestion, not a guarantee. */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function polygonArea(points) {
  let area = 0;
  for (let i=0;i<points.length;i++) { const a=points[i], b=points[(i+1)%points.length]; area += a.x*b.y-b.x*a.y; }
  return Math.abs(area)/2;
}
function cross(a,b,c) { return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x); }
function lineIntersection(a,b) {
  const det=a.cos*b.sin-b.cos*a.sin;
  if(Math.abs(det)<1e-5)return null;
  return {x:(a.rho*b.sin-b.rho*a.sin)/det,y:(a.cos*b.rho-b.cos*a.rho)/det};
}
function orderCorners(points) {
  const center=points.reduce((s,p)=>({x:s.x+p.x/4,y:s.y+p.y/4}),{x:0,y:0});
  const ordered=[...points].sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
  let start=0;
  for(let i=1;i<4;i++)if(ordered[i].x+ordered[i].y<ordered[start].x+ordered[start].y)start=i;
  const result=ordered.slice(start).concat(ordered.slice(0,start));
  return cross(result[0],result[1],result[2])<0?[result[0],result[3],result[2],result[1]]:result;
}
function sampleLineSupport(line,a,b,gradients,width,height,threshold) {
  const steps=Math.max(24,Math.min(120,Math.round(Math.hypot(b.x-a.x,b.y-a.y)/4)));
  const theta=line.theta*Math.PI/180;let hits=0;
  for(let i=2;i<steps-2;i++){
    const t=i/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;let found=false;
    for(let oy=-2;oy<=2&&!found;oy++)for(let ox=-2;ox<=2;ox++){
      const px=Math.round(x)+ox,py=Math.round(y)+oy;
      if(px<1||py<1||px>=width-1||py>=height-1)continue;
      const idx=py*width+px;if(gradients.mag[idx]<threshold*.55)continue;
      const diff=Math.abs(gradients.angle[idx]-theta)%Math.PI;
      if(Math.min(diff,Math.PI-diff)<.55){found=true;break;}
    }
    if(found)hits++;
  }
  return hits/(steps-4);
}
export async function detectFrameCorners(image) {
  if(!image||!image.width||!image.height)throw new Error('Upload a scenario image before auto-detecting the frame.');
  const maxSide=560,scale=Math.min(1,maxSide/Math.max(image.width,image.height));
  const width=Math.max(64,Math.round(image.width*scale)),height=Math.max(64,Math.round(image.height*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,width,height);
  let pixels;
  try{pixels=ctx.getImageData(0,0,width,height).data;}
  catch{throw new Error('The image cannot be analyzed by the browser. Try re-saving it as JPG or PNG.');}
  const gray=new Float32Array(width*height);
  for(let i=0,p=0;i<gray.length;i++,p+=4)gray[i]=.299*pixels[p]+.587*pixels[p+1]+.114*pixels[p+2];
  const mag=new Float32Array(width*height),angle=new Float32Array(width*height),magnitudes=[];
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;
    const gx=-gray[i-width-1]+gray[i-width+1]-2*gray[i-1]+2*gray[i+1]-gray[i+width-1]+gray[i+width+1];
    const gy=-gray[i-width-1]-2*gray[i-width]-gray[i-width+1]+gray[i+width-1]+2*gray[i+width]+gray[i+width+1];
    const m=Math.hypot(gx,gy);mag[i]=m;angle[i]=Math.atan2(gy,gx);if(m>18)magnitudes.push(m);
  }
  if(magnitudes.length<120)throw new Error('Not enough clear edges were found. Use a sharper image with a visible frame border.');
  magnitudes.sort((a,b)=>a-b);
  const threshold=Math.max(42,magnitudes[Math.floor(magnitudes.length*.68)]);
  const rhoMax=Math.ceil(Math.hypot(width,height)),rhoCount=rhoMax*2+1,thetaCount=180;
  const accumulator=new Uint32Array(thetaCount*rhoCount),cos=new Float32Array(thetaCount),sin=new Float32Array(thetaCount);
  for(let t=0;t<thetaCount;t++){const r=t*Math.PI/180;cos[t]=Math.cos(r);sin[t]=Math.sin(r);}
  const points=[];
  for(let y=2;y<height-2;y+=2)for(let x=2;x<width-2;x+=2){
    const strength=mag[y*width+x];if(strength>=threshold)points.push({x,y,w:Math.min(255,Math.round(strength))});
  }
  if(points.length<80)throw new Error('The frame edges are too faint to detect automatically. Please adjust the four points manually.');
  for(const p of points)for(let t=0;t<thetaCount;t++){
    const rho=Math.round(p.x*cos[t]+p.y*sin[t])+rhoMax;accumulator[t*rhoCount+rho]+=p.w;
  }
  const peaks=[];
  for(let k=0;k<36;k++){
    let best=0,bestT=0,bestR=0;
    for(let t=0;t<thetaCount;t++){const row=t*rhoCount;for(let r=2;r<rhoCount-2;r++){const value=accumulator[row+r];if(value>best){best=value;bestT=t;bestR=r;}}}
    if(best<points.length*2.2)break;
    peaks.push({theta:bestT,rho:bestR-rhoMax,cos:cos[bestT],sin:sin[bestT],score:best});
    for(let dt=-4;dt<=4;dt++)for(let dr=-13;dr<=13;dr++){
      const t=(bestT+dt+thetaCount)%thetaCount,r=bestR+dr;if(r>=0&&r<rhoCount)accumulator[t*rhoCount+r]=0;
    }
  }
  if(peaks.length<4)throw new Error('Could not find four strong frame edges. Try a scene with a clearer frame or set the corners manually.');
  const parallelPairs=[];
  for(let i=0;i<peaks.length;i++)for(let j=i+1;j<peaks.length;j++){
    const a=peaks[i],b=peaks[j],angleDiff=Math.abs(a.theta-b.theta);
    if(angleDiff>16||Math.abs(a.rho-b.rho)<Math.min(width,height)*.12)continue;
    parallelPairs.push({a,b,theta:(a.theta+b.theta)/2,score:a.score+b.score});
  }
  let bestCandidate=null;const areaTotal=width*height;
  for(let i=0;i<parallelPairs.length;i++)for(let j=i+1;j<parallelPairs.length;j++){
    const A=parallelPairs[i],B=parallelPairs[j],angleDiff=Math.abs(A.theta-B.theta);
    if(angleDiff<58||angleDiff>122)continue;
    const raw=[lineIntersection(A.a,B.a),lineIntersection(A.b,B.a),lineIntersection(A.b,B.b),lineIntersection(A.a,B.b)];
    if(raw.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))continue;
    const pts=orderCorners(raw);
    if(pts.some(p=>p.x< -width*.08||p.y< -height*.08||p.x>width*1.08||p.y>height*1.08))continue;
    const areaRatio=polygonArea(pts)/areaTotal;if(areaRatio<.045||areaRatio>.88)continue;
    const turns=pts.map((p,k)=>cross(p,pts[(k+1)%4],pts[(k+2)%4]));
    if(turns.some(v=>Math.abs(v)<areaTotal*.0005)||!(turns.every(v=>v>0)||turns.every(v=>v<0)))continue;
    const lengths=pts.map((p,k)=>Math.hypot(pts[(k+1)%4].x-p.x,pts[(k+1)%4].y-p.y));
    const ratio=(lengths[0]+lengths[2])/(lengths[1]+lengths[3]);if(ratio<.18||ratio>5.5)continue;
    const candidateLines=[A.a,A.b,B.a,B.b],sides=[[pts[0],pts[1]],[pts[1],pts[2]],[pts[2],pts[3]],[pts[3],pts[0]]];
    const matrix=candidateLines.map(line=>sides.map(([p1,p2])=>sampleLineSupport(line,p1,p2,{mag,angle},width,height,threshold)));
    let support=0;
    for(let a=0;a<4;a++)for(let b=0;b<4;b++)if(b!==a)for(let c=0;c<4;c++)if(c!==a&&c!==b)for(let d=0;d<4;d++)if(d!==a&&d!==b&&d!==c)
      support=Math.max(support,(matrix[0][a]+matrix[1][b]+matrix[2][c]+matrix[3][d])/4);
    const strength=(A.score+B.score)/Math.max(1,points.length*4*255),sizeBonus=1-Math.min(1,Math.abs(areaRatio-.34)/.7);
    const score=support*.78+Math.min(.22,strength*.22)+sizeBonus*.06;
    if(!bestCandidate||score>bestCandidate.score)bestCandidate={pts,score,support,areaRatio};
  }
  if(!bestCandidate||bestCandidate.support<.16)throw new Error('No reliable rectangular frame opening was found. The scene may be too busy or the frame edge may be hidden. Please set the four points manually.');
  const corners=bestCandidate.pts.map(p=>[clamp(p.x/width,0,1),clamp(p.y/height,0,1)]);
  return {corners,confidence:Math.round(clamp(bestCandidate.score*100,0,99)),areaRatio:bestCandidate.areaRatio};
}