if (/FudoolAndroidUnified/.test(navigator.userAgent)) {
  document.documentElement.classList.add('fudool-android-shell');
}

const bySelector = (selector, root = document) => root.querySelector(selector);
const menu = bySelector('.mobile-nav');
menu.addEventListener('click', (event) => {
  if (event.target.closest('nav a')) menu.open = false;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    bySelector('summary', menu).focus();
  }
});
document.addEventListener('pointerdown', (event) => {
  if (menu.open && !menu.contains(event.target)) menu.open = false;
});

// The smaller homepage covers are optional on the web. The offline pack
// already contains the full covers referenced by each image's src.
for (const cover of document.querySelectorAll('img[srcset^="/assets/home-thumbnails/"]')) {
  const useOriginal = () => {
    cover.removeAttribute('srcset');
    cover.removeAttribute('sizes');
  };
  if (!navigator.onLine || (cover.complete && !cover.naturalWidth)) useOriginal();
  else cover.addEventListener('error', useOriginal, { once: true });
}

const filter = bySelector('[data-filter]');
if (filter) {
  const scope = filter.closest('[data-filter-scope]');
  const cards = [...scope.querySelectorAll('[data-category]')];
  const empty = bySelector('[data-empty]', scope);
  const practiceSections = [...document.querySelectorAll('[data-practice-kind]')];
  const buttons = [...filter.querySelectorAll('button')];
  filter.hidden = false;
  filter.addEventListener('click', (event) => {
    const button = event.target.closest('[data-kind]');
    if (!button) return;
    const kind = button.dataset.kind;
    buttons.forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
    cards.forEach((card) => { card.hidden = kind !== 'all' && kind !== card.dataset.category; });
    practiceSections.forEach((section) => { section.hidden = kind !== 'all' && kind !== section.dataset.practiceKind; });
    empty.hidden = cards.some((card) => !card.hidden);
  });
}

const loader = bySelector('[data-load-video]');
if (loader) {
  loader.hidden = false;
  loader.addEventListener('click', () => {
    const frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + loader.dataset.loadVideo + '?autoplay=1&playsinline=1';
    frame.title = loader.dataset.videoTitle;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    bySelector('[data-player]').replaceChildren(frame);
    loader.hidden = true;
    frame.focus();
  }, { once:true });
}

const printButton = bySelector('[data-print]');
if (printButton) {
  printButton.hidden = false;
  printButton.addEventListener('click', () => window.print());
}

function showAnswer(options, button, feedback, correct, messages) {
  const state = correct ? 'correct' : 'wrong';
  options.querySelectorAll('button').forEach((option) => delete option.dataset.state);
  button.dataset.state = state;
  feedback.dataset.state = state;
  feedback.textContent = correct ? messages.correct : messages.retry;
}

const letterQuestion = bySelector('[data-letter-question]');
if (letterQuestion) {
  const options = bySelector('.game-options', letterQuestion);
  const feedback = bySelector('[data-letter-feedback]', letterQuestion);
  const buttons = options.querySelectorAll('button');
  options.addEventListener('click', (event) => {
    const button = event.target.closest('[data-letter-answer]');
    if (!button) return;
    buttons.forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
    showAnswer(options, button, feedback, button.dataset.letterAnswer === 'correct', letterQuestion.dataset);
  });
  letterQuestion.hidden = false;
}

document.addEventListener('click', (event) => {
  const educationLink = event.target.closest('.learning-crosslinks a');
  if (educationLink && /FudoolAndroidUnified/.test(navigator.userAgent)) {
    const destination = new URL(educationLink.href);
    if (!/^\/(?:en\/)?(?:games|app|privacy|terms|faq)(?:\/|$)/.test(destination.pathname)) {
      event.preventDefault();
      const website = 'https://kokabfodool.com' + destination.pathname + destination.search + destination.hash;
      location.href = '/play-app/external/?url=' + encodeURIComponent(website);
    }
  }
  const link = event.target.closest('a[data-youtube]');
  if (link) document.dispatchEvent(new CustomEvent('fudool:youtube-click', {
    detail: { destination:link.dataset.youtube },
  }));
});

