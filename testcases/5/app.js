
"use strict";

const STORAGE_KEYS = {
  users: "taxi_demo_users_v1",
  session: "taxi_demo_session_v1",
  orders: "taxi_demo_orders_v1"
};

const TARIFFS = {
  basic: { name: "Basic", multiplier: 1 },
  comfort: { name: "Comfort", multiplier: 1.5 },
  "comfort-plus": { name: "Comfort+", multiplier: 2 }
};

const DRIVER_MOCK = {
  id: "driver-demo-001",
  name: "Алексей Смирнов",
  car: "Седан · А123АА",
  rating: 4.9
};

const TRIP_STEPS = [
  "searching",
  "assigned",
  "arrived",
  "in_progress",
  "completed"
];

const STATUS_LABELS = {
  searching: "Поиск водителя",
  assigned: "Водитель назначен",
  arrived: "Водитель на месте",
  in_progress: "В пути",
  completed: "Поездка завершена",
  cancelled: "Заказ отменён"
};

const $ = (id) => document.getElementById(id);

let authMode = "login";
let currentUser = null;
let activeOrder = null;
let reviewOrder = null;
let toastTimer = null;
let searchTimer = null;

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    showToast("Не удалось сохранить данные в браузере.");
    return false;
  }
}

function getUsers() {
  const users = readStorage(STORAGE_KEYS.users, []);
  return Array.isArray(users) ? users : [];
}

function getOrders() {
  const orders = readStorage(STORAGE_KEYS.orders, []);
  return Array.isArray(orders) ? orders : [];
}

function saveOrders(orders) {
  return writeStorage(STORAGE_KEYS.orders, orders);
}

function userOrders() {
  if (!currentUser) return [];
  return getOrders()
    .filter((order) => order.userPhone === currentUser.phone)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function saveOrder(order) {
  const orders = getOrders();
  const index = orders.findIndex((item) => item.id === order.id);

  if (index === -1) orders.push(order);
  else orders[index] = order;

  return saveOrders(orders);
}

function money(value) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0
  }).format(value) + " ₽";
}

function calculatePrice(distance, tariffId) {
  const tariff = TARIFFS[tariffId];

  if (!tariff || !Number.isFinite(distance) || distance < 1 || distance > 100) {
    return null;
  }

  return Math.round((150 + distance * 35 * tariff.multiplier) / 10) * 10;
}

