"""
Шаблон для решения.

Здесь описаны фикстуры (driver, TEST_URL) и пустые тесты.
Заполните тела тестов проверками.

Имена тестов менять НЕЛЬЗЯ.
"""

import os

import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


TEST_URL = os.environ.get("TEST_URL", "http://localhost:8080")


@pytest.fixture
def driver():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1400,1000")

    drv = webdriver.Chrome(options=options)
    drv.implicitly_wait(2)
    yield drv
    drv.quit()


@pytest.fixture(autouse=True)
def clean_storage(driver):
    """Очищает localStorage перед каждым тестом, чтобы изолировать данные."""
    driver.get(TEST_URL)
    driver.execute_script("window.localStorage.clear();")
    yield


def test_tc1_register_with_existing_phone(driver):
    """TC-1. Регистрация с уже существующим номером телефона."""
    # TODO: реализовать
    pass


def test_tc2_login_with_wrong_password(driver):
    """TC-2. Авторизация с неверным паролем."""
    # TODO: реализовать
    pass


def test_tc3_order_without_destination(driver):
    """TC-3. Заказ такси без указания адреса назначения."""
    # TODO: реализовать
    pass


def test_tc4_price_without_full_route(driver):
    """TC-4. Расчёт стоимости без полного маршрута."""
    # TODO: реализовать
    pass


def test_tc5_second_review_not_allowed(driver):
    """TC-5. Повторная оценка одной поездки."""
    # TODO: реализовать
    pass


def test_tc6_register_without_name(driver):
    """TC-6. Регистрация без имени."""
    # TODO: реализовать
    pass


def test_tc7_register_without_phone(driver):
    """TC-7. Регистрация без телефона."""
    # TODO: реализовать
    pass


def test_tc8_register_without_password(driver):
    """TC-8. Регистрация без пароля."""
    # TODO: реализовать
    pass


def test_tc9_register_without_password_confirm(driver):
    """TC-9. Регистрация без повторного пароля."""
    # TODO: реализовать
    pass
