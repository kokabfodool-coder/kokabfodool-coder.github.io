#!/usr/bin/env python3
"""Build bilingual learning guides, page JSON-LD, and video discovery from the site catalog."""

from collections import defaultdict
from datetime import date
from html import escape, unescape
from html.parser import HTMLParser
from pathlib import Path
import json
import re
from urllib.parse import parse_qs, urlsplit
import xml.etree.ElementTree as ET

from presence_copy import BRAND, DESCRIPTION, GAMES, PAGES, SERIES_RESOURCES

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://kokabfodool.com'
YT = 'https://www.youtube.com'
IG = 'https://www.instagram.com/KokabFodool/'
SCHEMA = 'https://schema.org'
XML_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
LANG_NS = 'http://www.w3.org/1999/xhtml'
VIDEO_NS = 'http://www.google.com/schemas/sitemap-video/1.1'
STYLE = '<link rel="stylesheet" href="/assets/learning-presence.css?v=1">\n'
LD = re.compile(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>\s*', re.S)
GAME_DATA = re.compile(r'<script id="(?:game|drive|match)-data" type="application/json">(.*?)</script>', re.S)
LEGACY_NAMES = {'Kawkab Fudool': 'Kokab Fodool'}
ASSET_ID = SITE + '/#organization'
SITE_ID = SITE + '/#website'
APP_ID = SITE + '/app/#android'


def script_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')


def to_route(lang, section=''):
    base = '' if lang == 'ar' else '/en'
    section = section.strip('/')
    return base + '/' + (section + '/' if section else '')


def target(route):
    return ROOT / route.lstrip('/') / 'index.html'


def tr(lang, ar, en):
    return ar if lang == 'ar' else en


def current_text(text):
    for legacy, current in LEGACY_NAMES.items():
        text = text.replace(legacy, current)
    return text


def inject_head(text, fragment):
    assert '</head>' in text
    return text.replace('</head>', fragment + '</head>', 1)


def block(text, name, content, before='</main>'):
    start = '<!-- learning-' + name + ' -->'
    end = '<!-- /learning-' + name + ' -->'
    marked = start + '\n' + content + '\n' + end + '\n'
    pattern = re.escape(start) + r'.*?' + re.escape(end) + r'\n?'
    if start in text:
        return re.sub(pattern, lambda _: marked, text, count=1, flags=re.S)
    assert before in text, name
    return text.replace(before, marked + before, 1)


class Metadata(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.title = ''
        self.meta = {}
        self.canonical = None
        self.lang = None
        self.inside = False
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'html':
            self.lang = values.get('lang')
        if tag == 'title':
            self.inside = True
        if tag == 'meta':
            self.meta[values.get('name', values.get('property'))] = values.get('content', '')
        if tag == 'link' and values.get('rel') == 'canonical':
            self.canonical = values.get('href')

    def handle_endtag(self, tag):
        if tag == 'title':
            self.inside = False

    def handle_data(self, value):
        if self.inside:
            self.title += value

    @property
    def public(self):
        return self.canonical and not any('noindex' in self.meta.get(key, '') for key in ('robots', 'bingbot', 'googlebot'))


def teaser(text):
    primary = re.search(r'<h1\b[^>]*>(.*?)</h1>', text, re.S)
    return unescape(re.sub(r'<[^>]+>', '', primary[1])).strip() if primary else Metadata(text).title


def link_list(lang, sections):
    links = []
    for section in dict.fromkeys(sections):
        route = to_route(lang, section)
        if section in PAGES:
            title = PAGES[section][lang == 'en'][0]
        else:
            page = target(route)
            assert page.is_file(), route
            title = teaser(current_text(page.read_text()))
        links.append('<a class="button button-white" href="' + route + '">' + escape(title) + '</a>')
    return '<div class="learning-crosslinks">' + ''.join(links) + '</div>'


def articles(sections, lang='ar'):
    def inline(text):
        value = escape(text)
        if lang == 'en':
            return re.sub(r'[؀-ۿ]+', lambda match: '<bdi lang="ar">' + match[0] + '</bdi>', value)
        return value
    return ''.join('<section><h2>' + inline(title) + '</h2><p>' + inline(label) + '</p></section>' for title, label in sections)


def make_page(lang, section, language_copy, links):
    title, description, chapters = language_copy
    route = to_route(lang, section)
    other = to_route('en' if lang == 'ar' else 'ar', section)
    source = current_text(target(to_route(lang, 'about')).read_text())
    header = re.search(r'<header class="site-head.*?</header>', source, re.S)[0]
    header = re.sub(r'(<a class="language" href=")[^"]+', lambda m: m[1] + other, header, count=1)
    footer = re.search(r'<footer class="site-foot".*?</footer>', source, re.S)[0]
    font_files = ('noto-arabic.woff2', 'noto-arabic-bold.woff2') if lang == 'ar' else ('nunito.woff2',)
    font_preloads = [
        '<link rel="preload" href="/assets/' + file + '" as="font" type="font/woff2" crossorigin>'
        for file in font_files
    ]
    tags = [
        '<!doctype html><html lang="' + lang + '" dir="' + tr(lang, 'rtl', 'ltr') + '"><head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
        '<meta name="robots" content="index,follow,max-image-preview:large">',
        '<title>' + escape(title + ' | ' + BRAND[lang]) + '</title>',
        '<meta name="description" content="' + escape(description) + '">',
        '<link rel="icon" href="/assets/brand.webp" type="image/webp">',
        *font_preloads,
        '<link rel="stylesheet" href="/assets/site.css?v=14">',
        '<script defer src="/assets/site.js?v=16"></script>',
        STYLE.rstrip(),
        '<link rel="canonical" href="' + SITE + route + '">',
    ]
    for code, destination in [('ar', to_route('ar', section)), ('en', to_route('en', section)), ('x-default', to_route('ar', section))]:
        tags.append('<link rel="alternate" hreflang="' + code + '" href="' + SITE + destination + '">')
    tags.extend([
        '<meta property="og:site_name" content="' + escape(BRAND[lang]) + '">',
        '<meta property="og:type" content="website">',
        '<meta property="og:locale" content="' + tr(lang, 'ar_AE', 'en_US') + '">',
        '<meta property="og:title" content="' + escape(title) + '">',
        '<meta property="og:description" content="' + escape(description) + '">',
        '<meta property="og:url" content="' + SITE + route + '">',
        '<meta property="og:image" content="' + SITE + '/assets/share.webp">',
        '</head><body>',
        '<a class="skip" href="#main">' + tr(lang, 'تخطَّ إلى المحتوى', 'Skip to content') + '</a>',
        header,
        '<main id="main" tabindex="-1"><div class="wrap simple-page learning-document">',
        '<h1>' + escape(title) + '</h1><p class="lead">' + escape(description) + '</p>',
        articles(chapters, lang),
    ])
    if '/' in section:
        parent = section.split('/')[0]
        tags.append('<p><a href="' + to_route(lang, parent) + '">' + escape(PAGES[parent][lang == 'en'][0]) + '</a></p>')
    if section == 'contact':
        tags.append('<a class="button button-primary" href="' + IG + '" rel="noopener noreferrer" target="_blank">Instagram</a>')
    tags.append(link_list(lang, links) + '</div></main>')
    tags.extend([footer, '</body></html>'])
    return '\n'.join(tags) + '\n'


def ensure_style(text):
    return text if '/assets/learning-presence.css' in text else inject_head(text, STYLE)


def app_bubble(text, lang):
    label = tr(lang, 'تحميل التطبيق', 'Download app')
    description = tr(lang, 'تحميل تطبيق كوكب فضول لأجهزة Android', 'Download Kokab Fodool for Android')
    content = ('<a class="download-app-bubble" href="/downloads/apps/kawkab-fudool.apk" download aria-label="' +
               escape(description) + '"><span aria-hidden="true">↓</span> ' + label + '</a>')
    return ensure_style(block(text, 'download-app', content, before='</body>'))


def ages(text):
    value = re.search(r'<p[^>]*class="age-label"[^>]*>(.*?)</p>', text, re.S)
    if not value:
        return None
    numbers = [int(n) for n in re.findall(r'\d+', value[1])][:2]
    return '-'.join(map(str, numbers)) if len(numbers) == 2 else None


def video_id(url):
    parsed = urlsplit(url)
    assert parsed.netloc in ('www.youtube.com', 'youtube.com'), url
    result = parse_qs(parsed.query).get('v', [parsed.path.split('/')[-1]])[0]
    assert re.fullmatch(r'[\w-]{11}', result, re.ASCII), url
    return result


def duration(seconds):
    return 'PT' + str(seconds) + 'S'


def video_player(id):
    return 'https://www.youtube-nocookie.com/embed/' + id


def to_learning(lang, page_id, title, description, *, kind, age=None, topics=None):
    value = {
        '@type': 'LearningResource', '@id': page_id.replace('#page', '#resource'),
        'name': title, 'description': description, 'inLanguage': lang,
        'learningResourceType': kind, 'isPartOf': {'@id': page_id},
        'publisher': {'@id': ASSET_ID},
        'audience': {'@type': 'EducationalAudience', 'educationalRole': 'learner'},
    }
    if age:
        value['typicalAgeRange'] = age
    if topics:
        value['teaches'] = topics
    return value


def item_list(name, id, items):
    return {
        '@type': 'ItemList', '@id': id, 'name': name,
        'itemListElement': [{'@type': 'ListItem', 'position': i,
                            'name': title, 'url': SITE + route}
                           for i, (title, route) in enumerate(items, 1)],
    }


def graph_base(meta, section, old):
    lang = meta.lang
    canonical = meta.canonical
    page_id = canonical + '#page'
    title = meta.meta.get('og:title') or meta.title
    desc = meta.meta['description']
    desc = (desc or meta.title).strip()
    breadcrumbs = [row for row in old if row.get('@type') == 'BreadcrumbList']
    if not breadcrumbs and section:
        breadcrumbs = [{
            '@type': 'BreadcrumbList',
            'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': tr(lang, 'الرئيسية', 'Home'), 'item': SITE + to_route(lang)},
                {'@type': 'ListItem', 'position': 2, 'name': title, 'item': canonical},
            ],
        }]
    page_type = {
        'about': 'AboutPage', 'contact': 'ContactPage',
        'faq': 'FAQPage', 'episodes': 'CollectionPage', 'games': 'CollectionPage', 'learn': 'CollectionPage',
    }.get(section, 'CollectionPage' if re.fullmatch(r'series/[^/]+', section) else 'WebPage')
    page = {
        '@type': page_type, '@id': page_id, 'url': canonical, 'name': title,
        'description': desc, 'inLanguage': lang, 'isPartOf': {'@id': SITE_ID},
        'publisher': {'@id': ASSET_ID},
    }
    if breadcrumbs:
        breadcrumbs[0]['@id'] = canonical + '#breadcrumbs'
        page['breadcrumb'] = {'@id': breadcrumbs[0]['@id']}
    return page, breadcrumbs


