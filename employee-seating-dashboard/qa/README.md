# QA — визуальные и функциональные тесты (dev-инструмент)

Не часть приложения. Приложение остаётся offline vanilla JS (index.html, без сборки).
Скрипты драйвят локальный Chrome/Edge через puppeteer-core для приёмки реального index.html.

## Запуск
```
cd qa
npm install            # puppeteer-core (использует локальный Chrome/Edge)
node qa.js             # скриншоты вкладок -> qa/shots/
node qa-iter6.js       # дашборд: 4 KPI, баланс, денежный режим, AS IS/TO BE
node qa-edit.js        # функц. проверки (assert): создание/редактирование офиса+зон, команды с ФИО и без
```
Браузер ищется автоматически; иначе задайте BROWSER_PATH.
