/* QA iter6 edit checks: edit office/zones, add employees to teams, named + unnamed. */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

function findBrowser() {
  const c = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'];
  for (const p of c) if (fs.existsSync(p)) return p;
  throw new Error('No browser');
}
const APP_URL = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond });
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
}
async function clickText(page, sel, text) {
  await page.evaluate((s, t) => {
    const el = Array.from(document.querySelectorAll(s)).find(e => e.textContent.trim().includes(t));
    if (el) el.click();
  }, sel, text);
  await sleep(200);
}
async function setField(page, name, val) {
  await page.evaluate((n, v) => {
    const c = document.querySelector('.modal-form [name="' + n + '"], .office-form [name="' + n + '"]');
    if (!c) return;
    if (c.type === 'checkbox') c.checked = !!v;
    else { c.value = String(v); c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); }
  }, name, val);
}

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
  await clickText(page, '.modal-footer .btn', 'Начать');

  // 1) Add an office through the Офисы tab form with inline zones.
  await page.evaluate(() => App.render.setActiveTab('offices'));
  await sleep(200);
  await clickText(page, '.phase-section.phase-tobe .btn', '+ Офис');
  await sleep(200);
  await setField(page, 'name', 'Тест-офис');
  await setField(page, 'area', 500);
  // set the first inline zone capacity to 25
  await page.evaluate(() => {
    var cap = document.querySelector('.form-zone-row input[type=number]');
    if (cap) { cap.value = '25'; cap.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  // add a second zone
  await clickText(page, '.form-zones .btn', '+ Зона');
  await page.evaluate(() => {
    var caps = document.querySelectorAll('.form-zone-row input[type=number]');
    if (caps[1]) { caps[1].value = '15'; caps[1].dispatchEvent(new Event('input', { bubbles: true })); }
  });
  var liveTotal = await page.evaluate(() => (document.querySelector('.form-zone-total') || {}).textContent || '');
  check('Форма офиса: живой итог вместимости (25+15=40)', /40/.test(liveTotal), liveTotal.trim());
  await clickText(page, '.modal-footer .btn', 'Сохранить');
  await sleep(200);
  var cap1 = await page.evaluate(() => {
    var o = App.calc.getTobeOffices(App.state.getActiveScenario()).filter(function (x) { return x.name === 'Тест-офис'; })[0];
    return o ? App.calc.calculateOfficeCapacity(o) : -1;
  });
  check('Офис создан с вместимостью = сумма зон (40)', cap1 === 40, 'cap=' + cap1);

  // 2) EDIT the office: change area + add a third zone via the form.
  await page.evaluate(() => {
    var rows = Array.from(document.querySelectorAll('#tab-content .data-table tbody tr'));
    var row = rows.find(function (r) { return r.textContent.includes('Тест-офис'); });
    var edit = row && Array.from(row.querySelectorAll('.icon-btn')).find(function (b) { return b.title === 'Редактировать'; });
    if (edit) edit.click();
  });
  await sleep(250);
  await setField(page, 'area', 600);
  await clickText(page, '.form-zones .btn', '+ Зона');
  await page.evaluate(() => {
    var caps = document.querySelectorAll('.form-zone-row input[type=number]');
    if (caps[2]) { caps[2].value = '10'; caps[2].dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await clickText(page, '.modal-footer .btn', 'Сохранить');
  await sleep(200);
  var afterEdit = await page.evaluate(() => {
    var o = App.calc.getTobeOffices(App.state.getActiveScenario()).filter(function (x) { return x.name === 'Тест-офис'; })[0];
    return { cap: App.calc.calculateOfficeCapacity(o), area: o.area, zones: o.zones.length };
  });
  check('Редактирование офиса: площадь обновлена (600)', afterEdit.area === 600, 'area=' + afterEdit.area);
  check('Редактирование офиса: добавлена 3-я зона, вместимость 40+10=50', afterEdit.cap === 50 && afterEdit.zones === 3, 'cap=' + afterEdit.cap + ' zones=' + afterEdit.zones);

  // 3) Teams: add a team of 40, then add 6 NAMED employees via the team detail.
  await page.evaluate(() => App.render.setActiveTab('teams'));
  await sleep(200);
  await clickText(page, '.section-head .btn', '+ Команда');
  await setField(page, 'name', 'Команда А');
  await setField(page, 'employeesCount', 40);
  await clickText(page, '.modal-footer .btn', 'Сохранить');
  await sleep(200);
  // expand team
  await page.evaluate(() => { var b = document.querySelector('#tab-content tbody .icon-btn'); if (b) b.click(); });
  await sleep(200);
  // add a named employee through "Добавить сотрудника с ФИО"
  for (var i = 0; i < 3; i++) {
    await clickText(page, '.member-add', 'Добавить сотрудника');
    await setField(page, 'fullName', 'Иванов ' + (i + 1));
    await clickText(page, '.modal-footer .btn', 'Сохранить');
    await sleep(150);
    // re-expand (render reset collapses? ensure expanded)
    await page.evaluate(() => {
      var rows = document.querySelectorAll('#tab-content tbody tr');
      // expand first team if collapsed
      var b = document.querySelector('#tab-content tbody .icon-btn');
      if (b && !document.querySelector('.member-add')) b.click();
    });
    await sleep(120);
  }
  var teamState = await page.evaluate(() => {
    var s = App.state.getActiveScenario();
    var team = App.teams.list()[0];
    var named = s.employees.filter(function (e) { return e.teamId === team.id; }).length;
    return { named: named, headcount: team.employeesCount, remainder: team.employeesCount - named };
  });
  check('Команда: добавлены именованные сотрудники (3 с ФИО)', teamState.named === 3, 'named=' + teamState.named);
  check('Команда: есть безымянный остаток (40-3=37)', teamState.remainder === 37, 'remainder=' + teamState.remainder);

  await page.evaluate(() => {
    var b = document.querySelector('#tab-content tbody .icon-btn');
    if (b && !document.querySelector('.member-summary')) b.click();
  });
  await sleep(150);
  var summaryTxt = await page.evaluate(() => (document.querySelector('.member-summary') || {}).textContent || '');
  check('Команда: итог «N с ФИО / команда X»', /с ФИО/.test(summaryTxt) && /40/.test(summaryTxt), summaryTxt.trim());
  var restTxt = await page.evaluate(() => (document.querySelector('.member-rest') || {}).textContent || '');
  check('Команда: строка «ещё M без ФИО»', /ещё/.test(restTxt), restTxt.trim());

  await page.screenshot({ path: path.join(OUT, 'i6-edit-teams.png') });

  console.log('\nPAGE ERRORS:', errors.length ? JSON.stringify(errors, null, 2) : 'none');
  var failed = results.filter(function (r) { return !r.ok; });
  console.log('SUMMARY: ' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  await browser.close();
  if (failed.length) process.exit(1);
})().catch(e => { console.error('QA FAILED:', e); process.exit(1); });
