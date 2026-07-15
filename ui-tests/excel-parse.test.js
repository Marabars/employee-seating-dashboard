'use strict';
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously' });
var w = dom.window;
['js/constants.js', 'js/utils.js', 'js/validation.import.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var IV = w.App.importValidation;

var sheets = {
  offices: [['Название офиса', 'Тип офиса', 'Площадь', 'Аренда, ₽/м²', 'Эксплуатация, ₽/м²', 'Индексация, %/год', 'Дата начала аренды', 'Дата окончания аренды', 'Дата начала индексации', 'Черновик', 'Комментарий'],
            ['A', 'TO BE', 100, 1000, 50, 10, '2026-01-01', '2028-08-30', '2026-06-01', 'нет', '']],
  zones: [],
  teams: [],
  employees: [],
  allocations: [['Тип', 'Название', 'Фаза', 'Количество', 'Офис', 'Зона', 'Комментарий'],
                ['team', 'Alpha', 'tobe', 5, 'A', 'Z', '']],
  tenants: [['Название офиса', 'Фаза офиса', 'Арендатор', 'Площадь'],
            ['A', 'tobe', 'МР Групп', 40]],
  cf: [['Тип', 'Фаза', 'Название', 'Год', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
       ['office', 'tobe', 'A', 2026, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]]
};
var parsed = IV.parseWorkbook(sheets);

console.log('excel parse: new columns/sheets');
assert(parsed.offices[0].lease_end_date === '2028-08-30', 'office lease_end_date parsed');
assert(parsed.offices[0].indexation_start_date === '2026-06-01', 'office indexation_start_date parsed');
assert(parsed.allocations[0].phase === 'tobe', 'allocation phase parsed');
assert(parsed.tenants && parsed.tenants[0].name === 'МР Групп' && parsed.tenants[0].area === 40, 'tenant parsed');
assert(parsed.cf && parsed.cf[0].kind === 'office' && parsed.cf[0].year === 2026 && parsed.cf[0].monthly.length === 12 && parsed.cf[0].monthly[0] === 1, 'cf row parsed monthly');
console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