function selectedTariff() {
  const selected = document.querySelector('input[name="tariff"]:checked');
  return selected ? selected.value : "basic";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function showMessage(id, message) {
  $(id).textContent = message;
}

function clearMessage(id) {
  showMessage(id, "");
}

function showAuth(mode = "login") {
  authMode = mode;
  currentUser = null;
  activeOrder = null;

  $("auth-view").classList.remove("hidden");
  $("app-view").classList.add("hidden");
  $("auth-error").textContent = "";

  $("auth-title").textContent =
    mode === "login" ? "С возвращением" : "Создай аккаунт";
  $("auth-subtitle").textContent =
    mode === "login"
      ? "Войди, чтобы заказать поездку."
      : "Зарегистрируйся, чтобы начать поездки.";

  $("tab-login").classList.toggle("active", mode === "login");
  $("tab-register").classList.toggle("active", mode === "register");
  $("tab-login").setAttribute("aria-selected", String(mode === "login"));
  $("tab-register").setAttribute("aria-selected", String(mode === "register"));

  $("register-fields").classList.toggle("hidden", mode !== "register");
  $("register-password-confirm-field").classList.toggle(
    "hidden",
    mode !== "register"
  );
  $("register-password-confirm").required = mode === "register";
  $("auth-password").autocomplete =
    mode === "login" ? "current-password" : "new-password";
  $("auth-submit").innerHTML =
    mode === "login"
      ? 'Войти в аккаунт <span aria-hidden="true">→</span>'
      : 'Создать аккаунт <span aria-hidden="true">→</span>';

  $("logout-button").classList.add("hidden");
  $("auth-open").classList.remove("hidden");
  $("account-label").textContent = "Гость";

  $("auth-view").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showApplication(user) {
  currentUser = user;
  $("auth-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");

  $("auth-open").classList.add("hidden");
  $("logout-button").classList.remove("hidden");
  $("account-label").textContent = user.name;

  $("profile-name").textContent = "Привет, " + user.name + "!";
  $("profile-email").textContent = user.phone;
  updateProfileStats();

  showOrderView();
}

function updateProfileStats() {
  $("profile-trips").textContent = String(userOrders().length);
}

function switchAuthMode(mode) {
  $("auth-form").reset();
  clearMessage("auth-error");
  showAuth(mode);
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, "");
}

function handleAuthSubmit(event) {
  event.preventDefault();
  clearMessage("auth-error");

  const phone = $("auth-phone").value.trim();
  const normalizedPhone = normalizePhone(phone);
  const password = $("auth-password").value;

  if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
    showMessage("auth-error", "Введи корректный номер телефона.");
    return;
  }

  if (password.length < 6) {
    showMessage("auth-error", "Пароль должен содержать не менее 6 символов.");
    return;
  }

  const users = getUsers();

  if (authMode === "register") {
    const name = $("register-name").value.trim();
    const passwordConfirm = $("register-password-confirm").value;

    if (name.length < 2) {
      showMessage("auth-error", "Имя должно содержать не менее 2 символов.");
      return;
    }

    if (password !== passwordConfirm) {
      showMessage("auth-error", "Пароли не совпадают.");
      return;
    }

    if (users.some(
      (user) => normalizePhone(user.phone || "") === normalizedPhone
    )) {
      showMessage("auth-error", "Этот номер уже зарегистрирован. Войди в аккаунт.");
      return;
    }

    const user = {
      id: "user-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      name,
      phone,
      password,
      createdAt: Date.now()
    };

    if (!writeStorage(STORAGE_KEYS.users, [...users, user])) return;
    if (!writeStorage(STORAGE_KEYS.session, { phone: user.phone })) return;

    showApplication(user);
    showToast("Регистрация прошла успешно!");
    return;
  }

  const user = users.find(
    (item) => normalizePhone(item.phone || "") === normalizedPhone
  );

  if (!user || user.password !== password) {
    showMessage("auth-error", "Неверный номер телефона или пароль.");
    return;
  }

  if (!writeStorage(STORAGE_KEYS.session, { phone: user.phone })) return;

  showApplication(user);
  showToast("Ты успешно вошёл в аккаунт.");
}

function logout() {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }

  try {
    localStorage.removeItem(STORAGE_KEYS.session);
  } catch {

  }

  currentUser = null;
  activeOrder = null;
  $("auth-form").reset();
  showAuth("login");
  showToast("Ты вышел из аккаунта.");
}

function updatePriceDisplay() {
  const pickup = $("pickup-address").value.trim();
  const destination = $("destination-address").value.trim();
  const rawDistance = $("distance-km").value.trim();
  const distance = Number(rawDistance);

  const hasPickup = pickup.length >= 3;
  const hasDestination = destination.length >= 3;
  const hasDistance =
    rawDistance !== "" &&
    Number.isFinite(distance) &&
    distance >= 1 &&
    distance <= 100;

  const canCalculate = hasPickup && hasDestination && hasDistance;

  for (const [id] of Object.entries(TARIFFS)) {
    const price = canCalculate ? calculatePrice(distance, id) : null;
    $("price-" + id).textContent = price === null ? "— ₽" : money(price);
  }

  const total = canCalculate
    ? calculatePrice(distance, selectedTariff())
    : null;

  $("estimated-price").textContent = total === null ? "— ₽" : money(total);

  document.querySelectorAll("[data-tariff-card]").forEach((card) => {
    const input = card.querySelector('input[name="tariff"]');
    card.classList.toggle("selected", input.checked);
  });
}

function showOrderView() {
  $("order-panel").classList.remove("hidden");
  $("trip-panel").classList.add("hidden");
  $("history-panel").classList.add("hidden");

  $("nav-order").classList.add("active");
  $("nav-history").classList.remove("active");

  updatePriceDisplay();
}

