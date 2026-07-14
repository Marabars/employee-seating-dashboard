'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }

var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
var w = dom.window;
['js/constants.js', 'js/utils.js', 'js/modals.js'].forEach(function (f) {
  var s = w.document.createElement('script');
  s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8');
  w.document.body.appendChild(s);
});
var App = w.App;
var U = App.utils;

console.log('placementrows field type');
var offices = [{ id: 'o1', name: 'A', zones: [{ id: 'z1', name: 'Z', capacity: 5 }] },
               { id: 'o2', name: 'B', zones: [] }];
var f = App.modals.form({
  title: 't',
  fields: [{ name: 'rows', label: 'R', type: 'placementrows', offices: offices, headcount: 10,
             value: [{ officeId: 'o1', zoneId: 'z1', count: 3 }] }],
  onSubmit: function () { return true; }
});

var control = f.inputs.rows;
var rowEls = U.qsa('.placementrows-row', control);
assert(rowEls.length === 1, 'one pre-filled row rendered (got ' + rowEls.length + ')');

var v1 = f.collect().rows;
assert(v1.length === 1 && v1[0].officeId === 'o1' && v1[0].zoneId === 'z1' && v1[0].count === 3,
  'collect returns the pre-filled row: ' + JSON.stringify(v1));

var addBtn = U.qsa('button', control).filter(function (b) { return /строка/.test(b.textContent); })[0];
addBtn.click();
var rows2 = U.qsa('.placementrows-row', control);
assert(rows2.length === 2, 'add button adds a row (got ' + rows2.length + ')');
var newRow = rows2[1];
var off = U.qs('.pr-office', newRow); off.value = 'o2';
var cnt = U.qs('.pr-count', newRow); cnt.value = '4';
var v2 = f.collect().rows;
assert(v2.length === 2 && v2[1].officeId === 'o2' && v2[1].count === 4 && v2[1].zoneId === null,
  'collect includes the added row with null zone: ' + JSON.stringify(v2));

addBtn.click();
var v3 = f.collect().rows;
assert(v3.length === 2, 'empty (no-office) row is dropped by collect (got ' + v3.length + ')');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
