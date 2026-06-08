/**
 * qa-forms.js — functional QA via the real UI (forms/modals), not the API.
 * Adds offices, zones, teams through actual buttons + modal forms, places
 * seats, and asserts the computed KPIs/overflow are correct. Captures
 * screenshots of each step.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

function findBrowser() {
  const c = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of c) if (fs.existsSync(p)) return p;
  throw new Error('No browser found');
}
const BROWSER = findBrowser();
const APP_URL = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
}

// Fill a modal form: set inputs/selects/checkboxes by field name, then submit.
async function fillForm(page, values, submitLabel) {
  for (const [name, val] of Object.entries(values)) {
    await page.evaluate((n, v) => {
      const ctrl = document.querySelector('.modal-form [name="' + n + '"]');
      if (!ctrl) return;
      if (ctrl.type === 'checkbox') { ctrl.checked = !!v; }
      else {
        ctrl.value = String(v);
        ctrl.dispatchEvent(new Event('change', { bubbles: true }));
        ctrl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, name, val);
  }
  await page.evaluate((label) => {
    const btn = Array.from(document.querySelectorAll('.modal-footer .btn'))
      .find(b => new RegExp(label).test(b.textContent));
    if (btn) btn.click();
  }, submitLabel || 'Сохранить');
  await sleep(250);
}

async function clickByText(page, selector, text) {
  await page.evaluate((sel, t) => {
    const el = Array.from(document.querySelectorAll(sel)).find(e => e.textContent.trim().includes(t));
    if (el) el.click();
  }, selector, text);
  await sleep(250);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: BROWSER, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(400);
  // Close onboarding
  await clickByText(page, '.modal-footer .btn', 'Начать');

  // ─── 1. Add a NEW office via the Офисы tab ───
  await page.evaluate(() => App.render.setActiveTab('offices'));
  await sleep(200);
  await clickByText(page, '.section-head .btn, .btn', '+ Новый офис');
  await fillForm(page, { name: 'Офис Альфа', area: 1000 }, 'Сохранить');
  let officeCount = await page.evaluate(() => App.calc.getNewOffices(App.state.getActiveScenario()).length);
  check('Новый офис добавлен через форму', officeCount === 1, 'офисов: ' + officeCount);

  // Auto open-space zone should exist
  let autoZone = await page.evaluate(() => {
    const o = App.calc.getNewOffices(App.state.getActiveScenario())[0];
    return o.zones.length === 1 && o.zones[0].name === 'Опенспейс';
  });
  check('Авто-зона «Опенспейс» создана', autoZone);

  // ─── 2. Set zone capacity (мест) via zones editor ───
  await page.evaluate(() => {
    // open zones editor for the first new office
    const office = App.calc.getNewOffices(App.state.getActiveScenario())[0];
    // find the ▦ button in the office row; fallback: call editor opener if exposed
    const btns = Array.from(document.querySelectorAll('#tab-content .data-table .icon-btn'));
    const zbtn = btns.find(b => b.title === 'Зоны');
    if (zbtn) zbtn.click();
  });
  await sleep(300);
  // Edit the auto zone capacity -> 50
  await page.evaluate(() => {
    const editBtn = Array.from(document.querySelectorAll('.modal-body .icon-btn')).find(b => b.title === 'Изменить зону');
    if (editBtn) editBtn.click();
  });
  await sleep(250);
  await fillForm(page, { capacity: 50 }, 'Сохранить');
  // close zones editor
  await clickByText(page, '.modal-footer .btn', 'Готово');

  let cap = await page.evaluate(() => {
    const o = App.calc.getNewOffices(App.state.getActiveScenario())[0];
    return App.calc.calculateOfficeCapacity(o);
  });
  check('Вместимость зоны (мест) сохранена', cap === 50, 'вместимость: ' + cap);

  // ─── 3. Add a custom zone (Кабинеты, 30) ───
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#tab-content .data-table .icon-btn'));
    const zbtn = btns.find(b => b.title === 'Зоны');
    if (zbtn) zbtn.click();
  });
  await sleep(300);
  await clickByText(page, '.modal-body .btn', '+ Зона');
  await fillForm(page, { name: 'Кабинеты', type: 'cabinet', capacity: 30 }, 'Сохранить');
  await clickByText(page, '.modal-footer .btn', 'Готово');
  cap = await page.evaluate(() => App.calc.calculateOfficeCapacity(App.calc.getNewOffices(App.state.getActiveScenario())[0]));
  check('Вместимость офиса = сумма зон (50+30=80)', cap === 80, 'вместимость: ' + cap);
  await page.screenshot({ path: path.join(OUT, 'f1-offices.png') });

  // ─── 4. Add a team (45 чел.) via Команды tab ───
  await page.evaluate(() => App.render.setActiveTab('teams'));
  await sleep(200);
  await clickByText(page, '.section-head .btn, .btn', '+ Команда');
  await fillForm(page, { name: 'Команда А', employeesCount: 45, canSplit: true }, 'Сохранить');
  let teamN = await page.evaluate(() => App.teams.list().length);
  check('Команда добавлена через форму', teamN === 1, 'команд: ' + teamN);

  // ─── 5. Place 45 into a zone of capacity 80 -> no overflow; then 50 -> overflow ───
  await page.evaluate(() => {
    const off = App.calc.getNewOffices(App.state.getActiveScenario())[0];
    const team = App.teams.list()[0];
    App.allocations.addTeamAllocation(team.id, 45, off.id, off.zones[0].id, ''); // openspace cap 50
    App.render.render();
  });
  await sleep(200);
  let kpis = await page.evaluate(() => {
    const s = App.state.getActiveScenario();
    return App.calc.calculateScenarioKpis(s, App.validation.validateScenario(s));
  });
  check('Расчёт: распределено 45', kpis.placedInOffices === 45, 'placed: ' + kpis.placedInOffices);
  check('Расчёт: свободный резерв = 80-45 = 35', kpis.freeReserve === 35, 'reserve: ' + kpis.freeReserve);
  check('Расчёт: переполнения нет (45 в зоне 50)', kpis.zoneOverflow === 0, 'zoneOverflow: ' + kpis.zoneOverflow);

  // Now push the openspace zone over capacity: add 10 more (total 55 in cap-50 zone)
  await page.evaluate(() => {
    const off = App.calc.getNewOffices(App.state.getActiveScenario())[0];
    const team = App.teams.list()[0];
    App.allocations.addTeamAllocation(team.id, 10, off.id, off.zones[0].id, '');
    App.render.render();
  });
  await sleep(200);
  kpis = await page.evaluate(() => {
    const s = App.state.getActiveScenario();
    return App.calc.calculateScenarioKpis(s, App.validation.validateScenario(s));
  });
  check('Расчёт: переполнение зоны = 55-50 = 5', kpis.zoneOverflow === 5, 'zoneOverflow: ' + kpis.zoneOverflow);
  // Office cap 80, occupied 55 -> office not overflowed
  check('Расчёт: переполнение офиса = 0 (55<80)', kpis.officeOverflow === 0, 'officeOverflow: ' + kpis.officeOverflow);

  // ─── 6. Dashboard shows overflow text & warning ───
  await page.evaluate(() => App.render.setActiveTab('dashboard'));
  await sleep(300);
  let overflowText = await page.evaluate(() => document.body.innerText.includes('Переполнение: 5 мест'));
  check('Дашборд: текст «Переполнение: 5 мест»', overflowText);
  await page.screenshot({ path: path.join(OUT, 'f2-dashboard-overflow.png') });

  // ─── 7. Required seats = total - remote; total falls back to team headcount (45) ───
  check('Расчёт: всего сотрудников = 45 (по численности команды)', kpis.totalEmployees === 45, 'total: ' + kpis.totalEmployees);
  check('Расчёт: требуется мест = 45 (на удаленке 0)', kpis.requiredSeats === 45, 'required: ' + kpis.requiredSeats);

  console.log('\nPAGE ERRORS:', errors.length ? JSON.stringify(errors, null, 2) : 'none');
  const failed = results.filter(r => !r.ok);
  console.log('\nSUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  await browser.close();
  if (failed.length) process.exit(1);
})().catch(e => { console.error('QA FAILED:', e); process.exit(1); });
