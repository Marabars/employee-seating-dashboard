# Implementation Notes

## 1. Главный принцип

Создать локальное offline-приложение без backend.

Приложение должно работать через `file://`, поэтому не использовать ES-модули, если они ломают запуск двойным кликом.

## 2. Рекомендуемые файлы

```text
index.html
styles.css
js/app.js
js/state.js
js/calculations.js
js/render.js
js/dragDrop.js
js/importExport.js
js/validation.js
js/undoRedo.js
libs/xlsx.min.js
libs/html2canvas.min.js
libs/jspdf.min.js
```

## 3. State-first подход

Сначала построить структуру состояния:

- project;
- settings;
- scenarios;
- offices;
- zones;
- teams;
- employees;
- allocations.

Все расчеты должны строиться из state, а не из DOM.

## 4. Порядок разработки

1. State model.
2. Scenario management.
3. Offices and zones.
4. Teams.
5. Employees.
6. Allocations.
7. Calculations.
8. Validation.
9. Dashboard rendering.
10. Manual allocation table.
11. Drag-and-drop.
12. JSON import/export.
13. Excel import/export.
14. PDF/PNG/print.
15. Undo/redo.
16. View-only mode.

## 5. Что нельзя упрощать

- Drag-and-drop.
- Расчеты.
- Сценарии.
- Размещения.
- Оцифрованное переполнение.

## 6. Что можно упростить

- PDF-дизайн.
- PNG-экспорт.
- Excel-импорт.
- Excel-экспорт.
- Onboarding.
- Пустые состояния.

## 7. Расчеты должны быть вынесены отдельно

Рекомендуемый файл:

```text
js/calculations.js
```

Функции:

- calculateOfficeCapacity(office)
- calculateOfficeOccupancy(project, scenario, officeId)
- calculateZoneOccupancy(project, scenario, zoneId)
- calculateOverflow(capacity, occupied)
- calculateScenarioKpis(scenario)

## 8. Валидация отдельно

Рекомендуемый файл:

```text
js/validation.js
```

Функции должны возвращать массив сообщений:

```js
{
  level: 'error' | 'warning' | 'info',
  code: 'OFFICE_OVERFLOW',
  message: 'Новый офис B — Переполнение: 17 мест',
  entityType: 'office',
  entityId: 'office_1'
}
```
