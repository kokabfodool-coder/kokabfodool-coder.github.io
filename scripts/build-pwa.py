"""Regenerate PWA icons, integration and the versioned offline games pack after site changes."""
import pathlib,json,hashlib,re,urllib.parse
from io import BytesIO
from PIL import Image,ImageOps,ImageDraw
root=pathlib.Path('.');assets=root/'assets'
logo=Image.open(assets/'brand.webp').convert('RGBA')
for size,name,fraction in [(192,'app-icon-192.png',.88),(512,'app-icon-512.png',.88),(512,'app-maskable-512.png',.64)]:
    icon=Image.new('RGBA',(size,size),'#f4efff')
    inner=ImageOps.contain(logo,(round(size*fraction),round(size*fraction)),Image.Resampling.LANCZOS)
    icon.alpha_composite(inner,((size-inner.width)//2,(size-inner.height)//2))
    icon.convert('RGB').save(assets/name,optimize=True)
# Use a smaller version for home-page cards while retaining the original for
# high-density screens, crawlers and every watch page.
home_pages = ('index.html', 'en/index.html')
cover_tags = re.compile(r'(<div class="episode-art portrait-cover">\s*<img)([^>]*)(>)')
thumbnail_width = 256
thumb_folder = assets / 'home-thumbnails'
existing_sources = {}

def responsive_home_covers(match):
    attributes = match[2]
    original = re.search(r'\bsrc="(/assets/([a-z0-9-]+)\.webp)"', attributes)
    if not original or 'loading="lazy"' not in attributes:
        return match[0]
    srcset = re.search(r'\bsrcset="([^"]*)"', attributes)
    if srcset:
        if not srcset[1].startswith('/assets/home-thumbnails/'):
            return match[0]
        attributes = re.sub(r'\s(?:srcset|sizes)="[^"]*"', '', attributes)
    plain = match[1] + attributes + match[3]
    original_url, stem = original.groups()
    if original_url not in existing_sources:
        thumbnail = thumb_folder / (stem + '-256w.webp')
        original_file = root / original_url.lstrip('/')
        with Image.open(original_file) as cover:
            if cover.width <= thumbnail_width:
                return plain
            height = round(cover.height * thumbnail_width / cover.width)
            output = BytesIO()
            image = cover.resize((thumbnail_width, height), Image.Resampling.LANCZOS)
            image.save(output, format='WEBP', quality=86, method=6)
            data = output.getvalue()
            if len(data) >= original_file.stat().st_size:
                return plain
            thumbnail.parent.mkdir(parents=True, exist_ok=True)
            thumbnail.write_bytes(data)
            existing_sources[original_url] = (thumbnail, cover.width)
    thumbnail, original_width = existing_sources[original_url]
    marker = '/' + thumbnail.as_posix()
    choices = f'{marker} {thumbnail_width}w, {original_url} {original_width}w'
    sizes = 'auto, (max-width: 599px) 22vw, (max-width: 899px) 21vw, 128px'
    src = 'src="' + original_url + '"'
    attributes = attributes.replace(src, src + f' srcset="{choices}" sizes="{sizes}"', 1)
    return match[1] + attributes + match[3]

for page_name in home_pages:
    homepage = root / page_name
    homepage.write_text(cover_tags.sub(responsive_home_covers, homepage.read_text()))

integration='<link rel="manifest" href="/manifest.webmanifest"/>\n<link rel="apple-touch-icon" href="/assets/app-icon-192.png"/>\n<link rel="stylesheet" href="/assets/pwa.css"/>\n<script defer src="/assets/pwa.js"></script>\n'
for p in root.rglob('index.html'):
    if '.git' in p.parts or 'build' in p.parts:continue
    s=p.read_text()
    if 'assets/site.js' not in s or 'name="robots" content="noindex' in s or 'content="noindex' in s:continue
    if '/manifest.webmanifest' not in s:s=s.replace('</head>',integration+'</head>',1)
    if p.as_posix() in ['index.html','en/index.html','games/index.html','en/games/index.html'] and 'data-pwa-slot' not in s:
        if p.as_posix() in ['index.html','en/index.html']:
            s=s.replace('<section class="home-stats-section"','<div class="wrap" data-pwa-slot></div>\n<section class="home-stats-section"',1)
        else:s=s.replace('<section class="age-journey"','<div data-pwa-slot></div>\n<section class="age-journey"',1)
    # Safe areas for installed mobile devices.
    s=s.replace('width=device-width,initial-scale=1"','width=device-width,initial-scale=1,viewport-fit=cover"')
    p.write_text(s)
# Refresh dependencies for every game engine and public page, including existing offline clients.
for p in assets.glob('*.js'):
    s=p.read_text()
    s=re.sub(r'(game-progress\.js\?v=)\d+',lambda m:m[1]+'16',s)
    s=re.sub(r'(game-extra\.js\?v=)\d+',lambda m:m[1]+'21',s)
    s=re.sub(r'(game-age-paths\.js\?v=)\d+',lambda m:m[1]+'6',s)
    p.write_text(s)
level_counts = {}
round_count = 0
for p in sorted((root / 'games').glob('*/index.html')):
    source = re.search(r'<script id="(?:game|drive|match)-data" type="application/json">(.*?)</script>', p.read_text(), re.S)
    levels = json.loads(source[1])['levels']
    level_counts[p.parent.name] = len(levels)
    round_count += sum(len(level['rounds']) for level in levels)
home_counts = [len(level_counts), sum(level_counts.values()), round_count]
age_style='<link rel="stylesheet" href="/assets/game-age-paths.css?v=2"/>\n'
for p in root.rglob('index.html'):
    if '.git' in p.parts or 'build' in p.parts:continue
    s=p.read_text()
    s=re.sub(r'(/assets/pwa\.(?:js|css))(?:\?v=\d+)?(?=["\'])',lambda m:m[1]+'?v=2',s)
    if re.fullmatch(r'(?:en/)?games/[^/]+/index\.html',p.as_posix()):
        s=re.sub(r'<link rel="stylesheet" href="/assets/game-age-paths\.css\?v=\d+"\s*/?>\n?', '', s)
        s=s.replace('</head>',age_style+'</head>',1)
    if p.as_posix() in home_pages:
        stats = r'(<li class="home-stat home-stat-([1-3])"[^>]*>.*?<strong dir="ltr">)[\d,]+(</strong>)'
        s = re.sub(stats, lambda m: m[1] + format(home_counts[int(m[2])-1], ',') + m[3], s)
    s=re.sub(r'(data-game-id="([a-z-]+)" data-level-count=")\d+',lambda m:m[1]+str(level_counts[m[2]]),s)
    s=re.sub(r'(/assets/age-journey\.js\?v=)\d+',lambda m:m[1]+'11',s)
    # Bump entry points whose imports were changed.
    for name,ver in [('games',22),('letter-match',19),('vowel-drive',22),('interactive-games',15),('planet-adventures',14),('sound-world',9),('game-progress',16),('app-experience',9)]:
        s=re.sub(r'(/assets/'+name+r'\.js\?v=)\d+',lambda m:m[1]+str(ver),s)
    p.write_text(s)
# Pack includes the current canonical app/game pages, all local media and code required by the games.
pages=['/','/en/','/games/','/en/games/','/app/','/en/app/','/play-app/','/en/play-app/','/app/family/','/en/app/family/','/app/settings/','/en/app/settings/','/app/credits/','/en/app/credits/','/offline/','/en/offline/','/grown-ups/','/en/grown-ups/','/grown-ups/worksheets/','/en/grown-ups/worksheets/','/episodes/','/en/episodes/','/privacy/','/en/privacy/','/terms/','/en/terms/','/faq/','/en/faq/']
pages += ['/shorts/','/en/shorts/','/series/mishal/','/en/series/mishal/','/series/mishal/water-resources/','/en/series/mishal/water-resources/']
for prefix in ['', 'en/']:
    pages += ['/'+p.parent.as_posix()+'/' for p in (root/(prefix+'games')).glob('*/index.html')]
assert len([x for x in pages if re.match(r'^/(?:en/)?games/[^/]+/$',x)])==40
files={u:root/(u.lstrip('/')+'index.html') for u in pages}
files['/manifest.webmanifest']=root/'manifest.webmanifest'
for story_path in sorted((root / 'stories').rglob('*')):
    if story_path.is_file() and story_path.suffix in {'.html', '.json', '.webp'}:
        url = '/' + story_path.as_posix()
        files[url.removesuffix('index.html')] = story_path
# Worksheet PDFs open inside the Android shell, so every linked sheet must ship in the pack.
for worksheet in json.loads((assets / 'worksheets.json').read_text())['worksheets']:
    for key in ('pdfAr', 'pdfEn'):
        url = worksheet.get(key)
        if url:
            files[urllib.parse.quote(url, safe='/')] = root / urllib.parse.unquote(url.lstrip('/'))
# Keep responsive covers available for the home pages in WebView and in the PWA.
for thumbnail, _ in existing_sources.values():
    files['/' + thumbnail.as_posix()] = thumbnail
# All original audio variants are retained, including old references that may still occur.
for p in assets.rglob('*'):
    if thumb_folder in p.parents:
        continue
    if p.is_file() and p.suffix.lower() in {'.js','.css','.svg','.webp','.png','.jpg','.jpeg','.mp3','.ogg','.wav','.woff2','.json'}:
        files['/'+urllib.parse.quote(p.as_posix(),safe='/')]=p
h=hashlib.sha256();total=0
for url,p in sorted(files.items()):
    assert p.is_file(),(url,p)
    data=p.read_bytes();h.update(url.encode());h.update(hashlib.sha256(data).digest());total+=len(data)
pack={'version':h.hexdigest()[:16],'bytes':total,'files':sorted(files)}
(root/'offline-pack.json').write_text(json.dumps(pack,ensure_ascii=False,separators=(',',':'))+'\n')
print('Offline pack:',len(files),'files',total,'bytes, release',pack['version'])