if (document.querySelector('.game-shell, .games-grid')) {
  import('/assets/world-art.js?v=1').then(({mountWorlds}) => mountWorlds());
}

// Share the app's six destinations and labels with the public website.
if (!document.body.classList.contains('v5-body')) {
  const english = document.documentElement.lang.toLowerCase().startsWith('en');
  const prefix = english ? '/en' : '';
  const labels = english
    ? ['Home', 'Games', 'Episodes', 'Stories', 'Achievements', 'More']
    : ['الرئيسية', 'الألعاب', 'الحلقات', 'الحكايات', 'الإنجازات', 'المزيد'];
  const destinations = [
    `${prefix}/`, `${prefix}/games/`, `${prefix}/episodes/`,
    english ? '/en/play-app/#v5-pages' : '/stories/',
    `${prefix}/play-app/#v5-achievements`, `${prefix}/play-app/#v5-more`,
  ];
  const icons = [
    '<svg viewBox="0 0 120 120" aria-hidden="true"><use href="/assets/fudool-premium-art.svg#home"></use></svg>',
    '<svg viewBox="0 0 120 120" aria-hidden="true"><use href="/assets/fudool-premium-art.svg#gamepad"></use></svg>',
    '<svg viewBox="0 0 120 120" aria-hidden="true"><use href="/assets/fudool-premium-art.svg#series"></use></svg>',
    '<img src="/assets/fudool-pages-cover.webp" alt="" width="30" height="30">',
    '<svg viewBox="0 0 120 120" aria-hidden="true"><use href="/assets/fudool-premium-art.svg#medal"></use></svg>',
    '<svg viewBox="0 0 120 120" aria-hidden="true"><use href="/assets/fudool-premium-art.svg#globe"></use></svg>',
  ];
  const current = location.pathname.replace(/^\/en(?=\/)/, '') || '/';
  const currentView = location.hash === '#v5-achievements' ? 4
    : location.hash === '#v5-more' ? 5
    : current.startsWith('/games/') ? 1
    : current.startsWith('/episodes/') ? 2
    : current.startsWith('/stories/') ? 3
    : current === '/' ? 0 : -1;
  const makeLinks = (parent, withIcons = false) => {
    if (!parent) return;
    parent.replaceChildren(...labels.map((label, index) => {
      const link = document.createElement('a');
      link.href = destinations[index];
      link.innerHTML = `${withIcons ? icons[index] : ''}<span>${label}</span>`;
      if (index === currentView) link.setAttribute('aria-current', 'page');
      return link;
    }));
  };
  makeLinks(document.querySelector('.desktop-nav'));
  makeLinks(document.querySelector('.mobile-nav nav'));
  const appNav = document.createElement('nav');
  appNav.className = 'site-bottom-nav';
  appNav.setAttribute('aria-label', english ? 'Main navigation' : 'التنقل الرئيسي');
  makeLinks(appNav, true);
  document.body.append(appNav);
  document.documentElement.classList.add('has-site-app-nav');
  const navStyles = document.createElement('link');
  navStyles.rel = 'stylesheet';
  navStyles.href = '/assets/site-mobile-nav.css?v=8';
  document.head.append(navStyles);

  if (!document.querySelector('.download-app-bubble')) {
    const download = document.createElement('a');
    download.className = 'download-app-bubble';
    download.href = '/downloads/apps/kawkab-fudool.apk';
    download.setAttribute('download', '');
    download.setAttribute('aria-label', english ? 'Download the Kokab Fodool Android app' : 'تحميل تطبيق كوكب فضول لأجهزة Android');
    download.innerHTML = `<span aria-hidden="true">↓</span> ${english ? 'Download app' : 'تحميل التطبيق'}`;
    document.body.append(download);
  }
}
