@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo.
echo  ==========================================
echo   Дашборд рассадки сотрудников
echo   Проверка зависимостей и сборка
echo  ==========================================
echo.

rem ---------------------------------------------------------------------------
rem  Ищем Python 3.  Сначала пробуем "python", потом лаунчер "py".
rem ---------------------------------------------------------------------------
set "PY="
python --version >nul 2>&1 && set "PY=python"
if not defined PY (
    py --version >nul 2>&1 && set "PY=py"
)

if not defined PY (
    echo  [!] Python 3 не найден.
    echo.
    echo  Установите Python 3 одним из способов:
    echo.
    echo    Вариант 1 — через winget (встроен в Windows 10/11):
    echo      winget install -e --id Python.Python.3.12
    echo.
    echo    Вариант 2 — вручную:
    echo      https://www.python.org/downloads/
    echo      При установке отметьте галочку "Add Python to PATH"
    echo.

    rem --- Пробуем winget ---
    winget --version >nul 2>&1
    if not errorlevel 1 (
        set /p CHOICE= Установить Python 3.12 через winget прямо сейчас? [Y/n]:
        if /i not "!CHOICE!"=="n" (
            echo.
            echo  Запускаем winget install Python...
            winget install -e --id Python.Python.3.12
            if errorlevel 1 (
                echo.
                echo  [!] winget не смог установить Python.
                echo      Установите вручную: https://www.python.org/downloads/
                goto :error
            )
            echo.
            echo  [OK] Python установлен.
            echo.
            echo  ВАЖНО: закройте это окно, откройте новый терминал
            echo         (PATH обновился) и запустите install.bat снова.
            goto :pause_exit
        )
    )
    rem winget недоступен или пользователь отказался — открываем браузер
    start https://www.python.org/downloads/
    echo  Страница загрузки открыта в браузере.
    echo  После установки Python запустите install.bat снова.
    goto :error
)

rem ---------------------------------------------------------------------------
rem  Выводим версию Python
rem ---------------------------------------------------------------------------
for /f "tokens=*" %%v in ('%PY% --version 2^>^&1') do set "PYVER=%%v"
echo  [OK] %PYVER% найден.
echo.

rem ---------------------------------------------------------------------------
rem  Сборка бандла
rem ---------------------------------------------------------------------------
echo  [*] Запускаем build.py ...
echo.
%PY% build.py
if errorlevel 1 (
    echo.
    echo  [!] Сборка завершилась с ошибкой. Проверьте вывод выше.
    goto :error
)

echo.
echo  [OK] Файл employee-seating-dashboard.html собран и готов к работе.
echo.
echo  Открываем в браузере...
start "" "%~dp0employee-seating-dashboard.html"
echo.
echo  Готово!
echo  Для повторной сборки после правок в исходниках — запустите install.bat ещё раз.
echo.
pause
exit /b 0

:error
echo.
pause
exit /b 1

:pause_exit
pause
exit /b 0
