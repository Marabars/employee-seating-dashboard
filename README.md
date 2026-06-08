# Дашборд рассадки сотрудников

Локальное offline frontend-приложение для планирования переезда сотрудников из старых офисов в новые: сценарии рассадки, офисы и зоны, команды и сотрудники, размещения с drag-and-drop, расчёты заполняемости и переполнения, KPI, валидация, сравнение сценариев и экспорт (JSON / Excel / PDF / PNG / печать).

Технологии: чистые **HTML + CSS + Vanilla JavaScript**. Без backend, без сборки, без CDN. Работает offline.

## Быстрый старт

1. Скачайте репозиторий (`Code → Download ZIP`) или клонируйте:
   ```
   git clone https://github.com/<owner>/<repo>.git
   ```
2. Откройте **`employee-seating-dashboard/index.html`** двойным кликом — приложение запустится в браузере (Chrome, Edge, Firefox, Safari). Интернет не требуется.
3. Тесты: откройте **`employee-seating-dashboard/tests.html`** — юнит-тесты расчётов и валидации прогонятся автоматически.

Подробная документация по запуску, возможностям и структуре данных — в [`employee-seating-dashboard/README.md`](employee-seating-dashboard/README.md).

## Структура репозитория

```
employee-seating-dashboard/   приложение (HTML/CSS/JS, libs, тесты, README)
spec/                          техническое задание и материалы (ТЗ, критерии приёмки, пример данных)
```

## Сторонние библиотеки (`employee-seating-dashboard/libs/`)

Подключаются только локально (offline, без CDN):

- **SheetJS (xlsx)** — Apache-2.0 — импорт/экспорт Excel.
- **jsPDF** — MIT — экспорт PDF.
- **html2canvas** — MIT — экспорт PNG.
- **PT Sans** (`pdf-fonts.js`) — SIL OFL 1.1 (см. `libs/PTSans-OFL.txt`) — кириллический шрифт для PDF.

## Лицензия

Код приложения — MIT (см. [LICENSE](LICENSE)). Сторонние библиотеки распространяются под собственными лицензиями (см. выше).
