'use strict';
// The auto/default zone for a physical office with no zones must be named
// "Без зоны" (not "Опенспейс") — for both phases. Explicit "Опенспейс" zones
// (chosen by the user) are unaffected.
var fs = require('fs'); var path = require('path'); var JSDOM = require('jsdom').JSDOM;
var REPO = process.argv[2] || path.join(__dirname, '..');
var results = { pass: 0, fail: 0 };
function assert(c, m) { if (c) { results.pass++; console.log('  ✓ ' + m); } else { results.fail++; console.log('  ✗ ' + m); } }
var dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously' });
var w = dom.window;
['js/constants.js', 'js/utils.js', 'js/state.js'].forEach(function (f) {
  var s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s);
});
var App = w.App;

console.log('default (auto) zone is "Без зоны"');
assert(App.state.createDefaultOpenSpaceZone().name === 'Без зоны', 'createDefaultOpenSpaceZone name === "Без зоны"');

var asis = App.state.createOffice('asis', { name: 'Старый' });
assert(asis.zones.length === 1 && asis.zones[0].name === 'Без зоны', 'AS-IS office auto zone === "Без зоны" — got ' + JSON.stringify(asis.zones.map(function (z) { return z.name; })));

var tobe = App.state.createOffice('tobe', { name: 'Новый' });
assert(tobe.zones.length === 1 && tobe.zones[0].name === 'Без зоны', 'TO-BE office auto zone === "Без зоны"');

// Explicitly requested "Опенспейс" zone must survive unchanged.
var withOpen = App.state.createOffice('tobe', { name: 'O', zones: [{ name: 'Опенспейс', type: 'open_space', capacity: 10 }] });
assert(withOpen.zones.length === 1 && withOpen.zones[0].name === 'Опенспейс', 'explicit Опенспейс zone preserved');

console.log('\nPassed ' + results.pass + ', failed ' + results.fail);
process.exit(results.fail === 0 ? 0 : 1);