def useful_age_paths(path, game):
    regex = r"^  (?:'([^']+)'|([a-z]+)): \{\n(.*?)^  \},"
    for first, second, block in re.findall(regex, path, re.S | re.M):
        if (first or second) == game:
            return re.findall(r"'(\d-\d+)' *: *\[(\d+), '([^']+)', '([^']+)'\]", block)
    return []


def show_game(text, lang, subject, curriculum):
    lesson = GAMES[subject]
    paths = useful_age_paths(curriculum, subject)
    assert paths, subject
    data = json.loads(GAME_DATA.search(text)[1])
    assert len(data['levels']) == int(paths[-1][1])
    text = re.sub(r'(<section\b[^>]*)(\sdata-level-map=)', r'\1 id="game-levels"\2', text, count=1) if 'id="game-levels"' not in text else text
    assert 'id="game-levels"' in text, subject
    rows = []
    first = 1
    count = len(data['levels'])
    for age, last, ar, en in paths:
        last = int(last)
        bounds = str(first) if first == last else str(first) + '–' + str(last)
        skill = tr(lang, ar, en)
        rows.append('<li><strong><bdi>' + age.replace('-', '–') + '</bdi> ' + tr(lang, 'سنوات', 'years') +
                    '</strong>' + escape(skill) + ' <span>(' + tr(lang, 'المستويات ', 'Levels ') +
                    '<bdi>' + bounds + '</bdi>)</span></li>')
        first = last + 1
    label = tr(lang, 'طريقة اللعب والمهارات', 'How to play and what you practise')
    guide = '<section class="wrap play-guide" id="game-guide"><h2>' + label + '</h2>'
    guide += '<p>' + escape(lesson[lang == 'en']) + '</p><ul>' + ''.join(rows) + '</ul>'
    guide += '<a class="button button-primary" href="#game-levels">' + tr(lang, 'العب الآن', 'Play now') + '</a>'
    guide += link_list(lang, lesson[2]) + '</section>'
    return ensure_style(block(text, 'play-guide', guide)), paths, count


