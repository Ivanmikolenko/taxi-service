"""
Эталонное решение.

Все тесты в одном файле. Имена тестов соответствуют template.py.
"""

import os
import time
import uuid

import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


TEST_URL = os.environ.get("TEST_URL", "http://localhost:8080")
WAIT = 8


# --- фикстуры --------------------------------------------------------------

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
    """Очищает localStorage перед каждым тестом, чтобы данные не протекали."""
    driver.get(TEST_URL)
    driver.execute_script("window.localStorage.clear();")
    yield


# --- хелперы ---------------------------------------------------------------

def wait(driver, timeout=WAIT):
    return WebDriverWait(driver, timeout)


def unique_phone():
    """Уникальный валидный номер на основе времени/случайности."""
    suffix = (int(time.time() * 1000) + uuid.uuid4().int) % 10_000_000_000
    return "+7" + str(suffix).zfill(10)


def open_auth(driver):
    driver.get(TEST_URL)
    wait(driver).until(EC.visibility_of_element_located((By.ID, "auth-view")))


def switch_to_register(driver):
    driver.find_element(By.ID, "tab-register").click()
    wait(driver).until(
        EC.visibility_of_element_located((By.ID, "register-fields"))
    )


def switch_to_login(driver):
    driver.find_element(By.ID, "tab-login").click()


def fill(driver, by_id, value):
    el = driver.find_element(By.ID, by_id)
    el.clear()
    if value:
        el.send_keys(value)


def click(driver, by_id):
    """Кликает по элементу через JS — устойчиво к перекрытиям и уходу за viewport."""
    el = wait(driver).until(
        EC.presence_of_element_located((By.ID, by_id))
    )
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center'});", el
    )
    wait(driver).until(EC.element_to_be_clickable((By.ID, by_id)))
    driver.execute_script("arguments[0].click();", el)


def register(driver, name, phone, password, password_confirm):
    fill(driver, "register-name", name)
    fill(driver, "auth-phone", phone)
    fill(driver, "auth-password", password)
    fill(driver, "register-password-confirm", password_confirm)
    click(driver, "auth-submit")


def login(driver, phone, password):
    fill(driver, "auth-phone", phone)
    fill(driver, "auth-password", password)
    click(driver, "auth-submit")


def wait_auth_error(driver):
    return wait(driver).until(
        lambda d: d.find_element(By.ID, "auth-error").text.strip()
    )


def wait_order_error(driver):
    return wait(driver).until(
        lambda d: d.find_element(By.ID, "order-error").text.strip()
    )


def is_visible(driver, by_id):
    try:
        return driver.find_element(By.ID, by_id).is_displayed()
    except Exception:
        return False


def make_registered_user(driver):
    """Регистрирует пользователя и оставляет его залогиненным."""
    phone = unique_phone()
    open_auth(driver)
    switch_to_register(driver)
    register(driver, "Тестовый Пользователь", phone, "qwerty123", "qwerty123")
    wait(driver).until(EC.visibility_of_element_located((By.ID, "app-view")))
    return {"name": "Тестовый Пользователь", "phone": phone,
            "password": "qwerty123"}


def complete_trip(driver):
    """Создаёт заказ и доводит его до статуса completed."""
    fill(driver, "pickup-address", "Невский проспект, 10")
    fill(driver, "destination-address", "Литейный проспект, 20")
    fill(driver, "distance-km", "8")
    click(driver, "create-order")

    # searching → assigned (мок через 900 мс)
    wait(driver).until(
        lambda d: "Водитель назначен" in d.find_element(
            By.ID, "order-status").text
    )

    # assigned → arrived → in_progress → completed
    for _ in range(3):
        click(driver, "trip-next")

    wait(driver).until(
        lambda d: "завершена" in d.find_element(
            By.ID, "order-status").text.lower()
    )


def open_history(driver):
    click(driver, "nav-history")
    wait(driver).until(EC.visibility_of_element_located((By.ID, "history-list")))


def first_history_item(driver):
    return driver.find_element(By.CSS_SELECTOR, ".history-item")


# --- TC-1 ----------------------------------------------------------------

def test_tc1_register_with_existing_phone(driver):
    """TC-1. Регистрация с уже существующим номером телефона."""
    user = make_registered_user(driver)

    # Выходим и пытаемся зарегистрироваться с тем же номером
    click(driver, "logout-button")
    open_auth(driver)
    switch_to_register(driver)
    register(driver, "Другой Пользователь", user["phone"],
             "anotherpass", "anotherpass")

    error = wait_auth_error(driver)
    assert "уже зарегистрирован" in error.lower()
    assert is_visible(driver, "auth-view")
    assert not is_visible(driver, "app-view")


# --- TC-2 ----------------------------------------------------------------

def test_tc2_login_with_wrong_password(driver):
    """TC-2. Авторизация с неверным паролем."""
    user = make_registered_user(driver)
    click(driver, "logout-button")
    open_auth(driver)
    switch_to_login(driver)

    login(driver, user["phone"], "wrongpass")

    error = wait_auth_error(driver)
    assert "неверн" in error.lower()
    assert is_visible(driver, "auth-view")
    assert not is_visible(driver, "app-view")


