/* 页面交互均在本地运行；证书与项目不需要第三方接口。 */
const all = (s) => [...document.querySelectorAll(s)];
const theme = document.querySelector('#themeToggle');
try { document.documentElement.dataset.theme = localStorage.getItem('portfolioTheme') || 'dark'; } catch {}
function syncTheme(){theme.textContent=document.documentElement.dataset.theme==='dark'?'浅色模式':'深色模式';}
syncTheme();
theme.addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('portfolioTheme',document.documentElement.dataset.theme);}catch{}syncTheme();});
const burger=document.querySelector('#burger'), nav=document.querySelector('#navLinks');
burger.addEventListener('click',()=>{const open=nav.classList.toggle('open');burger.setAttribute('aria-expanded',String(open));});
all('#navLinks a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');burger.setAttribute('aria-expanded','false');}));
document.querySelector('#printBtn').addEventListener('click',()=>window.print());
document.querySelector('#copyEmail').addEventListener('click',async e=>{const button=e.currentTarget;try{await navigator.clipboard.writeText('257172676@qq.com');button.textContent='邮箱已复制 ✓';}catch{document.querySelector('#copyStatus').textContent='邮箱：257172676@qq.com';}});
const filters=all('[data-filter]');
filters.forEach(b=>b.addEventListener('click',()=>{filters.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));all('.work-card').forEach(c=>{c.hidden=b.dataset.filter!=='all'&&!c.dataset.category.split(' ').includes(b.dataset.filter);});}));
const dialog=document.querySelector('#imageDialog');
function showImage(src,name){document.querySelector('#dialogImg').src=src;document.querySelector('#dialogImg').alt=name;document.querySelector('#dialogTitle').textContent=name;dialog.showModal();}
document.querySelector('#closeDialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
all('[data-image]').forEach(b=>b.addEventListener('click',()=>showImage(b.dataset.image,b.dataset.title)));
async function loadCerts(){try{const r=await fetch('certificates.json');if(!r.ok)throw Error();const certs=await r.json();const host=document.querySelector('#certGrid');certs.forEach(c=>{const b=document.createElement('button');b.className='cert-item';b.type='button';const img=document.createElement('img');img.src=c.image;img.alt=c.name;img.loading='lazy';img.decoding='async';const name=document.createElement('span');name.textContent=c.name;b.append(img,name);b.addEventListener('click',()=>showImage(c.image,c.name));host.append(b);});}catch{document.querySelector('#certGrid').textContent='证书暂时无法载入，请稍后刷新。';}}
loadCerts();
const observer=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');observer.unobserve(e.target);}}),{threshold:.08});
all('.reveal').forEach(e=>observer.observe(e));
const sections=all('main section[id]');
const navObserver=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){all('#navLinks a').forEach(a=>a.classList.toggle('active',a.hash==='#'+e.target.id));}}),{rootMargin:'-15% 0px -65% 0px'});sections.forEach(s=>navObserver.observe(s));
window.addEventListener('scroll',()=>{const h=document.documentElement;document.querySelector('#progress').style.width=(h.scrollHeight>innerHeight?scrollY/(h.scrollHeight-innerHeight)*100:0)+'%';},{passive:true});