def show_episode(text, lang, series, episode, meta):
    id = video_id(episode['video'])
    transcript = {
        'arabic-letters': tr(lang, 'يميّز صوت الحرف ويحدّد موضعه في الكلمة المصوّرة.', 'Recognise the letter sound and find it in the picture word.'),
        'arabic-numbers': tr(lang, 'يربط شكل الرقم بالعدد بعدّ العناصر واحدًا واحدًا.', 'Match the numeral to the quantity by counting each item.'),
        'english-fun': tr(lang, 'يربط اللفظ الإنجليزي بالصورة أو الرقم الذي ظهر في الحلقة.', 'Match the spoken English word to the picture or numeral in the episode.'),
        'robo': tr(lang, 'يصف ما رآه ويستخدم ملاحظة لشرح النتيجة.', 'Describe what happened and use an observation to explain the result.'),
        'guess': tr(lang, 'يتوقّع الإجابة من دليل في الصورة أو الصوت ويشرح اختياره.', 'Use a picture or sound clue to predict an answer and explain the choice.'),
        'what-if': tr(lang, 'يشرح كيف يمكن أن تتغيّر النتيجة إذا تغيّر شرط من شروط الموقف.', 'Explain how a change in the situation could affect the result.'),
        'mishal': tr(lang, 'يربط فكرة الحلقة بمثال في البيئة أو المجتمع.', 'Connect the episode’s idea to a real example from the environment or community.'),
        'short-stories': tr(lang, 'يرتّب حدثين من القصة ويصف كيف تصرّفت الشخصية.', 'Put two events in order and describe the character’s choice.'),
    }
    objective = transcript.get(series, tr(lang, 'يصف الفكرة التي تعلّمها ويقدم مثالًا.', 'Describe the idea and give one example.'))
    resources = SERIES_RESOURCES.get(series, ['learn', 'grown-ups'])
    outcome = '<section class="episode-objectives"><h2>' + tr(lang, 'هدف التعلّم', 'Learning goal') + '</h2>'
    outcome += '<p>' + escape(objective) + '</p>' + link_list(lang, resources) + '</section>'
    summary = '<div class="lesson-content">'
    assert summary in text, episode['route']
    if '<!-- learning-episode-objectives -->' not in text:
        position = text.index(summary) + len(summary)
        text = text[:position] + '<!-- learning-episode-objectives -->\n' + outcome + '\n<!-- /learning-episode-objectives -->\n' + text[position:]
    else:
        text = block(text, 'episode-objectives', outcome)
    if meta.get('embeddable') and 'data-load-video=' not in text:
        player = re.search(r'(<div class="button-row video-actions">)(.*?)(</div>)', text, re.S)
        assert player, episode['route']
        label = tr(lang, 'شغّل الفيديو هنا', 'Play video here')
        button = ('<button type="button" class="button button-white" data-load-video="' + id +
                  '" data-video-title="' + escape(episode['title']) + '" hidden>' + label + '</button>')
        note = tr(lang, 'يُحمّل مشغّل يوتيوب عند اختيار تشغيل الفيديو.', 'YouTube loads when you choose to play the video.')
        text = text[:player.end(2)] + button + player[3] + '<p class="video-note">' + note + '</p>' + text[player.end():]
    return ensure_style(text), objective


