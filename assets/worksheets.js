/* Filter the age-graded worksheet library without reloading the page. */
(() => {
  const toolbar = document.querySelector('[data-ws-filters]');
  const grid = document.querySelector('[data-ws-grid]');
  const count = document.querySelector('[data-ws-count]');
  if (!toolbar || !grid || !count) return;
  const buttons = [...toolbar.querySelectorAll('button[data-age]')];
  const cards = [...grid.querySelectorAll('.ws-card')];
  const total = cards.length;
  const label = (n) => document.documentElement.lang === 'ar'
    ? `${n} ${n === 1 ? 'ورقة' : 'ورقة ومجموعة'}`
    : `${n} ${n === 1 ? 'worksheet' : 'worksheets'}`;
  const apply = (age) => {
    let shown = 0;
    for (const card of cards) {
      const ages = (card.dataset.ages || '').split(/\s+/);
      const visible = !age || ages.includes(age);
      card.hidden = !visible;
      if (visible) shown += 1;
    }
    count.textContent = label(shown);
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.age === age));
  };
  for (const button of buttons) {
    button.addEventListener('click', () => apply(button.dataset.age));
  }
  apply('');
})();
