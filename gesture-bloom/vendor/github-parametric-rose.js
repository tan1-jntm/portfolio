/**
 * Complete parametric rose surface ported from
 * Tonumoy/Mathematics_And_Nature / Equations_of_Rose.ipynb.
 * Commit: 11f8341349faf2220d6a6e0617c4d383ffcb9629.
 * MIT, Copyright (c) 2024 Tonumoy Mukherjee.
 * Triangle-area sampling adapted from xueweiwujxw/particle-rose,
 * scripts/build-rose-points.mjs, commit 448239aebb750feffa73fdcace0280a0d988132e
 * (MIT, Copyright (c) 2026 Xuewei Wu). Both licenses ship with the app.
 */
const PI=Math.PI, TAU=PI*2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
function seededRandom(seed){return()=>{seed|=0;seed=(seed+0x6d2b79f5)|0;let v=Math.imul(seed^(seed>>>15),1|seed);v=(v+Math.imul(v^(v>>>7),61|v))^v;return((v^(v>>>14))>>>0)/4294967296;};}

/** 上游完整 rose(x,theta) 函数；Z 高度转为 Y，并缩放 3.25 倍、下移 .55。 */
export function roseSurface(x,theta){
  const phi=(PI/2)*Math.exp(-theta/(8*PI));
  const modulo=((3.6*theta)%TAU+TAU)%TAU;
  const X=1-0.5*Math.pow(1.25*Math.pow(1-modulo/PI,2)-0.25,2);
  const y=1.95653*x*x*Math.pow(1.27689*x-1,2)*Math.sin(phi);
  const r=X*(x*Math.sin(phi)+y*Math.cos(phi));
  return [r*Math.sin(theta)*3.25,
    X*(x*Math.cos(phi)-y*Math.sin(phi))*3.25-0.55,
    r*Math.cos(theta)*3.25];
}

/** 在真实参数位置求局部法线，尤其不能给瓣缘沿用随机瓣面的法线。 */
function surfaceNormal(x,theta){
  const a=roseSurface(x-1e-4,theta),b=roseSurface(x+1e-4,theta);
  const c=roseSurface(x,theta-1e-4),d=roseSurface(x,theta+1e-4);
  const u=b.map((v,k)=>v-a[k]),v=d.map((n,k)=>n-c[k]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const length=Math.hypot(...n);
  return length>1e-10?n.map(value=>value/length):[0,1,0];
}

let cachedSurface;
function getSurface(){
  if(cachedSurface)return cachedSurface;
  const angularSteps=640, radialSteps=38;
  const nodes=[];
  for(let row=0;row<=radialSteps;row++)for(let col=0;col<=angularSteps;col++){
    const x=row/radialSteps, theta=-2*PI+col/angularSteps*17*PI;
    nodes.push({p:roseSurface(x,theta),x,theta});
  }
  const triangles=[];let totalArea=0;
  function triangle(ia,ib,ic){
    const a=nodes[ia],b=nodes[ib],c=nodes[ic];
    const ab=b.p.map((v,i)=>v-a.p[i]),ac=c.p.map((v,i)=>v-a.p[i]);
    const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const length=Math.hypot(...cross),area=length*0.5;
    if(area<1e-8)return;
    totalArea+=area;
    triangles.push({a,b,c,normal:cross.map(v=>v/length),cumulative:totalArea});
  }
  for(let row=0;row<radialSteps;row++)for(let col=0;col<angularSteps;col++){
    const a=row*(angularSteps+1)+col,b=a+angularSteps+1;
    triangle(a,b,a+1);triangle(a+1,b,b+1);
  }
  // 边缘按真实轮廓长度采样，避免花心堆积、外层采不到粒子。
  const edges=[];let edgeLength=0;
  for(let i=0;i<angularSteps;i++){
    const a=nodes[radialSteps*(angularSteps+1)+i],b=nodes[radialSteps*(angularSteps+1)+i+1];
    edgeLength+=Math.hypot(...a.p.map((v,k)=>v-b.p[k]));
    edges.push({a,b,cumulative:edgeLength});
  }
  // 为卷起的花心保留较高采样密度，否则全瓣面按面积抽样会让内层太稀。
  const innerTriangles=[];let innerArea=0;
  for(const tri of triangles){
    if((tri.a.theta+tri.b.theta+tri.c.theta)/3<7.5*PI)continue;
    const a=tri.a.p,b=tri.b.p,c=tri.c.p;
    const ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]);
    const area=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])*.5;
    innerArea+=area;innerTriangles.push({...tri,cumulative:innerArea});
  }
  return cachedSurface={triangles,totalArea,innerTriangles,innerArea,edges,edgeLength,nodes,angularSteps,radialSteps};
}