def replace_social(text, title, description, thumbnail):
    values = {
        'twitter:card': 'summary_large_image', 'twitter:title': title,
        'twitter:description': description, 'twitter:image': thumbnail,
    }
    pattern = r'<meta\s+[^>]*name=["\']twitter:(?:card|title|description|image)["\'][^>]*>\s*'
    text = re.sub(pattern, '', text, flags=re.I)
    return inject_head(text, ''.join('<meta name="' + key + '" content="' + escape(value) + '">\n' for key, value in values.items()))


def organization(channel):
    return {
        '@type': 'Organization', '@id': ASSET_ID, 'url': SITE + '/',
        'name': BRAND['ar'], 'alternateName': BRAND['en'], 'description': DESCRIPTION['ar'],
        'logo': {'@type': 'ImageObject', 'url': SITE + '/assets/app-icon-512.png', 'width': 512, 'height': 512},
        'sameAs': [YT + '/channel/' + channel, IG],
        'knowsLanguage': ['ar', 'en'],
    }


def website():
    return {
        '@type': 'WebSite', '@id': SITE_ID, 'url': SITE + '/',
        'name': BRAND['ar'], 'alternateName': BRAND['en'],
        'description': DESCRIPTION['ar'], 'inLanguage': ['ar', 'en'],
        'publisher': {'@id': ASSET_ID},
    }


def about_refresh(text, lang):
    sections = [
        (tr(lang, 'كيف تتعلّم العائلة على المنصة', 'How families use the platform'),
         tr(lang, 'يمكن البدء بحلقة واحدة، ثم اختيار لعبة على المهارة نفسها حسب العمر. وتساعد أوراق العمل على متابعة النشاط في المنزل أو الصف.',
             'Start with one episode, then choose a game on the same skill by age. Printable worksheets carry the activity into the home or classroom.')),
        (tr(lang, 'مكان واحد للقناة والألعاب والتطبيق', 'The series, games and app'),
         tr(lang, 'تعرض كوكب فضول الحلقات على قناتها الرسمية. ويجمع الموقع مواد التعلم وروابطها وتطبيق Android الذي يتيح اللعب دون اتصال.',
             'Kokab Fodool publishes episodes on its official channel. The site brings the learning materials and the offline-capable Android app together.')),
    ]
    section = '<div class="wrap learning-document">' + articles(sections)
    section += link_list(lang, ['learn', 'episodes', 'app', 'content-policy', 'contact', 'faq']) + '</div>'
    return ensure_style(block(text, 'about', section))


