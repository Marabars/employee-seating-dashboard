/* QA for iteration 6: phase offices, 4 KPIs, balance badges, money mode. */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

function findBrowser() {
  const c = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of c) if (fs.existsSync(p)) return p;
  throw new Error('No browser');
}
const APP_URL = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(400);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.modal-footer .btn')).find(x => /Начать/.test(x.textContent));
    if (b) b.click();
  });
  await sleep(200);

  // Seed: TO BE + AS IS offices with money, a team, allocations.
  await page.evaluate(() => {
    App.offices.addOffice('tobe', { name: 'iCity 31', area: 1768, rentPerSqm: 32000, opexPerSqm: 6000, indexationPct: 7,
      zones: [{ name: 'Опенспейс', type: 'open_space', capacity: 90 }, { name: 'Кабинеты', type: 'cabinet', capacity: 20 }, { name: 'VIP', type: 'vip', capacity: 7 }] });
    App.offices.addOffice('asis', { name: 'Нева 17', area: 1500, rentPerSqm: 25000, opexPerSqm: 5000, indexationPct: 5,
      zones: [{ name: 'Опенспейс', type: 'open_space', capacity: 120 }] });
    App.teams.add({ name: 'Finance', employeesCount: 40, canSplit: true });
    var off = App.calc.getTobeOffices(App.state.getActiveScenario())[0];
    var team = App.teams.list()[0];
    App.allocations.addTeamAllocation(team.id, 30, off.id, off.zones[0].id, '');
    App.render.render();
  });
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'i6-dashboard.png') });

  // Expand the TO BE office card + a zone.
  await page.evaluate(() => {
    var btn = document.querySelector('.office-card .office-card-head .icon-btn');
    if (btn) btn.click();
  });
  await sleep(200);
  await page.evaluate(() => {
    var z = document.querySelector('.office-card .zone-row-head');
    if (z) z.click();
  });
  await sleep(200);
  await page.screenshot({ path: path.join(OUT, 'i6-card-expanded.png') });

  // Money mode toggle.
  await page.evaluate(() => {
    var t = document.querySelector('.money-toggle input');
    if (t) { t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'i6-money.png') });

  // Offices tab (AS IS / TO BE sections).
  await page.evaluate(() => App.render.setActiveTab('offices'));
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'i6-offices.png') });

  console.log('PAGE ERRORS:', errors.length ? JSON.stringify(errors, null, 2) : 'none');
  await browser.close();
  console.log('QA DONE');
})().catch(e => { console.error('QA FAILED:', e); process.exit(1); });