function showHistoryView() {
  $("order-panel").classList.add("hidden");
  $("trip-panel").classList.add("hidden");
  $("history-panel").classList.remove("hidden");

  $("nav-order").classList.remove("active");
  $("nav-history").classList.add("active");

  renderHistory();
}

function handleCreateOrder(event) {
  event.preventDefault();
  clearMessage("order-error");

  if (!currentUser) {
    showAuth("login");
    showMessage("auth-error", "Сначала войди в аккаунт.");
    return;
  }

  const pickup = $("pickup-address").value.trim();
  const destination = $("destination-address").value.trim();
  const distance = Number($("distance-km").value);
  const tariffId = selectedTariff();
  const payment = $("payment-method").value;

  if (!pickup || !destination) {
    showMessage("order-error", "Укажи адрес отправления и назначения.");
    return;
  }

  if (pickup.length < 3 || destination.length < 3) {
    showMessage("order-error", "Адрес должен содержать не менее 3 символов.");
    return;
  }

  if (pickup.toLocaleLowerCase() === destination.toLocaleLowerCase()) {
    showMessage("order-error", "Адреса отправления и назначения должны различаться.");
    return;
  }

  if (!Number.isFinite(distance) || distance < 1 || distance > 100) {
    showMessage("order-error", "Расстояние должно быть от 1 до 100 км.");
    return;
  }

  const price = calculatePrice(distance, tariffId);

  if (price === null) {
    showMessage("order-error", "Не удалось рассчитать стоимость.");
    return;
  }

  if (
    activeOrder &&
    !["completed", "cancelled"].includes(activeOrder.status)
  ) {
    showMessage("order-error", "Сначала заверши или отмени текущий заказ.");
    return;
  }

  if (searchTimer) clearTimeout(searchTimer);

  activeOrder = {
    id: "order-" + Date.now(),
    userPhone: currentUser.phone,
    pickup,
    destination,
    distance,
    tariffId,
    tariffName: TARIFFS[tariffId].name,
    payment,
    price,
    finalPrice: null,
    status: "searching",
    driver: null,
    review: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  if (!saveOrder(activeOrder)) {
    activeOrder = null;
    return;
  }

  renderTrip();
  showToast("Заказ создан. Ищем водителя…");

  searchTimer = setTimeout(() => {
    searchTimer = null;

    if (!activeOrder || activeOrder.status !== "searching") return;

    activeOrder.driver = { ...DRIVER_MOCK };
    setStatus("assigned");
    showToast("Водитель найден!");
  }, 900);
}

function setStatus(status) {
  if (!activeOrder) return false;

  activeOrder.status = status;
  activeOrder.updatedAt = Date.now();

  if (status === "completed") {
    activeOrder.finalPrice = activeOrder.price;
  }

  if (!saveOrder(activeOrder)) return false;

  renderTrip();
  updateProfileStats();
  return true;
}

function canCancelOrder(order) {
  return Boolean(order) &&
    ["searching", "assigned", "arrived"].includes(order.status);
}

function cancelOrder() {
  if (!activeOrder || !canCancelOrder(activeOrder)) {
    showToast("Сейчас отменить заказ нельзя.");
    return;
  }

  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }

  setStatus("cancelled");
  showToast("Заказ отменён. Списаний не было.");
}

function advanceTrip() {
  if (!activeOrder) return;

  const currentIndex = TRIP_STEPS.indexOf(activeOrder.status);

  if (currentIndex < 0 || currentIndex >= TRIP_STEPS.length - 1) return;

  const nextStatus = TRIP_STEPS[currentIndex + 1];

  if (nextStatus === "assigned" && !activeOrder.driver) {
    showToast("Сначала дождись назначения водителя.");
    return;
  }

  setStatus(nextStatus);

  const messages = {
    assigned: "Водитель назначен и направляется к тебе.",
    arrived: "Водитель на месте. Можно начинать поездку.",
    in_progress: "Поездка началась. Хорошей дороги!",
    completed: "Поездка завершена. Спасибо, что выбрал нас!"
  };

  $("trip-message").textContent = messages[nextStatus] || "";
}