def app_details(text, lang, version, release_date):
    date = tr(lang, '16 نوفمبر 2026', '16 November 2026') if release_date == '2026-11-16' else release_date
    specs = articles([
        (tr(lang, 'الألعاب المتاحة دون إنترنت', 'Games available offline'),
         tr(lang, 'يضم التطبيق 20 لعبة للحروف والأرقام والذاكرة والعلوم والبرمجة وغيرها. تُثبّت الألعاب وملفاتها داخل تطبيق Android. يعمل حفظ التقدم بحسب الملف المختار على الجهاز.',
              'The app includes 20 games for letters, numbers, memory, science, coding and more. Android installs the games and their assets together, and progress is saved in the chosen profile on the device.')),
        (tr(lang, 'الحلقات والروابط الخارجية', 'Episodes and external links'),
         tr(lang, 'تحتاج مشاهدة الحلقات وفتح الحسابات الخارجية إلى اتصال بالإنترنت. يفتح التطبيق روابط المشاهدة في تطبيق مناسب على الجهاز.',
              'Watching episodes and opening external accounts requires an internet connection. Android opens viewing links in a suitable app on the device.')),
    ])
    captions = {
        'robo': tr(lang, 'تجربة الثلج في مختبر روبو', 'Robo Lab’s melting ice experiment'),
        'drive': tr(lang, 'سيارة الحركات', 'Vowel Drive'),
        'memory': tr(lang, 'ذاكرة فضول', 'Fudool Memory'),
    }
    screens = []
    for slug, caption in captions.items():
        filename = ROOT / 'assets/app-previews' / (slug + '.webp')
        if filename.exists():
            screens.append('<figure><img src="/assets/app-previews/' + slug + '.webp" alt="' + escape(caption) +
                           '" width="390" height="844" loading="lazy" decoding="async"><figcaption>' +
                           escape(caption) + '</figcaption></figure>')
    gallery = ('<section class="app-device-gallery"><h2>' + tr(lang, 'لقطات من تطبيق Android', 'Screens from the Android app') +
               '</h2><div class="app-device-grid">' + ''.join(screens) + '</div></section>') if screens else ''
    notes = '<section><h2>' + tr(lang, 'سجل التحديثات', 'Release notes') + '</h2><ul>'
    notes += '<li><bdi>' + version + '</bdi> · <time datetime="' + release_date + '">' + date + '</time> · '
    notes += tr(lang, 'مستويات للصوت واسم للاعب وتشجيع شخصي ونقل التقدّم بملف قابل للاستعادة.',
                'Separate audio levels, a player nickname, personal encouragement and a transferable progress file.') + '</li>'
    notes += '<li><bdi>6.6.0</bdi> · ' + tr(
        lang, 'توحيد الاسم والروابط التعليمية في واجهة الموقع والتطبيق.',
        'Brand name and education links aligned across the site and app.') + '</li>'
    notes += '<li><bdi>6.5.0</bdi> · ' + tr(
        lang, 'تجربة الثلج ومسار السيارة والإملاء ومطابقة الذاكرة وفواتير المتجر ومهام الفضاء.',
        'Melting ice, steering, dictation, memory matching, market receipts and space missions.') + '</li></ul></section>'
    content = '<div class="wrap learning-document">' + specs + gallery + notes
    content += link_list(lang, ['privacy', 'terms', 'faq']) + '</div>'
    detail = tr(lang, 'الإصدار ', 'Version ') + version
    text = text.replace(
        'لأجهزة أندرويد فقط. حدّث النسخة السابقة بدون نت دون حذفها للحفاظ على تقدمك. النسخة الأونلاين القديمة مستقلة.',
        'لأجهزة Android. ثبّت التحديث فوق النسخة الحالية للحفاظ على تقدم اللعب.')
    text = re.sub(r'(<p\b[^>]*data-release-detail[^>]*>).*?(</p>)', lambda m: m[1] + detail + m[2], text, count=1, flags=re.S)
    return ensure_style(block(text, 'app', content))


def privacy_refresh(text, lang, embeds_enabled, parent_backup_enabled):
    sections = [
        (tr(lang, 'محتوى الأطفال والروابط', 'Children’s content and links'),
         tr(lang, 'الألعاب لا تتطلب حسابًا على الموقع. تحفظ نقاط اللعب وإعداداته محليًا على الجهاز. يظهر غلاف الحلقة من الموقع، ويتصل مشغّل يوتيوب بخدمته عند طلب تشغيل الفيديو. تتبع المواقع الأخرى سياساتها عند فتحها.',
             'The games do not require a site account. Game progress and settings are saved locally. Episode covers load from this site, and the YouTube player connects to YouTube when a visitor requests playback. External sites apply their own policies when opened.')),
        (tr(lang, 'إدارة البيانات المحلية', 'Manage local data'),
         tr(lang, 'يمكن للبالغ إزالة تقدم اللعب وملفات الحزمة من إعدادات بيانات الموقع أو التطبيق على الجهاز. تواصل عبر رابط البالغين عند وجود استفسار عن الخصوصية.',
             'An adult can remove progress and downloaded game files through the site or app data settings on the device. Use the adult contact link for a privacy question.')),
    ]
    if parent_backup_enabled:
        sections.append((
            tr(lang, 'النسخ الاحتياطي لحساب ولي الأمر', 'Parent account and progress backups'),
            tr(lang,
               'يمكن لولي الأمر إنشاء حساب اختياري في تطبيق Android. تستخدم خدمة Google Firebase البريد الإلكتروني لولي الأمر لتسجيل الدخول والتحقق من الحساب. عند اختيار حفظ نسخة احتياطية، تحفظ الخدمة نتائج المستويات المكتملة ونجومها. يبقى اسم الطفل وعمره وإعدادات الصوت على الجهاز. تبقى النسخ متاحة إلى أن يختار ولي الأمر حذف الحساب والنسخ عبر إعدادات التطبيق.',
               'A parent or guardian can create an optional account in the Android app. Google Firebase uses the adult’s email address for sign-in and account verification. When the adult chooses to save a backup, the service stores completed-level scores and stars. The child’s name and age and the audio settings stay on the device. Backups remain available until the adult deletes the account and backups from the app’s settings.')))
    content = articles(sections)
    if not embeds_enabled:
        content = content.replace(
            'يظهر غلاف الحلقة من الموقع، ويتصل مشغّل يوتيوب بخدمته عند طلب تشغيل الفيديو.',
            'تظهر أغلفة الحلقات من الموقع، وعند اختيار المشاهدة يفتح رابط يوتيوب.')
        content = content.replace(
            'Episode covers load from this site, and the YouTube player connects to YouTube when a visitor requests playback.',
            'Episode covers load from this site, and choosing to watch opens a link on YouTube.')
    return ensure_style(block(text, 'privacy-details', '<div class="wrap learning-document">' + content +
                              link_list(lang, ['contact', 'terms']) + '</div>'))


