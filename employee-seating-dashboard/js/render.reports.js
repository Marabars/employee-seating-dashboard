/**
 * render.reports.js
 * "Отчеты" tab: buttons for JSON export/import, Excel import/template/export,
 * PDF, PNG, and browser print. Delegates to App.importExport.
 */
window.App = window.App || {};

(function () {
  'use strict';

  var U = App.utils;
  var R = App.render;
  var state = App.state;
  var IE = function () { return App.importExport; };

  function render(container, ctx) {
    var viewOnly = ctx.viewOnly;

    container.appendChild(group('JSON (основной формат проекта)', [
      btn('Экспорт JSON', function () { IE().exportJson(); }),
      viewOnly ? null : btn('Импорт JSON', function () { IE().importJsonDialog(); })
    ]));

    container.appendChild(group('Excel', [
      btn('Скачать шаблон Excel', function () { IE().downloadExcelTemplate(); }),
      viewOnly ? null : btn('Импорт Excel', function () { IE().importExcelDialog(); }),
      btn('Экспорт Excel (активный)', function () { IE().exportExcel(false); }),
      btn('Экспорт Excel (все сценарии)', function () { IE().exportExcel(true); })
    ]));

    container.appendChild(group('Отчеты', [
      btn('Экспорт PDF', function () { IE().exportPdf(); }),
      btn('Экспорт PNG (дашборд)', function () { IE().exportPng(); }),
      btn('Печать / Сохранить как PDF', function () { window.print(); })
    ]));

    container.appendChild(U.el('p', { class: 'muted', text:
      'Сравнение сценариев находится в отдельной вкладке. PDF по умолчанию без ФИО — переключатель в настройках.' }));
  }

  function group(title, buttons) {
    var panel = R.section(title);
    var row = U.el('div', { class: 'button-row' });
    buttons.filter(Boolean).forEach(function (b) { row.appendChild(b); });
    panel.appendChild(row);
    return panel;
  }

  function btn(label, onClick) {
    return U.el('button', { class: 'btn btn-secondary', onclick: onClick }, label);
  }

  App.render.registerTab('reports', { label: 'Отчеты', render: render });
})();
