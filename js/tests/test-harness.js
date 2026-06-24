/**
 * test-harness.js
 * Tiny in-browser test runner (no npm/build, file:// safe).
 * Provides describe/it/expect and renders pass/fail results into #results.
 */
window.TestHarness = (function () {
  'use strict';

  var suites = [];
  var current = null;

  function describe(name, fn) {
    current = { name: name, tests: [] };
    suites.push(current);
    fn();
    current = null;
  }

  function it(name, fn) {
    current.tests.push({ name: name, fn: fn });
  }

  function expect(actual) {
    return {
      toBe: function (expected) {
        if (actual !== expected) {
          throw new Error('Ожидалось ' + format(expected) + ', получено ' + format(actual));
        }
      },
      toEqual: function (expected) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error('Ожидалось ' + format(expected) + ', получено ' + format(actual));
        }
      },
      toBeCloseTo: function (expected, digits) {
        var factor = Math.pow(10, digits === undefined ? 2 : digits);
        if (Math.round(actual * factor) !== Math.round(expected * factor)) {
          throw new Error('Ожидалось ~' + expected + ', получено ' + actual);
        }
      },
      toBeTruthy: function () {
        if (!actual) {
          throw new Error('Ожидалось truthy, получено ' + format(actual));
        }
      },
      toBeFalsy: function () {
        if (actual) {
          throw new Error('Ожидалось falsy, получено ' + format(actual));
        }
      },
      toContain: function (substr) {
        var found = Array.isArray(actual)
          ? actual.indexOf(substr) !== -1
          : String(actual).indexOf(substr) !== -1;
        if (!found) {
          throw new Error('Ожидалось вхождение "' + substr + '" в ' + format(actual));
        }
      }
    };
  }

  function format(value) {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function run() {
    var root = document.getElementById('results');
    root.innerHTML = '';
    var total = 0;
    var passed = 0;

    suites.forEach(function (suite) {
      var suiteEl = document.createElement('div');
      suiteEl.className = 'suite';
      var h = document.createElement('h2');
      h.textContent = suite.name;
      suiteEl.appendChild(h);

      suite.tests.forEach(function (test) {
        total += 1;
        var row = document.createElement('div');
        row.className = 'test';
        try {
          test.fn();
          passed += 1;
          row.className += ' pass';
          row.textContent = '✓ ' + test.name;
        } catch (e) {
          row.className += ' fail';
          row.textContent = '✗ ' + test.name + ' — ' + e.message;
        }
        suiteEl.appendChild(row);
      });
      root.appendChild(suiteEl);
    });

    var summary = document.getElementById('summary');
    summary.textContent = 'Пройдено ' + passed + ' из ' + total;
    summary.className = passed === total ? 'summary ok' : 'summary fail';
  }

  return {
    describe: describe,
    it: it,
    expect: expect,
    run: run
  };
})();