/** 同一曲面的轻量深度网格，挡住背面粒子，保留真实花瓣前后关系。 */
export function createGitHubRoseMesh(){
  const {nodes,angularSteps,radialSteps}=getSurface();
  const opened=new Float32Array(nodes.length*3),closed=new Float32Array(nodes.length*3),layers=new Float32Array(nodes.length),petalRadius=new Float32Array(nodes.length);
  nodes.forEach((node,i)=>{
    opened.set(node.p,i*3);
    const radius=.55*Math.pow(Math.sin(PI*node.x),.7);
    closed.set([Math.sin(node.theta)*radius,node.x*2.15-.95,Math.cos(node.theta)*radius],i*3);
    layers[i]=clamp((node.theta+2*PI)/(17*PI))*3;
    petalRadius[i]=node.x; // 真实瓣缘参数，供曲面着色器描出卷瓣亮边。
  });
  const indices=[];
  for(let row=0;row<radialSteps;row++)for(let col=0;col<angularSteps;col++){
    const a=row*(angularSteps+1)+col,b=a+angularSteps+1;
    indices.push(a,b,a+1,a+1,b,b+1);
  }
  return{opened,closed,layers,petalRadius,indices:new Uint32Array(indices)};
}
function weightedSample(items,total,random){
  const target=random()*total;let low=0,high=items.length-1;
  while(low<high){const middle=(low+high)>>1;if(items[middle].cumulative<target)low=middle+1;else high=middle;}
  return items[low];
}

/** 所有数组只在初始化或改变粒子数时生成，动画完全在 GPU 上执行。 */
export function createGitHubRoseData(count,seed=20261012){
  const random=seededRandom(seed),surface=getSurface();
  const closed=new Float32Array(count*3),opened=new Float32Array(count*3);
  const sizes=new Float32Array(count),shades=new Float32Array(count),seeds=new Float32Array(count);
  const layers=new Float32Array(count),lights=new Float32Array(count),rims=new Float32Array(count);
  const drifts=new Float32Array(count);
  for(let i=0;i<count;i++){
    const inner=i%4===0; // 25% 保留螺旋花心，剩余仍覆盖外层花瓣。
    const tri=weightedSample(inner?surface.innerTriangles:surface.triangles,inner?surface.innerArea:surface.totalArea,random);
    let u=random(),v=random();if(u+v>1){u=1-u;v=1-v;}const w=1-u-v;
    let p=tri.a.p.map((n,k)=>n*w+tri.b.p[k]*u+tri.c.p[k]*v);
    let x=tri.a.x*w+tri.b.x*u+tri.c.x*v;
    let theta=tri.a.theta*w+tri.b.theta*u+tri.c.theta*v;
    let normal=tri.normal;
    const edgeSample=i%4===1; // 四分之一专门描出层层卷瓣轮廓。
    if(edgeSample){
      const edge=weightedSample(surface.edges,surface.edgeLength,random),t=random();
      p=edge.a.p.map((n,k)=>n+(edge.b.p[k]-n)*t);
      x=0.995;theta=edge.a.theta+(edge.b.theta-edge.a.theta)*t;
      normal=surfaceNormal(1,theta);
    }
    const thickness=(random()-0.5)*0.035;
    opened.set(p.map((n,k)=>n+normal[k]*thickness),i*3);
    const budRadius=0.55*Math.pow(Math.sin(PI*x),0.7);
    closed.set([Math.sin(theta)*budRadius,x*2.15-0.95,Math.cos(theta)*budRadius],i*3);
    const radial=Math.hypot(p[0],p[2]);
    const thetaFraction=clamp((theta+2*PI)/(17*PI));
    shades[i]=clamp(radial/3.0);
    seeds[i]=random()*TAU;
    sizes[i]=0.62+Math.pow(random(),5)*0.70;
    layers[i]=thetaFraction*3;
    drifts[i]=i%16===0?1:0; // 保留广阔散点范围，降低抢过花型的散点密度。
    lights[i]=0.35+0.65*Math.abs(normal[0]*-.3+normal[1]*.65+normal[2]*.7);
    rims[i]=edgeSample?1:smooth(0.82,0.98,x);
  }
  return{closed,opened,sizes,shades,seeds,layers,lights,rims,drifts};
}
