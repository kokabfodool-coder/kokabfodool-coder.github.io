const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const server=cp.spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
const origin='http://127.0.0.1:8765';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let browser;
 try {
  for(let i=0;i<20;i++){try{await fetch(origin);break}catch{await sleep(250)}}
  browser=await chromium.launch({headless:true, executablePath:process.env.FUDOOL_CHROMIUM});
  fs.mkdirSync('build/v5-screenshots',{recursive:true});
  for(const lang of ['ar','en']) for(const width of [320,390,768,1280]){
   const page=await browser.newPage({viewport:{width,height:844}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+(lang==='ar'?'/play-app/':'/en/play-app/'),{waitUntil:'networkidle'});
   const visible=async v=>{await page.locator('[data-v5-view="'+v+'"]').waitFor({state:'visible',timeout:8000});};
   const fit=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'horizontal overflow '+lang+' '+width);
  await visible('home');await fit();
  assert.equal(await page.locator('.v5-cast-grid .v5-mascot-art').count(),4);
  assert.deepEqual(await page.locator('.v5-cast-grid img').evaluateAll(images=>images.map(image=>image.getAttribute('src').split('/').pop())),['mascot-lumaa.webp','mascot-fudool.webp','mascot-mishal.webp','robot.webp']);
  assert.equal(await page.locator('.v5-cast-grid > a').evaluateAll(cards=>new Set(cards.map(card=>Math.round(card.getBoundingClientRect().top))).size),width<=700?2:1);
  assert.equal(await page.locator('.v5-home-shortcuts .v5-shortcut').count(),1);
  assert.equal(await page.locator('.v5-home-shortcuts a[href*="shorts"]').count(),0);
  assert.equal(await page.locator('.v5-featured-scene .world-cover-scene').count(),3);
   assert.equal(await page.locator('.v5-nav use[href*="fudool-premium-art.svg"]').count(),5);
   assert((await page.locator('.v5-nav a[aria-current="page"]').count())===1);
   assert.equal(await page.locator('.v5-nav a').count(),6);
   assert.equal(await page.locator('.v5-nav a[href="#v5-pages"]').innerText(),lang==='ar'?'الحكايات':'Stories');
   const storyTab=page.locator('.v5-nav a[href="#v5-pages"]');
   const seriesTab=page.locator('.v5-nav a[href="#v5-watch"]');
   assert.equal(await seriesTab.innerText(),lang==='ar'?'الحلقات':'Episodes');
   assert.equal(await seriesTab.locator('use').getAttribute('href'),'/assets/fudool-premium-art.svg#series');
   await storyTab.click();await visible('stories');await fit();
   await page.locator('[data-v5-view="stories"] .pages-card').first().waitFor();
   assert.equal(await storyTab.getAttribute('aria-current'),'page');
   await page.locator('.v5-nav a[href="#top"]').click();await visible('home');
   assert.equal(await page.locator('.v5-daily use[href*="fudool-premium-art.svg#crown"]').count(),1);
   await page.screenshot({path:'build/v5-screenshots/'+lang+'-'+width+'-home.png',fullPage:true});
   await page.locator('.v5-nav a[href="#v5-watch"]').click();await visible('learn');await fit();
   assert.equal(await page.locator('#v5-series .v5-series').count(),9);
   await page.screenshot({path:'build/v5-screenshots/'+lang+'-'+width+'-learn.png',fullPage:true});
   await page.locator('a[href="#v5-series-arabic-letters"]').last().click();
   await page.waitForSelector('#v5-series-detail .v5-detail-grid .v5-episode');
   assert.equal(await page.locator('#v5-series-detail .v5-detail-grid .v5-episode').count(),19);
   await page.locator('.v5-nav a[href="#v5-games"]').click();await visible('games');await fit();
   assert.equal(await page.locator('[data-app-games] .app-game-card').count(),20);
   assert.equal(await page.locator('[data-app-games] .world-cover-scene').count(),20);
   await page.screenshot({path:'build/v5-screenshots/'+lang+'-'+width+'-games.png',fullPage:true});
   await page.locator('.v5-nav a[href="#v5-achievements"]').click();await visible('achievements');await fit();
   await page.waitForSelector('.v5-badge');assert.equal(await page.locator('.v5-badge').count(),4);
   await page.locator('.v5-nav a[href="#v5-more"]').click();await visible('more');await fit();
   assert.equal(await page.locator('.v5-social-card').count(),2);
   assert.equal(await page.locator('.v5-social-mini .v5-social').count(),2);
   await page.screenshot({path:'build/v5-screenshots/'+lang+'-'+width+'-more.png',fullPage:true});
   assert.deepEqual(errors,[],lang+' '+width+' JS errors');
   await page.close();
   console.log('PASS',lang,width,'six views / 20 games / catalogue / direct links / no overflow');
  }
  // Check shared art and actual level entry for all twenty games in both languages.
  const ids=["vowel-drive","letter-match","letter-hunt","counting","english-abc","memory","trace","robo-lab","puzzle","sound-quiz","fudool-shop","word-factory","lumaa-clock","code-robo","world-mishaal","planet-engineer","healthy-hero","space-journey","spot-differences","grand-challenge"];
  for(const lang of ['ar','en']){
   const page=await browser.newPage({viewport:{width:390,height:844}});
   const prefix=lang==='ar'?'':'/en';
   await page.goto(origin+prefix+'/games/',{waitUntil:'networkidle'});
   assert.equal(await page.locator('.premium-library-card .world-cover-scene').count(),20);
   for(const id of ids){
    await page.goto(origin+prefix+'/games/'+id+'/',{waitUntil:'domcontentloaded'});
    const map=page.locator('[data-level-map]');
    await map.waitFor({state:'visible',timeout:10000});
    const cover=page.locator('.premium-game-heading .world-cover-scene');
    await cover.waitFor({state:'visible'});
    assert(await cover.evaluate(async image=>{ await image.decode(); return image.naturalWidth===720; }),id+' cover');
    assert.equal(await page.locator('.premium-game-heading .world-cover-scene').count(),1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'game map overflow '+lang+' '+id);
    await map.locator('button.game-level:not(:disabled)').first().click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.game-board')].some(b=>!b.hidden&&!b.matches('.game-levels,.game-result')));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'game play overflow '+lang+' '+id);
    if(['vowel-drive','counting','robo-lab','space-journey','grand-challenge'].includes(id))await page.screenshot({path:'build/v5-screenshots/'+lang+'-game-'+id+'.png',fullPage:true});
   }
   await page.close();console.log('PASS website/game artwork and levels',lang,ids.length);
  }
  // Verify all catalog covers load on the website and in the actual application grids.
  const catalog=JSON.parse(fs.readFileSync('assets/app-learning-v5.json','utf8'));
  for(const lang of ['ar','en']){
   const page=await browser.newPage({viewport:{width:390,height:844}});
   const prefix=lang==='ar'?'':'/en';
   await page.goto(origin+prefix+'/app/',{waitUntil:'networkidle'});
   assert.equal(await page.locator('.apk-card').count(),1);
   assert.equal(await page.locator('[data-release-mode="unified"]').count(),1);
   assert.equal(await page.locator('[data-release-mode="offline"], [data-release-mode="online"]').count(),0);
   await page.goto(origin+prefix+'/episodes/',{waitUntil:'networkidle'});
   const coverCheck=async selector=>page.locator(selector).evaluateAll(imgs=>Promise.all(imgs.map(async image=>{
    image.loading='eager';
    try{await image.decode()}catch{}
    return {
     src:image.getAttribute('src'),
     route:image.closest('.episode-card')?.querySelector('a')?.getAttribute('href'),
     ok:image.naturalWidth>0&&image.naturalHeight>0,
     fit:getComputedStyle(image).objectFit,
    };
   })));
   const webCovers=await coverCheck('.episode-card .episode-art img');
   const episodes=catalog.series.flatMap(group=>group[lang].episodes);
   assert.equal(webCovers.length,episodes.length);
   assert(webCovers.every(cover=>cover.ok),JSON.stringify(webCovers.filter(cover=>!cover.ok)));
   assert.deepEqual(Object.fromEntries(webCovers.map(cover=>[cover.route,cover.src])),
    Object.fromEntries(episodes.map(episode=>[episode.route,episode.image])));
   assert(await page.locator('#english-number-episodes').count());
   await page.goto(origin+prefix+'/play-app/',{waitUntil:'networkidle'});
   for(const group of catalog.series){
    await page.evaluate(id=>location.hash='v5-series-'+id,group.id);
    const cards=page.locator('#v5-series-detail .v5-detail-grid .v5-episode');
    await cards.first().waitFor();
    await page.waitForFunction(n=>document.querySelectorAll('#v5-series-detail .v5-detail-grid .v5-episode').length===n,group[lang].episodes.length);
    const covers=await coverCheck('#v5-series-detail .v5-detail-grid .v5-episode-art img');
    assert.deepEqual(covers.map(cover=>cover.src),group[lang].episodes.map(episode=>episode.image));
    assert(covers.every(x=>x.ok&&x.fit==='contain'),JSON.stringify(covers.filter(x=>!x.ok||x.fit!=='contain')));
   }
   await page.evaluate(()=>location.hash='v5-series-english-numbers');
   await page.waitForFunction(()=>document.querySelector('#v5-series-detail h1')?.textContent.includes(document.documentElement.lang==='ar'?'الأرقام الإنجليزية':'English numbers'));
   await page.waitForSelector('#v5-series-detail .v5-detail-grid .v5-episode');
   assert.equal(await page.locator('#v5-series-detail .v5-detail-grid .v5-episode').count(),catalog.series.find(s=>s.id==='english-fun')[lang].episodes.filter(e=>e.category==='numbers').length);
   await page.screenshot({path:'build/v5-screenshots/'+lang+'-english-numbers.png',fullPage:true});
   await page.close();
   console.log('PASS website and app catalogue covers, English numbers',lang);
  }
  for(const lang of ['ar','en']) for(const mode of ['Unified']){
   const page=await browser.newPage({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 FudoolAndroid'+mode});
   let opened=null;
   await page.route('**/play-app/external/?url=*',async route=>{opened=new URL(route.request().url()).searchParams.get('url');await route.fulfill({status:200,body:'native interception simulated'})});
   const prefix=lang==='ar'?'':'/en';
   const home=origin+prefix+'/play-app/';
   await page.goto(home,{waitUntil:'networkidle'});
   assert.equal(await page.locator('#v5-gate').count(),0);
   await page.locator('.v5-nav a[href="#v5-watch"]').click();
   await page.locator('a[href="#v5-series-english-numbers"]').last().click();
   await page.waitForSelector('#v5-series-detail .v5-detail-grid .v5-episode');
   await page.locator('#v5-series-detail .v5-detail-grid .v5-episode').first().click();
   await page.waitForURL('**/play-app/external/?url=*');
   assert.equal(opened,catalog.series.find(s=>s.id==='english-fun')[lang].episodes[0].video);
   await page.goto(home,{waitUntil:'networkidle'});
   await page.locator('.v5-nav a[href="#v5-more"]').click();
   for(const host of ['www.youtube.com','www.instagram.com','www.tiktok.com','kokabfodool.com']){
    await page.locator('.v5-social-card[data-v5-external*="'+host+'"], .v5-social[data-v5-external*="'+host+'"]').click();
    await page.waitForURL('**/play-app/external/?url=*');
    assert.equal(new URL(opened).hostname,host);
    await page.goto(home,{waitUntil:'networkidle'});
    await page.locator('.v5-nav a[href="#v5-more"]').click();
   }
   await page.close();console.log('PASS direct episode and social navigation',lang,mode);
  }
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