def enrich_home(text, lang, episodes, ranked):
    from PIL import Image
    for label, ordered in ranked.items():
        rows = []
        for id in ordered:
            item = episodes[id]
            with Image.open(ROOT / item['image'].lstrip('/')) as image:
                w, h = image.size
            rows.append('<article class="episode-card"><a href="' + item['route'] + '">'
                        '<div class="episode-art portrait-cover"><img src="' + item['image'] + '" alt="" width="' +
                        str(w) + '" height="' + str(h) + '" loading="lazy" decoding="async"></div>'
                        '<div class="episode-caption"><h3>' + escape(item['title']) + '</h3>'
                        '<span class="art-play" aria-hidden="true"><span class="play-icon"></span></span></div></a></article>')
        pattern = (r'(<section\b[^>]*id="' + label + r'-episodes"[^>]*>.*?'
                   r'<div class="episode-grid[^"]*">)(?:\s*<article class="episode-card">.*?</article>)*(</div>\s*(?:</div>\s*)?</section>)')
        text, count = re.subn(pattern, lambda m: m[1] + ''.join(rows) + m[2], text, count=1, flags=re.S)
        assert count == 1, (lang, label)
    label = tr(lang, 'تعلّم حسب الموضوع', 'Learn by topic')
    section = '<section class="section wrap"><h2>' + label + '</h2>'
    section += link_list(lang, ['learn', 'learn/arabic-vowels', 'learn/early-math', 'learn/simple-science']) + '</section>'
    return ensure_style(block(text, 'home-links', section))


def video_sitemap(eligible, destination):
    # ar pages provide one watch URL per original video. English counterparts are in hreflang.
    ET.register_namespace('', XML_NS)
    ET.register_namespace('video', VIDEO_NS)
    root = ET.Element('{' + XML_NS + '}urlset')
    for canonical, video in sorted(eligible):
        node = ET.SubElement(root, '{' + XML_NS + '}url')
        ET.SubElement(node, '{' + XML_NS + '}loc').text = canonical
        entry = ET.SubElement(node, '{' + VIDEO_NS + '}video')
        for name, value in (
            ('thumbnail_loc', video['thumbnailUrl']), ('title', video['name']),
            ('description', video['description'][:2048]), ('player_loc', video['embedUrl']),
            ('duration', video['duration'].removeprefix('PT').removesuffix('S')), ('publication_date', video['uploadDate']),
        ):
            ET.SubElement(entry, '{' + VIDEO_NS + '}' + name).text = str(value)
        ET.SubElement(entry, '{' + VIDEO_NS + '}family_friendly').text = 'yes'
    ET.indent(root, space='  ')
    destination.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(root).write(destination, encoding='UTF-8', xml_declaration=True)


def public_sitemap(urls):
    ET.register_namespace('', XML_NS)
    ET.register_namespace('xhtml', LANG_NS)
    root = ET.Element('{' + XML_NS + '}urlset')
    for canonical, lang in sorted(urls):
        path = canonical.removeprefix(SITE)
        section = path.removeprefix('/en') if lang == 'en' else path
        url = ET.SubElement(root, '{' + XML_NS + '}url')
        ET.SubElement(url, '{' + XML_NS + '}loc').text = canonical
        for code in ('ar', 'en', 'x-default'):
            loc = SITE + to_route('en' if code == 'en' else 'ar', section)
            ET.SubElement(url, '{' + LANG_NS + '}link', {'rel': 'alternate', 'hreflang': code, 'href': loc})
    ET.indent(root, space='  ')
    ET.ElementTree(root).write(ROOT / 'sitemap.xml', encoding='UTF-8', xml_declaration=True)


