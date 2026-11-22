if (/FudoolAndroidUnified/.test(navigator.userAgent)) {
  document.documentElement.classList.add('fudool-android-shell');
}
(()=>{"use strict";
const ar=document.documentElement.lang==='ar',tr=(a,e)=>ar?a:e,pre=ar?'':'/en';
const views=[...document.querySelectorAll('[data-v5-view]')],nav=[...document.querySelectorAll('.v5-nav a')],detail=document.querySelector('#v5-series-detail'),series=document.querySelector('#v5-series'),latest=document.querySelector('#v5-latest'),popular=document.querySelector('#v5-popular');
const offline=location.hostname==='appassets.androidplatform.net'||/FudoolAndroidOffline|FudoolAndroidUnified/.test(navigator.userAgent),nativeApp=/FudoolAndroid/.test(navigator.userAgent);
const config={'arabic-letters':['الحروف العربية','Arabic letters','letters.webp','letter-match',true],'arabic-numbers':['الأرقام العربية','Arabic numbers','numbers.webp','counting',true],'english-fun':['الإنجليزية مع لُمعة','English with Lumaa','english-round.webp','english-abc',true],'english-numbers':['الأرقام الإنجليزية مع لُمعة','English numbers with Lumaa','english-numbers-badge.webp','counting',true],mishal:['مغامرات مشعال','Mishaal adventures','mishal.webp','world-mishaal',false],robo:['واو! مع روبّو','Wow with Robo','robo.webp','robo-lab',false],guess:['خمّن مع فضول','Guess with Fudool','guess.webp','sound-quiz',false],'what-if':['ماذا لو؟','What if?','what-if-cover.webp','space-journey',false],'short-stories':['القصص التعليمية','Learning stories','stories-round.webp','memory',false]};
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
function button(text,cls,fn){const b=node('button',cls,text);b.type='button';b.addEventListener('click',fn);return b}
function link(text,cls,href){const a=node('a',cls,text);a.href=href;return a}
function image(src){const im=node('img');im.src=src;im.alt='';im.loading='lazy';im.decoding='async';return im}
let promise;
function catalog(){return promise||(promise=fetch('/assets/app-learning-v5.json',{cache:offline?'default':'no-cache'}).then(r=>{if(!r.ok)throw Error('catalog');return r.json()}).catch(e=>{promise=null;throw e}))}
let token=0;
function showSeries(id,slug){
 const current=++token,c=config[id];detail.hidden=false;series.hidden=true;latest.hidden=true;if(popular)popular.hidden=true;detail.replaceChildren();
 detail.append(link(tr('كل السلاسل','All series'),'v5-text-button','#v5-watch'));
 const hero=node('div','v5-series-detail-hero'),copy=node('div');copy.append(node('h1','',c[ar?0:1]),node('p','',tr('شاهد الحلقات واختر نشاطك التالي.','Watch episodes and choose your next activity.')));hero.append(copy,image('/assets/'+c[2]));detail.append(hero);
 const holder=node('div','v5-detail-content');holder.append(node('p','app-note',tr('جاري تحميل الحلقات…','Loading episodes…')));detail.append(holder);
 catalog().then(data=>{if(current!==token)return;const group=data.series.find(x=>x.id===(id==='english-numbers'?'english-fun':id));if(!group)throw Error('series');const source=group[ar?'ar':'en'],local=id==='english-numbers'?{...source,episodes:source.episodes.filter(e=>e.category==='numbers')}:source;holder.replaceChildren();
 const actions=node('div','v5-detail-actions');actions.append(link(tr('العب وتدرّب','Play & practise'),'v5-series-open',pre+'/games/'+c[3]+'/'));if(c[4])actions.append(button(tr('أوراق العمل','Worksheets'),'v5-series-open',()=>openExternal(pre+(id==='english-numbers'?'/grown-ups/practice/english-numbers/':'/grown-ups/'))));if(id==='english-fun')actions.append(link(tr('الأرقام الإنجليزية','English numbers'),'v5-series-open','#v5-series-english-numbers'));if(local.playlist)actions.append(button(tr('قائمة يوتيوب','YouTube playlist'),'v5-series-open v5-yt-button',()=>openExternal(local.playlist)));holder.append(actions);
 if(slug){const ep=local.episodes.find(e=>e.route.endsWith('/'+slug+'/'));if(ep){const featured=node('article','v5-episode-focus'),body=node('div');body.append(node('h2','',ep.title),node('p','',tr('شاهد الحلقة مباشرة على يوتيوب.','Watch directly on YouTube.')),button(tr('شاهد الحلقة','Watch episode'),'v5-series-open v5-yt-button',()=>openExternal(ep.video||ep.route)));featured.append(image(ep.image),body);holder.append(featured)}}
 holder.append(node('h2','',tr('كل الحلقات','All episodes')+' · '+local.episodes.length));const grid=node('div','v5-detail-grid');local.episodes.forEach(ep=>{const item=button('','v5-episode',()=>openExternal(ep.video||ep.route));const art=node('span','v5-episode-art');const cover=image(ep.image);cover.alt=ep.title;art.append(cover,node('span','v5-play-circle','▶'));item.append(art,node('strong','',ep.title));grid.append(item)});holder.append(grid);
 }).catch(()=>{if(current===token)holder.replaceChildren(node('p','app-note',tr('تعذر تحميل المكتبة.','Could not load the library.')),button(tr('إعادة المحاولة','Retry'),'v5-series-open',()=>showSeries(id,slug)))})
}
function route(){const hash=location.hash||'#top';let view='home',match=hash.match(/^#v5-series-([a-z-]+)(?:\/([a-z0-9-]+))?$/);if(hash==='#v5-watch'||match&&config[match[1]])view='learn';else if(hash==='#v5-games')view='games';else if(hash==='#v5-achievements')view='achievements';else if(hash==='#v5-more')view='more';else if(hash==='#v5-worksheets')view='worksheets';else if(hash==='#v5-pages')view='stories';else if(hash==='#v5-pro')view='pro';
 views.forEach(v=>v.hidden=v.dataset.v5View!==view);const target={home:'#top',learn:'#v5-watch',games:'#v5-games',achievements:'#v5-achievements',more:'#v5-more',worksheets:'#v5-more',stories:'#v5-pages',pro:'#v5-pro'}[view];nav.forEach(a=>{if(a.getAttribute('href')===target)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});if(view==='learn'&&match&&config[match[1]])showSeries(match[1],match[2]);else{token++;detail.hidden=true;series.hidden=false;latest.hidden=false}window.scrollTo(0,0)}
// Native WebView can restore a deep scroll position after returning from a game.
if(nativeApp && 'scrollRestoration' in history) history.scrollRestoration='manual';
function resetGamesScroll(){
 if(location.hash!=='#v5-games')return;
 window.scrollTo(0,0);
 requestAnimationFrame(()=>window.scrollTo(0,0));
}
if(nativeApp){
 addEventListener('pageshow',resetGamesScroll);
 nav.filter(a=>a.getAttribute('href')==='#v5-games').forEach(a=>a.addEventListener('click',resetGamesScroll));
}
addEventListener('hashchange',route);route();
// Worksheets are first-class in-app content. Whitelisted PDF links open the native reader directly.
const worksheetRoot=document.querySelector('[data-worksheet-library]'),worksheetAge=document.querySelector('[data-worksheet-age]');
if(worksheetRoot){
 document.querySelectorAll('[data-v5-open-worksheets]').forEach(b=>b.addEventListener('click',()=>location.hash='#v5-worksheets'));
 document.querySelectorAll('[data-worksheet-back]').forEach(b=>b.addEventListener('click',()=>location.hash='#v5-more'));
 let worksheets=[];
 const safePdf=/^\/print\/(?:worksheets\/(?:3-4|5-6|7-8|9-10)\/worksheet-\d{2}|(?:ar|en)\/(?:arabic-letter-sounds|arabic-letters|arabic-numbers|count-the-stars|english-abc-sheet|english-letters|english-numbers))\.pdf$/;
 function renderWorksheets(){
  const age=Number(worksheetAge.value)||0;worksheetRoot.replaceChildren();
  const matches=worksheets.filter(w=>safePdf.test(ar?w.pdfAr:w.pdfEn)&&(!age||age>=w.ageMin&&age<=w.ageMax));
  if(!matches.length){worksheetRoot.append(node('p','app-note',tr('لا توجد أوراق لهذا العمر حاليًا.','No worksheets for this age yet.')));return}
  matches.forEach(w=>{const card=node('a','v5-worksheet-card');card.href=ar?w.pdfAr:w.pdfEn;card.setAttribute('aria-label',tr('افتح ورقة العمل: ','Open worksheet: ')+(ar?w.titleAr:w.titleEn));card.append(node('strong','',ar?w.titleAr:w.titleEn),node('span','',ar?w.skillAr:w.skillEn),node('small','',tr(`العمر ${w.ageMin}–${w.ageMax} · ${w.noteAr||''}`,`Ages ${w.ageMin}–${w.ageMax} · ${w.noteEn||''}`)));worksheetRoot.append(card)});
 }
 worksheetAge?.addEventListener('change',renderWorksheets);
 fetch('/assets/worksheets.json',{cache:offline?'default':'no-cache'}).then(r=>{if(!r.ok)throw Error('worksheets');return r.json()}).then(data=>{worksheets=Array.isArray(data.worksheets)?data.worksheets:[];renderWorksheets()}).catch(()=>worksheetRoot.replaceChildren(node('p','app-note',tr('تعذر تحميل أوراق العمل. حاول مجددًا.','Could not load worksheets. Please retry.'))));
}
document.querySelectorAll('[data-v5-episode]').forEach(b=>b.addEventListener('click',()=>{
 const [group,slug]=b.dataset.v5Episode.split('/');
 catalog().then(data=>{const item=data.series.find(g=>g.id===group)?.[ar?'ar':'en'].episodes.find(e=>e.route.endsWith('/'+slug+'/'));if(item)openExternal(item.video||item.route);}).catch(()=>{location.hash='v5-series-'+b.dataset.v5Episode});
}));
document.querySelectorAll('[data-v5-open-library]').forEach(b=>b.addEventListener('click',()=>series.scrollIntoView({block:'start'})));
// Open only configured HTTPS destinations. Android handles external browsing; offline assets stay local.
function openExternal(value){
 let u;try{u=new URL(value,'https://kokabfodool.com')}catch{return}
 const tiktok = u.origin === 'https://www.tiktok.com' && u.pathname === '/@kokab_fodool';
 if((!tiktok && !['https://kokabfodool.com','https://www.youtube.com','https://youtube.com','https://m.youtube.com','https://youtu.be','https://www.instagram.com','https://wa.me'].includes(u.origin))||u.username||u.password)return;
 if(nativeApp)location.assign('/play-app/external/?url='+encodeURIComponent(u.href));else location.assign(u.href);
}
document.querySelectorAll('[data-v5-external]').forEach(b=>b.addEventListener('click',()=>openExternal(b.dataset.v5External)));
const badges=document.querySelector('[data-v5-badges]');if(badges){const stats=document.querySelector('[data-app-stats]');function renderBadges(){const nums=[...stats.querySelectorAll('strong')].map(e=>Number(e.textContent)||0);if(nums.length<3)return;badges.replaceChildren();[['star',nums[0]>=1,tr('أول نجمة','First star')],['medal',nums[0]>=10,tr('مستكشف النجوم','Star explorer')],['crown',nums[1]>=10,tr('بطل التعلّم','Learning hero')],['globe',nums[2]>=5,tr('مغامر فضول','Fudool adventurer')]].forEach(([id,won,title])=>{const card=node('article','v5-badge'+(won?'':' locked'));const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),use=document.createElementNS(ns,'use');svg.setAttribute('viewBox','0 0 120 120');use.setAttribute('href','/assets/learning-art.svg#'+id);svg.append(use);card.append(svg,node('strong','',title),node('small','',won?tr('تم الإنجاز','Earned'):tr('واصل اللعب','Keep playing')));badges.append(card)})}new MutationObserver(renderBadges).observe(stats,{childList:true,subtree:true});renderBadges()}
})();