# --- TC-3 ----------------------------------------------------------------

def test_tc3_order_without_destination(driver):
    """TC-3. Заказ такси без указания адреса назначения."""
    make_registered_user(driver)

    fill(driver, "pickup-address", "Невский проспект, 10")
    fill(driver, "destination-address", "")
    fill(driver, "distance-km", "8")
    click(driver, "create-order")

    error = wait_order_error(driver)
    assert "назначения" in error.lower()
    assert not is_visible(driver, "trip-panel")


# --- TC-4 ----------------------------------------------------------------

def test_tc4_price_without_full_route(driver):
    """TC-4. Расчёт стоимости без полного маршрута."""
    make_registered_user(driver)

    fill(driver, "pickup-address", "")
    fill(driver, "destination-address", "Литейный проспект, 20")
    fill(driver, "distance-km", "8")

    # Приложение не должно рассчитать итоговую стоимость
    estimated = driver.find_element(By.ID, "estimated-price").text.strip()
    assert estimated in ("— ₽", "—", ""), \
        f"Стоимость не должна рассчитываться без адреса подачи, но получено: {estimated}"

    # И не должно дать создать заказ
    click(driver, "create-order")
    error = wait_order_error(driver)
    assert "отправления" in error.lower()
    assert not is_visible(driver, "trip-panel")


# --- TC-5 ----------------------------------------------------------------

def test_tc5_second_review_not_allowed(driver):
    """TC-5. Повторная оценка одной поездки."""
    make_registered_user(driver)
    complete_trip(driver)
    open_history(driver)

    # Кнопка «Оценить» есть у завершённой неоценённой поездки
    item = first_history_item(driver)
    review_button = item.find_element(
        By.XPATH, ".//button[normalize-space()='Оценить']"
    )
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center'});", review_button
    )
    driver.execute_script("arguments[0].click();", review_button)

    # Ставим 5 звёзд и отправляем
    wait(driver).until(EC.visibility_of_element_located((By.ID, "review-modal")))

    rating = driver.find_element(
        By.CSS_SELECTOR, '#review-modal input[name="rating"][value="5"]'
    )
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center'});", rating
    )
    driver.execute_script("arguments[0].click();", rating)

    submit = driver.find_element(
        By.CSS_SELECTOR, '#review-modal button[type="submit"]'
    )
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center'});", submit
    )
    driver.execute_script("arguments[0].click();", submit)

    # Модалка закрылась
    wait(driver).until(EC.invisibility_of_element_located((By.ID, "review-modal")))

    # Ждём, пока бейдж получит текст «Отзыв оставлен».
    # Используем textContent — он не зависит от видимости элемента.
    def badge_has_text(d):
        try:
            el = d.find_element(
                By.CSS_SELECTOR, ".history-item .history-status"
            )
            text = (el.get_attribute("textContent") or "").strip()
            return el if text else False
        except Exception:
            return False

    badge = wait(driver).until(badge_has_text)
    assert "Отзыв оставлен" in badge.get_attribute("textContent")

    # Повторной кнопки «Оценить» быть не должно — ищем элемент заново,
    # потому что после renderHistory() DOM списка пересобирается
    item = first_history_item(driver)
    buttons = item.find_elements(
        By.XPATH, ".//button[normalize-space()='Оценить']"
    )
    assert buttons == [], \
        "После оценки кнопка 'Оценить' появляться повторно не должна"
    

# --- TC-6 ----------------------------------------------------------------

def test_tc6_register_without_name(driver):
    """TC-6. Регистрация без имени."""
    open_auth(driver)
    switch_to_register(driver)
    register(driver, "", unique_phone(), "qwerty123", "qwerty123")

    error = wait_auth_error(driver)
    assert "имя" in error.lower()
    assert not is_visible(driver, "app-view")


# --- TC-7 ----------------------------------------------------------------

def test_tc7_register_without_phone(driver):
    """TC-7. Регистрация без телефона."""
    open_auth(driver)
    switch_to_register(driver)
    register(driver, "Тестовый", "", "qwerty123", "qwerty123")

    error = wait_auth_error(driver)
    assert "телефон" in error.lower()
    assert not is_visible(driver, "app-view")


# --- TC-8 ----------------------------------------------------------------

def test_tc8_register_without_password(driver):
    """TC-8. Регистрация без пароля."""
    open_auth(driver)
    switch_to_register(driver)
    register(driver, "Тестовый", unique_phone(), "", "")

    error = wait_auth_error(driver)
    assert "пароль" in error.lower()
    assert not is_visible(driver, "app-view")


# --- TC-9 ----------------------------------------------------------------

def test_tc9_register_without_password_confirm(driver):
    """TC-9. Регистрация без повторного пароля."""
    open_auth(driver)
    switch_to_register(driver)
    register(driver, "Тестовый", unique_phone(), "qwerty123", "")

    error = wait_auth_error(driver)
    assert "парол" in error.lower()
    assert not is_visible(driver, "app-view")
