#!/usr/bin/env bash
# install.sh — проверяет наличие Python 3, собирает бандл и открывает его в браузере.
# Поддерживаемые платформы: macOS, Ubuntu/Debian, Fedora/RHEL/Arch.
set -euo pipefail

echo ""
echo " =========================================="
echo "  Дашборд рассадки сотрудников"
echo "  Проверка зависимостей и сборка"
echo " =========================================="
echo ""

# ---------------------------------------------------------------------------
# Ищем Python 3
# ---------------------------------------------------------------------------
PY=""
if command -v python3 &>/dev/null; then
    PY="python3"
elif command -v python &>/dev/null; then
    # Убедимся, что это именно Python 3
    MAJOR=$(python --version 2>&1 | awk '{print $2}' | cut -d. -f1)
    [ "$MAJOR" = "3" ] && PY="python"
fi

install_python_macos() {
    if command -v brew &>/dev/null; then
        read -rp " Установить Python 3 через Homebrew? [Y/n]: " CHOICE
        if [[ "${CHOICE,,}" != "n" ]]; then
            brew install python3
            PY="python3"
        fi
    else
        echo " Homebrew не найден. Установите Python 3 вручную:"
        echo "   https://www.python.org/downloads/"
        echo " Или установите Homebrew (https://brew.sh) и затем: brew install python3"
        open "https://www.python.org/downloads/" 2>/dev/null || true
        exit 1
    fi
}

install_python_debian() {
    read -rp " Установить Python 3 через apt? [Y/n]: " CHOICE
    if [[ "${CHOICE,,}" != "n" ]]; then
        sudo apt-get update -qq
        sudo apt-get install -y python3
        PY="python3"
    fi
}

install_python_fedora() {
    read -rp " Установить Python 3 через dnf? [Y/n]: " CHOICE
    if [[ "${CHOICE,,}" != "n" ]]; then
        sudo dnf install -y python3
        PY="python3"
    fi
}

install_python_arch() {
    read -rp " Установить Python через pacman? [Y/n]: " CHOICE
    if [[ "${CHOICE,,}" != "n" ]]; then
        sudo pacman -S --noconfirm python
        PY="python3"
    fi
}

if [ -z "$PY" ]; then
    echo " [!] Python 3 не найден."
    echo ""
    echo " Установите Python 3:"

    OS="$(uname -s)"
    if [[ "$OS" == "Darwin" ]]; then
        echo "   macOS:           brew install python3"
        echo "   или вручную:     https://www.python.org/downloads/"
        echo ""
        install_python_macos
    elif [[ "$OS" == "Linux" ]]; then
        if command -v apt-get &>/dev/null; then
            echo "   Ubuntu/Debian:   sudo apt install python3"
            echo ""
            install_python_debian
        elif command -v dnf &>/dev/null; then
            echo "   Fedora/RHEL:     sudo dnf install python3"
            echo ""
            install_python_fedora
        elif command -v pacman &>/dev/null; then
            echo "   Arch Linux:      sudo pacman -S python"
            echo ""
            install_python_arch
        else
            echo "   https://www.python.org/downloads/"
            exit 1
        fi
    else
        echo "   https://www.python.org/downloads/"
        exit 1
    fi
fi

# Финальная проверка после попытки установки
if ! command -v "${PY}" &>/dev/null; then
    echo ""
    echo " [!] Python 3 по-прежнему не найден. Установите вручную и запустите install.sh снова."
    exit 1
fi

PYVER=$("$PY" --version 2>&1)
echo " [OK] ${PYVER} найден."
echo ""

# ---------------------------------------------------------------------------
# Сборка бандла
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo " [*] Запускаем build.py ..."
echo ""
"$PY" build.py

echo ""
echo " [OK] Файл employee-seating-dashboard.html собран и готов к работе."
echo ""
echo " Открываем в браузере..."

HTML="$SCRIPT_DIR/employee-seating-dashboard.html"
if command -v xdg-open &>/dev/null; then
    xdg-open "$HTML"
elif command -v open &>/dev/null; then
    open "$HTML"
else
    echo " Автооткрытие недоступно. Откройте файл вручную:"
    echo "   $HTML"
fi

echo ""
echo " Готово!"
echo " Для повторной сборки после правок в исходниках — запустите install.sh ещё раз."
echo ""
