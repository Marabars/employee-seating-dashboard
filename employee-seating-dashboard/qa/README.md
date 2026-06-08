# QA — визуальные и функциональные тесты (dev-инструмент)

Не часть приложения. Приложение остаётся offline vanilla JS (index.html, без сборки).
Эти скрипты драйвят локальный Chrome/Edge через puppeteer-core для визуальной
и функциональной приёмки реального index.html.

## Запуск
```
cd qa
npm install            # ставит puppeteer-core (использует локальный Chrome/Edge, не качает Chromium)
node qa.js             # скриншоты вкладок -> qa/shots/
node qa-forms.js       # функциональные проверки форм/расчётов (assert), exit code !=0 при провале
```
Если Chrome/Edge в нестандартном месте: `set BROWSER_PATH=...` (Windows) перед запуском.