function renderTrip() {
  if (!activeOrder) return;

  $("order-panel").classList.add("hidden");
  $("history-panel").classList.add("hidden");
  $("trip-panel").classList.remove("hidden");

  $("nav-order").classList.add("active");
  $("nav-history").classList.remove("active");

  $("trip-pickup").textContent = activeOrder.pickup;
  $("trip-destination").textContent = activeOrder.destination;

  const status = activeOrder.status;
  const terminal = ["completed", "cancelled"].includes(status);

  $("order-status").textContent = STATUS_LABELS[status] || status;
  $("order-status").dataset.status = status;
  $("trip-price").textContent = money(
    activeOrder.finalPrice ?? activeOrder.price
  );

  const driverAvailable = Boolean(activeOrder.driver) &&
    !["searching", "cancelled"].includes(status);

  $("driver-card").classList.toggle("hidden", !driverAvailable);

  if (driverAvailable) {
    $("driver-name").textContent = activeOrder.driver.name;
    $("driver-car").textContent = activeOrder.driver.car;
  }

  document.querySelectorAll(".progress-step").forEach((step) => {
    const stepStatus = step.dataset.step;
    const stepIndex = TRIP_STEPS.indexOf(stepStatus);
    const currentIndex = TRIP_STEPS.indexOf(status);

    step.classList.toggle(
      "done",
      currentIndex >= 0 && stepIndex < currentIndex
    );
    step.classList.toggle("active", stepStatus === status);
  });

  $("trip-next").classList.toggle("hidden", terminal);
  $("trip-next").disabled = status === "searching";
  $("trip-next").textContent =
    status === "searching" ? "Ищем водителя…" :
    status === "assigned" ? "Водитель на месте →" :
    status === "arrived" ? "Начать поездку →" :
    status === "in_progress" ? "Завершить поездку →" :
    "Следующий этап →";

  $("cancel-order").classList.toggle("hidden", !canCancelOrder(activeOrder));
  $("new-order").classList.toggle("hidden", !terminal);
  $("leave-review").classList.toggle(
    "hidden",
    status !== "completed" || Boolean(activeOrder.review)
  );

  $("trip-message").textContent =
    status === "searching" ? "Система подбирает тестового водителя…" :
    status === "cancelled" ? "Заказ отменён. Можно создать новый." :
    status === "completed" ? "Поездка завершена. Реального списания не было." :
    status === "assigned" ? "Водитель назначен. Перейди к следующему этапу." :
    status === "arrived" ? "Водитель ожидает. Начни поездку, когда будешь готов." :
    "Поездка выполняется в демонстрационном режиме.";

  $("trip-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHistory() {
    const list = $("history-list");
    const orders = userOrders();

    list.replaceChildren();
    $("history-empty").classList.toggle("hidden", orders.length > 0);
    for (const order of orders) {
        const item = document.createElement("article");
        item.className = "history-item";

        const details = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = order.tariffName + " · " +
        new Date(order.createdAt).toLocaleString("ru-RU");

        const route = document.createElement("p");
        route.textContent = order.pickup + " → " + order.destination;

        const status = document.createElement("p");
        status.textContent = STATUS_LABELS[order.status] || order.status;

        details.append(title, route, status);

        if (order.review) {
        const review = document.createElement("p");
        review.className = "history-review";
        review.textContent =
            "★".repeat(order.review.rating) +
            "☆".repeat(5 - order.review.rating) +
            (order.review.comment ? " — " + order.review.comment : "");
        details.append(review);
        }

        const summary = document.createElement("div");
        const price = document.createElement("div");
        price.className = "history-price";
        price.textContent = money(order.finalPrice ?? order.price);

        summary.append(price);

        const canReview = order.status === "completed";

        if (canReview) {
        const reviewButton = document.createElement("button");
        reviewButton.type = "button";
        reviewButton.className = "button button-dark button-small";
        reviewButton.textContent = "Оценить";
        reviewButton.addEventListener("click", () => openReview(order));
        summary.append(reviewButton);
        } else {
        const badge = document.createElement("div");
        badge.className = "history-status";
        badge.textContent = order.review ? "Отзыв оставлен" : "";
        summary.append(badge);
        }

        item.append(details, summary);
        list.append(item);
    }
}

function openReview(order) {
  const target = order || activeOrder;

  if (!target || target.status !== "completed") {
    showToast("Оставить отзыв можно только для завершённой поездки.");
    return;
  }

  if (target.review) {
    showToast("Отзыв для этой поездки уже оставлен.");
    return;
  }

  reviewOrder = target;
  $("review-form").reset();
  $("review-error").textContent = "";
  $("review-order-id").value = target.id;
  $("review-modal").classList.remove("hidden");
}

function closeReview() {
  reviewOrder = null;
  $("review-modal").classList.add("hidden");
}

function submitReview(event) {
  event.preventDefault();
  clearMessage("review-error");

  const orderId = $("review-order-id").value;
  const target = reviewOrder && reviewOrder.id === orderId
    ? reviewOrder
    : null;

  if (!target || target.status !== "completed") {
    showMessage("review-error", "Не удалось найти завершённую поездку.");
    return;
  }

  if (target.review) {
    showMessage("review-error", "Отзыв для этой поездки уже отправлен.");
    return;
  }

  const ratingInput = document.querySelector('input[name="rating"]:checked');
  const rating = ratingInput ? Number(ratingInput.value) : 0;
  const comment = $("review-comment").value.trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    showMessage("review-error", "Выбери оценку от 1 до 5.");
    return;
  }

  const orders = getOrders();
  const index = orders.findIndex((item) => item.id === target.id);

  if (index === -1) {
    showMessage("review-error", "Заказ не найден в истории.");
    return;
  }

  orders[index].review = {
    rating,
    comment,
    createdAt: Date.now()
  };
  orders[index].updatedAt = Date.now();

  if (!saveOrders(orders)) return;

  if (activeOrder && activeOrder.id === target.id) {
    activeOrder = orders[index];
    renderTrip();
  }

  closeReview();
  renderHistory();
  showToast("Спасибо! Отзыв сохранён.");
}