def build():
    published = json.loads((ROOT / 'scripts/youtube-public.json').read_text())
    videos = published['items']
    backup_config = ROOT / 'assets/parent-backup-config.json'
    parent_backup_enabled = backup_config.is_file() and bool(json.loads(backup_config.read_text()))
    catalog = json.loads((ROOT / 'assets/app-learning-v5.json').read_text())['series']
    curriculum = (ROOT / 'assets/game-age-paths.js').read_text()
    version = re.search(r'android:versionName="([^"]+)"', (ROOT / 'scripts/build-android.sh').read_text())[1]
    release_date = (ROOT / 'scripts/android-release-date.txt').read_text().strip()
    date.fromisoformat(release_date)
    episode_routes = {}
    in_series = defaultdict(list)
    by_lang = defaultdict(dict)
    for series in catalog:
        for lang in BRAND:
            for item in series[lang]['episodes']:
                route = item['route']
                by_lang[lang][video_id(item['video'])] = item
                episode_routes[route] = (series['id'], item)
                in_series[lang, series['id']].append((item['title'], route))
    ranked = {
        'latest': sorted(by_lang['ar'], key=lambda id: videos.get(id, {}).get('publishedAt', ''), reverse=True)[:4],
        'popular': sorted(by_lang['ar'], key=lambda id: videos.get(id, {}).get('viewCount') or -1, reverse=True)[:4],
    }
    for lang in BRAND:
        for section, values in PAGES.items():
            destination = target(to_route(lang, section))
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(make_page(lang, section, values[lang == 'en'], values[2]))

    for lang in BRAND:
        app = target(to_route(lang, 'play-app'))
        src = current_text(app.read_text())
        src = re.sub(r'(/assets/site\.js\?v=)\d+', r'\g<1>16', src)
        src = re.sub(r'(/assets/app-v5\.js\?v=)\d+', r'\g<1>10', src)
        def reel(id):
            item = by_lang[lang][id]
            gallery_key = item['route'].strip('/').split('/')[-2:]
            return ('<button class="v5-episode" type="button" data-v5-episode="' + '/'.join(gallery_key) +
                    '"><span class="v5-episode-art"><img src="' + item['image'] +
                    '" alt="" loading="lazy" decoding="async"><span class="v5-play-circle" aria-hidden="true">'
                    '<span class="play-icon"></span></span></span><strong>' + escape(item['title']) + '</strong></button>')
        latest = ''.join(reel(id) for id in ranked['latest'])
        popular = ''.join(reel(id) for id in ranked['popular'])
        pattern = r'(<section class="v5-section" id="v5-latest">.*?<div class="v5-episode-grid">).*?(</div>\s*</section>)'
        src, found = re.subn(pattern, lambda m: m[1] + latest + m[2], src, count=1, flags=re.S)
        assert found == 1
        heading = tr(lang, 'من الحلقات الأكثر مشاهدة', 'Most-watched episodes')
        extra = '<section class="v5-section" id="v5-popular"><h2>' + heading + '</h2><div class="v5-episode-grid">' + popular + '</div></section>'
        # Part of the watch view. Keep the detail view navigation and event handlers intact.
        marker = '<section class="v5-section" id="v5-latest">'
        src = block(src, 'app-popular', extra, before=marker)
        app.write_text(app_bubble(src, lang))

    for file in [ROOT / 'manifest.webmanifest', ROOT / 'assets/app-v5.js', ROOT / 'assets/app-learning-v5.json']:
        content = file.read_text()
        named = current_text(content)
        if content != named:
            file.write_text(named)

    # YouTube requires site-level child-directed designation before serving embeds.
    embeds_enabled = published.get('childDirectedDesignationVerified') is True
    media = []
    urls = []
    for path in sorted(ROOT.rglob('index.html')):
        if any(part in {'.git', 'build'} for part in path.relative_to(ROOT).parts):
            continue
        text = current_text(path.read_text())
        meta = Metadata(text)
        if not meta.public:
            if '/offline/' in path.as_posix() and meta.lang in BRAND:
                text = app_bubble(text, meta.lang)
            if text != path.read_text():
                path.write_text(text)
            continue
        lang = meta.lang
        canonical = meta.canonical
        route = canonical.removeprefix(SITE)
        section = (route.removeprefix('/en') if lang == 'en' else route).strip('/')
        urls.append((canonical, lang))
        titles = []
        for fragment in LD.findall(text):
            value = json.loads(fragment)
            titles.extend(value.get('@graph', [value]))
        page, graph = graph_base(meta, section, titles)
        graph.append(page)
        title = page['name']
        desc = page['description']
        page_id = page['@id']
        thumb = meta.meta.get('og:image') or SITE + '/assets/share.webp'
        if not section:
            graph.extend([website(), organization(published['channel'])])
            text = enrich_home(text, lang, by_lang[lang], ranked)
        elif section == 'about':
            page['about'] = {'@id': ASSET_ID}
            text = about_refresh(text, lang)
        elif section == 'app':
            app = {
                '@type': ['SoftwareApplication', 'MobileApplication'], '@id': APP_ID,
                'name': BRAND['ar'], 'alternateName': BRAND['en'],
                'description': desc, 'url': SITE + '/app/', 'applicationCategory': 'EducationalApplication',
                'operatingSystem': 'Android', 'softwareVersion': version, 'inLanguage': ['ar', 'en'],
                'downloadUrl': SITE + '/downloads/apps/kawkab-fudool.apk',
                'image': SITE + '/assets/app-icon-512.png', 'publisher': {'@id': ASSET_ID},
                'isAccessibleForFree': True, 'offers': {'@type': 'Offer', 'price': 0, 'priceCurrency': 'AED', 'url': SITE + '/app/'}
            }
            graph.append(app)
            page['mainEntity'] = {'@id': APP_ID}
            text = app_details(text, lang, version, release_date)
        elif section == 'privacy':
            text = privacy_refresh(text, lang, embeds_enabled, parent_backup_enabled)
        elif route in episode_routes:
            series, episode = episode_routes[route]
            id = video_id(episode['video'])
            published_video = videos.get(id, {})
            player = published_video if embeds_enabled else {}
            text, goal = show_episode(text, lang, series, episode, player)
            thumb = SITE + episode['image']
            lesson = to_learning(lang, page_id, title, desc, kind='Lesson', age=ages(text), topics=[goal])
            graph.append(lesson)
            page['mainEntity'] = {'@id': lesson['@id']}
            if published_video.get('embeddable') and published_video.get('publishedAt') and published_video.get('durationSeconds'):
                clip_language = 'en' if series == 'english-fun' else 'ar'
                video = {
                    '@type': 'VideoObject', '@id': canonical + '#video',
                    'name': episode['title'], 'description': desc, 'thumbnailUrl': thumb,
                    'uploadDate': published_video['publishedAt'],
                    'duration': duration(published_video['durationSeconds']), 'embedUrl': video_player(id),
                    'url': episode['video'], 'inLanguage': clip_language, 'isFamilyFriendly': True,
                    'publisher': {'@id': ASSET_ID},
                }
                if embeds_enabled:
                    graph.append(video)
                    page['video'] = {'@id': video['@id']}
                    lesson['video'] = {'@id': video['@id']}
                if lang == 'ar':
                    media.append((canonical, video))
        elif section.removeprefix('games/') in GAMES and section.startswith('games/'):
            slug = section.removeprefix('games/')
            text, paths, _ = show_game(text, lang, slug, curriculum)
            first = paths[0][0].split('-')[0]
            last = paths[-1][0].split('-')[-1]
            skills = [path[2 if lang == 'ar' else 3] for path in paths]
            lesson = to_learning(lang, page_id, title, desc, kind='Educational game', age=first + '-' + last, topics=skills)
            lesson['image'] = SITE + '/assets/worlds/' + slug + '.webp'
            graph.append(lesson)
            page['mainEntity'] = {'@id': lesson['@id']}
        elif re.fullmatch(r'series/[^/]+', section):
            series = section.split('/')[1]
            references = in_series[lang, series]
            if references:
                listing = item_list(title, canonical + '#episodes', references)
                graph.append(listing)
                page['mainEntity'] = {'@id': listing['@id']}
                text = ensure_style(block(text, 'series-links', '<div class="wrap">' +
                                          link_list(lang, SERIES_RESOURCES.get(series, ['learn', 'grown-ups'])) + '</div>'))
        elif section in {'episodes', 'games', 'learn'}:
            if section == 'episodes':
                references = [pair for (code, _), items in in_series.items() if code == lang for pair in items]
                targets = ['learn']
            elif section == 'games':
                references = [(teaser(current_text(target(to_route(lang, 'games/' + slug)).read_text())),
                               to_route(lang, 'games/' + slug)) for slug in GAMES]
                targets = ['learn', 'app']
            else:
                references = [(copy[lang == 'en'][0], to_route(lang, slug)) for slug, copy in PAGES.items() if slug.startswith('learn/')]
                targets = []
            listing = item_list(title, canonical + '#items', references)
            graph.append(listing)
            page['mainEntity'] = {'@id': listing['@id']}
            if targets:
                text = ensure_style(block(text, 'library-links', '<div class="wrap">' + link_list(lang, targets) + '</div>'))
        elif section.startswith('learn/') or section.startswith('grown-ups/practice/'):
            kind = 'Lesson' if section.startswith('learn/') else 'Worksheet'
            lesson = to_learning(lang, page_id, title, desc, kind=kind)
            graph.append(lesson)
            page['mainEntity'] = {'@id': lesson['@id']}
        elif section == 'grown-ups':
            text = ensure_style(block(text, 'family-links', '<div class="wrap">' +
                                      link_list(lang, ['learn', 'content-policy', 'faq']) + '</div>'))
        elif section == 'faq':
            answers = PAGES[section][lang == 'en'][2]
            page['mainEntity'] = [
                {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in answers
            ]
        text = re.sub(r'(/assets/site\.js\?v=)\d+', r'\g<1>16', text)
        text = replace_social(text, title, desc, thumb)
        text = LD.sub('', text)
        graph_tag = '<script type="application/ld+json">' + script_json({'@context': SCHEMA, '@graph': graph}) + '</script>\n'
        path.write_text(app_bubble(inject_head(text, graph_tag), lang))
    assert len(media) >= 1 and len({url for url, _ in urls}) == len(urls)
    public_sitemap(urls)
    public_video_map = ROOT / 'video-sitemap.xml'
    draft = ROOT / 'build/learning-preview'
    target_video_map = public_video_map if embeds_enabled else draft / 'video-sitemap.xml'
    video_sitemap(media, target_video_map)
    if not embeds_enabled:
        if public_video_map.is_file():
            public_video_map.unlink()
        examples = [{'@context': SCHEMA, **video} for _, video in media]
        (draft / 'video-schema.json').write_text(json.dumps(examples, ensure_ascii=False, indent=2) + '\n')
    robots = ROOT / 'robots.txt'
    video_map = 'Sitemap: ' + SITE + '/video-sitemap.xml'
    lines = [line for line in robots.read_text().splitlines() if line.strip() != video_map]
    if embeds_enabled:
        lines.append(video_map)
    robots.write_text('\n'.join(lines).rstrip() + '\n')
    print('Processed', len(urls), 'bilingual pages,', len(media), 'verified videos; embeds enabled:', embeds_enabled)


if __name__ == '__main__':
    build()
