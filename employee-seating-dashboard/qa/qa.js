/**
 * qa.js — interactive visual QA for the seating dashboard.
 *
 * Dev-only tool (NOT part of the app — the app stays dependency-free vanilla
 * JS that runs from index.html via file://). Drives a locally installed
 * Chrome/Edge with puppeteer-core to open the real index.html, seed data
 * through the app's own API, switch tabs, and capture screenshots into
 * qa/shots/. Catches runtime/console errors that unit tests cannot.
 *
 * Usage:
 *   cd qa && npm install && node qa.js
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

// Locate a Chromium-based browser without downloading one.
function findBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('No Chrome/Edge found. Set BROWSER_PATH env var.');
}

const BROWSER = process.env.BROWSER_PATH || findBrowser();
// index.html lives one level up from qa/
const APP_PATH = path.resolve(__dirname, '..', 'index.html');
const APP_URL = 'file://' + APP_PATH.replace(/\\/g, '/');
const OUT = path.join(__dirname, 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name) });
  console.log('shot:', name);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(500);

  // Close onboarding.
  await page.evaluate(() => {
    const start = Array.from(document.querySelectorAll('.modal-footer .btn'))
      .find(b => /Начать/.test(b.textContent));
    if (start) start.click();
  });
  await sleep(300);
  await shot(page, '01-dashboard-empty.png');

  // Seed sample data through the app API (exercises real render paths).
  await page.evaluate(() => {
    App.offices.addNewOffice({ name: 'Новый офис B', area: 1200, zones: [
      { name: 'Опенспейс', type: 'open_space', capacity: 130 },
      { name: 'Кабинеты', type: 'cabinet', capacity: 40 },
      { name: 'VIP-кабинеты', type: 'vip', capacity: 10 }
    ]});
    App.teams.add({ name: 'Finance', employeesCount: 40, canSplit: true });
    App.teams.add({ name: 'Sales', employeesCount: 25, canSplit: true });
    const team = App.teams.list()[0];
    for (let i = 1; i <= 6; i++) {
      App.employees.add({ fullName: 'Сотрудник ' + i + ' Финансовый', teamId: team.id, position: 'Аналитик' });
    }
    const off = App.offices.list().find(o => o.type === 'new');
    App.allocations.addTeamAllocation(team.id, 30, off.id, off.zones[0].id, '');
    App.allocations.addTeamAllocation(App.teams.list()[1].id, 25, off.id, off.zones[1].id, '');
    App.render.render();
  });
  await sleep(400);
  await shot(page, '02-dashboard-data.png');

  await page.evaluate(() => App.render.setActiveTab('teams'));
  await sleep(300);
  await page.evaluate(() => {
    const btn = document.querySelector('#tab-content tbody .icon-btn');
    if (btn) btn.click();
  });
  await sleep(300);
  await shot(page, '03-teams-expanded.png');

  await page.evaluate(() => App.render.setActiveTab('distribution'));
  await sleep(300);
  await shot(page, '04-distribution.png');

  await page.evaluate(() => App.render.setActiveTab('comparison'));
  await sleep(300);
  await shot(page, '05-comparison.png');

  console.log('PAGE ERRORS:', errors.length ? JSON.stringify(errors, null, 2) : 'none');
  await browser.close();
  console.log('QA DONE — screenshots in qa/shots/');
})().catch(e => { console.error('QA FAILED:', e); process.exit(1); });