function restoreSession() {
  const session = readStorage(STORAGE_KEYS.session, null);

  if (!session || !session.phone) {
    showAuth("login");
    return;
  }

  const normalizedPhone = normalizePhone(session.phone);

  const user = getUsers().find(
    (item) => normalizePhone(item.phone || "") === normalizedPhone
  );

  if (!user) {
    showAuth("login");
    return;
  }

  showApplication(user);
}

function bindEvents() {
  $("tab-login").addEventListener("click", () => switchAuthMode("login"));
  $("tab-register").addEventListener("click", () => switchAuthMode("register"));
  $("auth-form").addEventListener("submit", handleAuthSubmit);
  $("auth-open").addEventListener("click", () => showAuth("login"));
  $("logout-button").addEventListener("click", logout);

  $("order-form").addEventListener("submit", handleCreateOrder);
  $("distance-km").addEventListener("input", updatePriceDisplay);
  $("pickup-address").addEventListener("input", updatePriceDisplay);
  $("destination-address").addEventListener("input", updatePriceDisplay);

  document.querySelectorAll('input[name="tariff"]').forEach((input) => {
    input.addEventListener("change", updatePriceDisplay);
  });

  $("nav-order").addEventListener("click", showOrderView);
  $("nav-history").addEventListener("click", showHistoryView);
  $("brand-home").addEventListener("click", (event) => {
    event.preventDefault();
    if (currentUser) showOrderView();
    else showAuth("login");
  });

  $("back-to-order").addEventListener("click", showOrderView);
  $("history-order").addEventListener("click", showOrderView);
  $("trip-next").addEventListener("click", advanceTrip);
  $("cancel-order").addEventListener("click", cancelOrder);
  $("new-order").addEventListener("click", () => {
    activeOrder = null;
    $("order-form").reset();
    $("distance-km").value = "8";
    updatePriceDisplay();
    showOrderView();
  });

  $("leave-review").addEventListener("click", () => openReview());
  $("review-close").addEventListener("click", closeReview);
  $("review-form").addEventListener("submit", submitReview);

  $("review-modal").addEventListener("click", (event) => {
    if (event.target === $("review-modal")) closeReview();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeReview();
  });
}

function init() {
  bindEvents();
  updatePriceDisplay();
  restoreSession();
}

document.addEventListener("DOMContentLoaded", init);
