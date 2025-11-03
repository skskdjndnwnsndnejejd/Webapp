/* =========================================================================
   /public/script.js
   🎁 PortHub - Telegram Mini-App front (Stylized canvas animation + Supabase)
   - Canvas scenic background: sunset, birds, sun rays, stylized road arc,
     "gangsta duck" car every 30s, ship every 60s, port crane, container,
     bridge, waves.
   - Tabs: Marketplace, My Gifts, Terms, Admin
   - Supabase integration (placeholders)
   - Telegram WebApp integration (telegram-web-app.js must be included in index.html)
   - Commission: 2% on purchases
   ========================================================================= */

/* ------------- CONFIG (заполни реальные значения локально) ------------- */
const SUPABASE_URL = "https://ndpkagnezdnojsfendis.supabase.co";      // <- замените на свой
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kcGthZ25lemRub2pzZmVuZGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxODU1NTAsImV4cCI6MjA3Nzc2MTU1MH0.yFBUraYSm8lISBvmmCuoBzTZYy5fGV_NVdM2ATCilTc";          // <- замените на свой
const API_BASE = ""; // если у тебя node backend проксирует запросы, можно указать путь, иначе ''
// Администратор Telegram ID (как строка). OWNER_TELEGRAM_ID задаётся в среде сервера,
// но фронт всё равно должен знать, текущий пользователь сравнивается с этим значением.
const OWNER_TELEGRAM_ID = "6828396702";

/* ------------- Подгрузка Supabase клиентa (динамически, без npm) -------------
   Здесь используется встроенная мини-реализация для fetch-обёртки Supabase
   чтобы не требовать сборки. Если ты подключаешь @supabase/supabase-js в проекте,
   замени блок с простой fetch-обёрткой на официальный клиент.
-----------------------------------------------------------------------------*/

// Небольшая утилита для вызовa backend API (через node server или напрямую к Supabase REST)
async function apiFetch(path, opts = {}) {
  const url = (API_BASE || "") + path;
  const defaultHeaders = { "Content-Type": "application/json" };
  opts.headers = Object.assign({}, defaultHeaders, opts.headers || {});
  if (opts.body && typeof opts.body === "object") opts.body = JSON.stringify(opts.body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    let err;
    try { err = JSON.parse(text); } catch(e) { err = text; }
    throw { status: res.status, error: err };
  }
  return res.json();
}

/* ------------- Telegram Web App init ------------- */
const tg = window.Telegram ? window.Telegram.WebApp : null;
if (!tg) {
  console.warn("Telegram WebApp SDK не найден. Убедитесь, что в index.html подключён telegram-web-app.js");
}

// initDataUnsafe содержит данные пользователя без проверки подписи (подходит для UI)
let tgUser = null;
try {
  if (tg) {
    tg.expand();
    const initDataUnsafe = tg.initDataUnsafe || {};
    tgUser = initDataUnsafe.user || null;
    // tgUser содержит: id, is_bot, first_name, last_name, username, language_code
  }
} catch (e) {
  console.warn("Не удалось получить initDataUnsafe:", e);
}

/* ------------- DOM helpers ------------- */
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
const $items = qs("#items");
const $giftList = qs("#giftList");
const $balance = qs("#balance");
const $adminResult = qs("#adminResult");
const $giveBtn = qs("#giveBtn");
const $targetIdInput = qs("#targetId");
const $amountInput = qs("#amount");

/* ------------- State ------------- */
const state = {
  user: null,            // Supabase user row: {id, telegram_id, username, balance}
  items: [],             // marketplace items
  gifts: [],             // user's gifts
  selectedItem: null,
  loading: false
};

/* ------------- Supabase helper (simple wrapper) -------------
   Мы используем REST-запросы через Supabase REST API (или через backend).
   Чтобы не раскрывать публично service_role ключ на фронте, лучше вызывать
   свой backend (/api/...) который использует service role key.
   Тем не менее, если ты используешь anon key — подставь в SUPABASE_KEY (но это
   менее безопасно). Обычно frontend использует anon key, backend — service role.
-----------------------------------------------------------------------------*/

const supabaseFetch = async (method, table, body = null, query = "") => {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${method} ${table} failed: ${res.status} ${txt}`);
  }
  return res.json();
};

/* ------------- UI: табы ------------- */
qsa(".tab-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    qsa(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    qsa(".tab").forEach(t => t.classList.remove("active"));
    qs(`#${tab}`).classList.add("active");
  });
});

/* ------------- Data loaders ------------- */

async function authFront() {
  // если у нас есть tgUser (initDataUnsafe), используем telegram_id для регистрации через backend
  try {
    if (!tgUser) {
      // нет tgUser: возможно открыт в браузере напрямую — попробуем прочесть session из cookie
      console.warn("Telegram user not found in initDataUnsafe");
      return;
    }

    const telegram_id = tgUser.id;
    const username = tgUser.username || `${tgUser.first_name || ''}`;

    // Вызов backend /api/auth, чтобы создать/получить user row из Supabase
    // Если у тебя Node backend — используй/api/auth; иначе напрямую запрос к supabase
    try {
      // Prefer backend route if available (safer)
      if (API_BASE) {
        const json = await apiFetch("/api/auth", {
          method: "POST",
          body: { telegram_id, username }
        });
        state.user = json.user;
      } else {
        // Прямой insert/select в users через Supabase REST (anon key required)
        // Проверим существование
        const users = await supabaseFetch("GET", "users", null, `?telegram_id=eq.${telegram_id}`);
        if (users && users.length > 0) {
          state.user = users[0];
        } else {
          // создать
          const created = await supabaseFetch("POST", "users", [{ telegram_id, username, balance: 0 }]);
          if (Array.isArray(created) && created.length > 0) state.user = created[0];
        }
      }
      renderBalance();
    } catch (err) {
      console.error("authFront error:", err);
    }
  } catch (e) {
    console.error("authFront failed:", e);
  }
}

async function loadItems() {
  try {
    // prefer backend
    if (API_BASE) {
      const json = await apiFetch("/api/items");
      state.items = json.items || [];
    } else {
      // fetch via Supabase REST (include owner data via RPC not possible; we'll fetch owner separately)
      // for simplicity, pull items and then fetch users mapping
      const items = await supabaseFetch("GET", "items", null, "?select=*&order=created_at.desc");
      state.items = items;
      // optionally attach owner username
      const ownerIds = [...new Set(state.items.map(it => it.owner_id).filter(Boolean))];
      if (ownerIds.length) {
        const q = ownerIds.map(id => `id.eq.${id}`).join(",");
        // supabase REST doesn't support OR easily; to keep simple we can fetch all users and map
        const users = await supabaseFetch("GET", "users", null, "?select=id,username,telegram_id");
        const usersById = Object.fromEntries((users || []).map(u => [u.id, u]));
        state.items.forEach(it => { it.owner = usersById[it.owner_id] || null; });
      }
    }
    renderItems();
  } catch (e) {
    console.error("loadItems error", e);
    $items.innerHTML = `<div style="color:#ffddaa">Ошибка при загрузке товаров</div>`;
  }
}

async function loadGifts() {
  try {
    if (!state.user) {
      $giftList.innerHTML = `<div>Войдите через Telegram, чтобы увидеть подарки.</div>`;
      return;
    }
    if (API_BASE) {
      const json = await apiFetch(`/api/gifts/${state.user.telegram_id}`);
      state.gifts = json.gifts || [];
    } else {
      // fetch gifts via supabase
      const query = `?select=*&user_id=eq.${state.user.id}`;
      const gifts = await supabaseFetch("GET", "gifts", null, query);
      state.gifts = gifts || [];
    }
    renderGifts();
  } catch (e) {
    console.error("loadGifts error", e);
    $giftList.innerHTML = `<div style="color:#ffddaa">Ошибка при загрузке подарков</div>`;
  }
}

/* ------------- UI renderers ------------- */

function renderBalance() {
  if (!state.user) {
    $balance.innerText = "💰 —";
  } else {
    const val = Number(state.user.balance || 0).toFixed(2);
    $balance.innerText = `💰 ${val} TON`;
  }
}

function renderItems() {
  $items.innerHTML = "";
  if (!state.items || state.items.length === 0) {
    $items.innerHTML = `<div style="padding:14px;color:#eee">Нет товаров в каталоге</div>`;
    return;
  }
  state.items.forEach(it => {
    // item card
    const div = document.createElement("div");
    div.className = "item-card";
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <img src="${it.image || 'https://via.placeholder.com/120x120?text=NFT'}" alt="${escapeHtml(it.name)}"/>
        <div style="min-width:160px">
          <div style="font-weight:700;font-size:16px">${escapeHtml(it.name)}</div>
          <div style="font-size:13px;color:#f7e6ff;margin-top:6px">${truncate(escapeHtml(it.description || ''), 80)}</div>
          <div style="font-size:13px;margin-top:6px;color:#ffd866">Цена: ${Number(it.price).toFixed(2)} TON</div>
          <div style="font-size:12px;color:#ffddee;margin-top:4px">Владелец: ${it.owner ? escapeHtml(it.owner.username || `tg:${it.owner.telegram_id}`) : '—'}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <button class="buy-btn">Приобрести</button>
        <a class="more-link" href="${it.link || '#'}" target="_blank" style="color:#ffd866;font-size:12px;text-decoration:none">Подробнее</a>
      </div>
    `;
    const buyBtn = div.querySelector(".buy-btn");
    buyBtn.addEventListener("click", () => onBuyItem(it.id));
    $items.appendChild(div);
  });
}

function renderGifts() {
  $giftList.innerHTML = "";
  if (!state.gifts || state.gifts.length === 0) {
    $giftList.innerHTML = `<div style="padding:14px;color:#eee">У вас нет подарков</div>`;
    return;
  }
  state.gifts.forEach(g => {
    const div = document.createElement("div");
    div.className = "gift-card";
    div.innerHTML = `
      <img src="${g.image_url || 'https://via.placeholder.com/120x120?text=GIFT'}" alt="${escapeHtml(g.nft_name)}"/>
      <div style="flex:1">
        <div style="font-weight:700">${escapeHtml(g.nft_name)}</div>
        <div style="font-size:12px;color:#ffd8aa">Статус: ${escapeHtml(g.status || '')}</div>
        <div style="margin-top:6px;font-size:13px"><a href="${g.nft_link}" target="_blank" style="color:#ffd866">${g.nft_link}</a></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="list-btn" style="background:transparent;border:1px solid #ffd866;padding:6px;border-radius:8px;color:#ffd866">Выставить лот</button>
      </div>
    `;
    const listBtn = div.querySelector(".list-btn");
    listBtn.addEventListener("click", () => createLotFromGift(g));
    $giftList.appendChild(div);
  });
}

/* ------------- Utility helpers ------------- */
function escapeHtml(s) {
  if (!s && s !== 0) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n-1) + "…" : s;
}

/* ------------- Buying flow ------------- */
async function onBuyItem(itemId) {
  try {
    if (!state.user) {
      alert("Войдите через Telegram, чтобы купить.");
      return;
    }
    const item = state.items.find(i => i.id === itemId);
    if (!item) { alert("Товар не найден"); return; }
    const price = Number(item.price);
    if (Number(state.user.balance) < price) {
      alert("Недостаточно баланса");
      return;
    }
    // Подтверждение покупки
    const ok = confirm(`Купить «${item.name}» за ${price.toFixed(2)} TON? (Комиссия платформы 2%)`);
    if (!ok) return;

    // Вариант: вызываем backend /api/buy (без раскрытия ключа)
    if (API_BASE) {
      const json = await apiFetch("/api/buy", {
        method: "POST",
        body: { buyer_tg: state.user.telegram_id, item_id: itemId }
      });
      if (json.success) {
        // Обновляем локально баланс и перечитываем данные
        await refreshAfterTransaction();
        alert("Покупка успешна!");
      } else {
        alert("Не удалось купить: " + (json.error || "Ошибка"));
      }
    } else {
      // Прямая логика через Supabase REST (внимание: anon key должен позволять обновления)
      // 1) Получим item (re-check)
      const items = await supabaseFetch("GET", "items", null, `?id=eq.${itemId}`);
      if (!items || items.length === 0) throw new Error("Item not found (re-check)");
      const it = items[0];
      // 2) buyer row
      const buyers = await supabaseFetch("GET", "users", null, `?telegram_id=eq.${state.user.telegram_id}`);
      if (!buyers || buyers.length === 0) throw new Error("Buyer not found");
      const buyer = buyers[0];
      if (Number(buyer.balance) < Number(it.price)) throw new Error("Insufficient balance");

      // 3) seller
      const sellers = await supabaseFetch("GET", "users", null, `?id=eq.${it.owner_id}`);
      if (!sellers || sellers.length === 0) throw new Error("Seller not found");
      const seller = sellers[0];

      // 4) transaction: update balances and item owner, insert transactions row
      const commission = Number(it.price) * 0.02;
      const sellerGets = Number(it.price) - commission;
      // Update buyer balance
      await supabaseFetch("PATCH", "users", { balance: Number(buyer.balance) - Number(it.price) }, `?telegram_id=eq.${buyer.telegram_id}`);
      // Update seller balance
      await supabaseFetch("PATCH", "users", { balance: Number(seller.balance) + sellerGets }, `?id=eq.${seller.id}`);
      // Update item owner
      await supabaseFetch("PATCH", "items", { owner_id: buyer.id }, `?id=eq.${it.id}`);
      // Insert transaction
      await supabaseFetch("POST", "transactions", [{ buyer_id: buyer.id, seller_id: seller.id, item_id: it.id, amount: it.price }]);
      await refreshAfterTransaction();
      alert("Покупка успешна!");
    }
  } catch (e) {
    console.error("onBuyItem error", e);
    alert("Ошибка при покупке: " + (e.message || JSON.stringify(e)));
  }
}

async function refreshAfterTransaction() {
  // Перечитать данные: пользователь, товары, подарки
  try {
    if (API_BASE) {
      const bal = await apiFetch(`/api/balance/${state.user.telegram_id}`);
      if (bal && typeof bal.balance !== "undefined") {
        state.user.balance = bal.balance;
      }
      await loadItems();
      await loadGifts();
      renderBalance();
    } else {
      // direct
      const users = await supabaseFetch("GET", "users", null, `?telegram_id=eq.${state.user.telegram_id}`);
      if (users && users.length > 0) state.user = users[0];
      await loadItems();
      await loadGifts();
      renderBalance();
    }
  } catch (e) {
    console.error("refreshAfterTransaction error", e);
  }
}

/* ------------- Admin give balance ------------- */
$giveBtn.addEventListener("click", async () => {
  try {
    const target = $targetIdInput.value.trim();
    const amount = Number($amountInput.value);
    if (!target || !amount || amount <= 0) { alert("Заполните корректно ID и сумму"); return; }
    // Только admin (локальная проверка): если текущий tgUser.id !== OWNER_TELEGRAM_ID — бекенд вернёт 403
    if (API_BASE) {
      const resp = await apiFetch("/api/admin/give", {
        method: "POST",
        body: { admin_id: tgUser ? tgUser.id : null, target_id: target, amount }
      });
      if (resp && resp.success) {
        $adminResult.innerText = `Выдано ${amount.toFixed(2)} TON пользователю ${target}. Новый баланс: ${resp.newBalance}`;
      } else {
        $adminResult.innerText = `Ошибка: ${JSON.stringify(resp)}`;
      }
    } else {
      // direct supabase approach: find user by telegram_id
      const users = await supabaseFetch("GET", "users", null, `?telegram_id=eq.${target}`);
      if (!users || users.length === 0) { alert("Пользователь не найден"); return; }
      const usr = users[0];
      await supabaseFetch("PATCH", "users", { balance: Number(usr.balance) + amount }, `?telegram_id=eq.${target}`);
      $adminResult.innerText = `Выдано ${amount.toFixed(2)} TON пользователю ${target}.`;
    }
    // если текущий пользователь — тот, кого пополнили, обновим баланс в UI
    if (state.user && String(state.user.telegram_id) === String(target)) {
      await refreshAfterTransaction();
    }
  } catch (e) {
    console.error("admin give error", e);
    $adminResult.innerText = `Ошибка: ${e.message || JSON.stringify(e)}`;
  }
});

/* ------------- Create lot from gift (flow) ------------- */
async function createLotFromGift(gift) {
  try {
    if (!state.user) { alert("Войдите через Telegram"); return; }
    const priceStr = prompt("Укажите цену лота (TON) — комиссия 2% будет удержана при продаже", "1.00");
    if (!priceStr) return;
    const price = Number(priceStr);
    if (isNaN(price) || price <= 0) { alert("Некорректная цена"); return; }

    // Создадим item в items, owner = current user
    if (API_BASE) {
      const resp = await apiFetch("/api/items/new", {
        method: "POST",
        body: {
          telegram_id: state.user.telegram_id,
          name: gift.nft_name || "Gift",
          description: `Лот из My Gifts: ${gift.nft_name}`,
          price,
          image: gift.image_url,
          link: gift.nft_link
        }
      });
      if (resp.success) {
        alert("Лот выставлен");
        await loadItems();
      } else {
        alert("Ошибка при выставлении лота");
      }
    } else {
      // direct supabase insertion (owner_id = state.user.id)
      await supabaseFetch("POST", "items", [{
        name: gift.nft_name || "Gift",
        description: `Лот из My Gifts: ${gift.nft_name}`,
        price,
        owner_id: state.user.id,
        image: gift.image_url,
        link: gift.nft_link
      }]);
      alert("Лот выставлен");
      await loadItems();
    }
  } catch (e) {
    console.error("createLotFromGift error", e);
    alert("Ошибка при выставлении лота: " + (e.message || JSON.stringify(e)));
  }
}

/* ------------- Init app ------------- */
async function initApp() {
  try {
    // 1) auth front (create/get user)
    await authFront();
    // 2) load items + gifts
    await loadItems();
    await loadGifts();
    // 3) render
    renderBalance();
    // 4) start animation
    startScene();
  } catch (e) {
    console.error("initApp error", e);
  }
}
initApp();

/* =========================
   CANVAS: stylized scene
   ========================= */

/* Canvas setup */
const canvas = qs("#sunsetCanvas");
const ctx = canvas.getContext("2d");
let W = window.innerWidth;
let H = window.innerHeight;
canvas.width = W;
canvas.height = H;

/* Resize handling */
function onResize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;
}
window.addEventListener("resize", onResize);

/* Stylized scene parameters */
const scene = {
  time: 0,
  birds: [],
  ships: [],
  duckCars: [],
  clouds: [],
  crane: {
    x: W * 0.75,
    y: H * 0.55,
    armAngle: -0.6,
    containerY: null,
    containerState: "idle" // idle | down | up | hold
  },
  lastDuckSpawn: performance.now(),
  lastShipSpawn: performance.now()
};

/* Utility randoms */
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

/* Initialize birds, clouds */
function seedScene() {
  scene.birds = [];
  const birdCount = Math.max(3, Math.floor(W / 240));
  for (let i = 0; i < birdCount; i++) {
    scene.birds.push({
      x: rand(-W*0.2, W),
      y: rand(H*0.05, H*0.25),
      speed: rand(0.4, 1.3),
      dir: Math.random() < 0.5 ? 1 : -1,
      wingPhase: Math.random() * Math.PI*2
    });
  }
  scene.clouds = [];
  const cloudCount = Math.max(3, Math.floor(W / 500));
  for (let i=0;i<cloudCount;i++){
    scene.clouds.push({
      x: rand(0, W),
      y: rand(H*0.02, H*0.20),
      size: rand(80, 220),
      speed: rand(0.05, 0.25)
    });
  }
  scene.ships = [];
  // initial ship might be none; spawn periodically via tick
  scene.duckCars = [];
  // crane initial container position (resting at top)
  scene.crane.containerY = scene.crane.y - 60;
}
seedScene();

/* Duck car spawn: each 30s one duck drives along arc */
function spawnDuckCar() {
  // duckCar object with startTime; path parameter t in [0,1]
  const spawn = {
    startTime: performance.now(),
    duration: 30000, // 30 seconds for whole arc
    spriteScale: rand(0.9, 1.1),
    offsetY: rand(-20, 20),
    color: "#ffd24a"
  };
  scene.duckCars.push(spawn);
}

/* Ship spawn: every 60s */
function spawnShip() {
  const spawn = {
    startTime: performance.now(),
    duration: 60000,
    y: H*0.72 + rand(-6, 12),
    speed: rand(0.2, 0.6),
    width: rand(120, 240),
    color: "#ff8aa3"
  };
  scene.ships.push(spawn);
}

/* Crane cycle: pick up and drop container every 18-28s */
let craneTimer = performance.now() + rand(8000, 16000);
function tryCraneCycle(now) {
  if (now > craneTimer && scene.crane.containerState === "idle") {
    scene.crane.containerState = "down";
    craneTimer = now + rand(18000, 30000); // next cycle
  }
}

/* Background gradient: stylized yellow->purple sunset */
function drawSky() {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#fff2c9");
  grd.addColorStop(0.25, "#ffd86f");
  grd.addColorStop(0.6, "#9b4ff2");
  grd.addColorStop(1, "#130026");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
}

/* Sun with occasional rays flash */
let lastSunFlash = 0;
function drawSun(now) {
  const sunX = W * 0.15;
  const sunY = H * 0.18;
  const r = Math.min(W, H) * 0.08;
  // subtle pulsing
  const pulse = 1 + 0.03 * Math.sin(now / 600);
  ctx.save();
  // glow
  const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r*3);
  g.addColorStop(0, "rgba(255,241,163,0.9)");
  g.addColorStop(0.4, "rgba(255,194,87,0.45)");
  g.addColorStop(1, "rgba(158,89,255,0.0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sunX, sunY, r*3, 0, Math.PI*2);
  ctx.fill();

  // disc
  ctx.beginPath();
  ctx.fillStyle = "#fff6c6";
  ctx.arc(sunX, sunY, r * pulse, 0, Math.PI*2);
  ctx.fill();

  // optional rays (rare)
  if (Math.random() < 0.002 || (now - lastSunFlash) > 12000 && Math.random() < 0.05) {
    lastSunFlash = now;
    // animate rays: draw a set of translucent rays
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      const ang = (i / 9) * Math.PI * 2 + Math.random()*0.2;
      const lx = sunX + Math.cos(ang) * r * 4;
      const ly = sunY + Math.sin(ang) * r * 4;
      ctx.lineTo(lx, ly);
      ctx.strokeStyle = "rgba(255,234,145,0.06)";
      ctx.lineWidth = 18;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* Birds draw */
function updateAndDrawBirds(dt) {
  ctx.save();
  scene.birds.forEach(b => {
    b.wingPhase += dt * 0.02 * b.speed;
    b.x += b.dir * b.speed * dt * 0.03;
    // wrap
    if (b.dir > 0 && b.x > W + 60) b.x = -60;
    if (b.dir < 0 && b.x < -60) b.x = W + 60;
    // draw stylized bird (V shape)
    ctx.beginPath();
    const wing = Math.sin(b.wingPhase) * 6;
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - 16 * b.dir, b.y - 8 + wing);
    ctx.lineTo(b.x - 28 * b.dir, b.y - 2);
    ctx.strokeStyle = "#fff7d8";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  });
  ctx.restore();
}

/* Clouds draw */
function updateAndDrawClouds(dt) {
  ctx.save();
  scene.clouds.forEach(c => {
    c.x += c.speed * dt * 0.02;
    if (c.x > W + c.size) c.x = -c.size;
    // draw a simple cloud using circles
    const y = c.y;
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.ellipse(c.x, y, c.size*0.6, c.size*0.35, 0, 0, Math.PI*2);
    ctx.ellipse(c.x + c.size*0.35, y + 6, c.size*0.5, c.size*0.3, 0, 0, Math.PI*2);
    ctx.ellipse(c.x - c.size*0.28, y + 3, c.size*0.45, c.size*0.28, 0, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.restore();
}

/* Stylized sea with waves */
function drawSea(now) {
  const seaTop = H * 0.68;
  // gradient sea
  const g = ctx.createLinearGradient(0, seaTop, 0, H);
  g.addColorStop(0, "#35185a");
  g.addColorStop(1, "#0a0030");
  ctx.fillStyle = g;
  ctx.fillRect(0, seaTop, W, H - seaTop);

  // simple wave lines
  ctx.save();
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    const amp = 6 + i * 3;
    const freq = 0.002 + i * 0.0012;
    ctx.moveTo(0, seaTop + 12*i);
    for (let x = 0; x <= W; x += 10) {
      const y = seaTop + 12*i + Math.sin((now * 0.002 + x * freq) + i) * amp;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = ["#ffd8a6","#ffb36a","#ff9bb2","#c89aff"][i] || "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/* Bridge draw (silhouette) */
function drawBridge() {
  const bridgeY = H * 0.56;
  ctx.save();
  ctx.fillStyle = "rgba(8,4,22,0.85)";
  ctx.fillRect(0, bridgeY - 8, W, 14);
  // draw arches
  const archCount = 6;
  for (let i=0;i<archCount;i++){
    const x = (i / archCount) * W;
    ctx.beginPath();
    ctx.ellipse(x + W/archCount/2, bridgeY+6, W/archCount/2.6, 22, 0, 0, Math.PI);
    ctx.fillStyle = "rgba(8,4,22,0.9)";
    ctx.fill();
  }
  ctx.restore();
}

/* Road arc draw: stylized curve across the scene (foreground) */
function drawRoad(now) {
  // Road is an arc; we'll draw an exaggerated curve across bottom half
  const roadTop = H * 0.78;
  ctx.save();
  // base
  ctx.beginPath();
  ctx.moveTo(-W * 0.2, roadTop);
  ctx.quadraticCurveTo(W * 0.5, H * 0.52, W * 1.2, roadTop);
  ctx.lineTo(W * 1.2, H);
  ctx.lineTo(-W * 0.2, H);
  ctx.closePath();
  ctx.fillStyle = "#221522";
  ctx.fill();

  // road outline strip
  ctx.beginPath();
  ctx.moveTo(-W * 0.2, roadTop + 18);
  ctx.quadraticCurveTo(W * 0.5, H * 0.545, W * 1.2, roadTop + 18);
  ctx.strokeStyle = "#1c0f18";
  ctx.lineWidth = 6;
  ctx.stroke();

  // dashed center line
  ctx.save();
  ctx.setLineDash([40, 30]);
  ctx.lineDashOffset = -(now * 0.02);
  ctx.beginPath();
  ctx.moveTo(-W * 0.2, roadTop + 9);
  ctx.quadraticCurveTo(W * 0.5, H * 0.535, W * 1.2, roadTop + 9);
  ctx.strokeStyle = "#ffd86f";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/* Path along arc: bilinear mapping - param t in [0,1] -> (x,y) */
function arcPath(t) {
  // Quadratic Bezier: P0 -> P1 -> P2
  const P0 = { x: -W * 0.2, y: H * 0.78 + 9 };
  const P1 = { x: W * 0.5, y: H * 0.52 + 6 };
  const P2 = { x: W * 1.2, y: H * 0.78 + 9 };

  // Quadratic Bezier formula
  const x = (1 - t) * (1 - t) * P0.x + 2 * (1 - t) * t * P1.x + t * t * P2.x;
  const y = (1 - t) * (1 - t) * P0.y + 2 * (1 - t) * t * P1.y + t * t * P2.y;
  return { x, y };
}

/* Duck car draw: stylized yellow car with sunglasses (very simple) */
function drawDuckCarInstance(inst, now) {
  const elapsed = now - inst.startTime;
  const t = Math.min(1, elapsed / inst.duration);
  // ease in-out quad
  const ease = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
  const pos = arcPath(ease);
  // slight bob
  const bob = Math.sin((elapsed / 600) * Math.PI*2) * 4 + inst.offsetY;

  // car body
  ctx.save();
  ctx.translate(pos.x, pos.y + bob);
  ctx.scale(inst.spriteScale, inst.spriteScale);
  // shadow
  ctx.beginPath();
  ctx.ellipse(0, 26, 46, 12, 0, 0, Math.PI*2);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fill();

  // car
  ctx.beginPath();
  roundRect(ctx, -48, -6, 96, 28, 8);
  ctx.fillStyle = inst.color;
  ctx.fill();

  // roof
  ctx.beginPath();
  roundRect(ctx, -22, -20, 44, 18, 6);
  ctx.fillStyle = "#ffd06c";
  ctx.fill();

  // windows (sunglasses)
  ctx.beginPath();
  ctx.rect(-14, -18, 28, 12);
  ctx.fillStyle = "#201a2b";
  ctx.fill();

  // wheels
  ctx.beginPath();
  ctx.arc(-26, 18, 8, 0, Math.PI*2);
  ctx.arc(26, 18, 8, 0, Math.PI*2);
  ctx.fillStyle = "#0e0b10";
  ctx.fill();

  // duck beak (front)
  ctx.beginPath();
  ctx.moveTo(48, -2);
  ctx.lineTo(62, 0);
  ctx.lineTo(48, 8);
  ctx.fillStyle = "#ffd24a";
  ctx.fill();

  // little decal
  ctx.beginPath();
  ctx.rect(-46, -4, 8, 6);
  ctx.fillStyle = "#ff5a9e";
  ctx.fill();

  ctx.restore();
}

/* Ship draw */
function drawShipInstance(ship, now) {
  const elapsed = now - ship.startTime;
  const t = (elapsed % ship.duration) / ship.duration;
  // ship moves left to right
  const x = -ship.width + (W + ship.width*2) * t;
  const y = ship.y;
  ctx.save();
  ctx.translate(x, y);
  // hull
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(ship.width * 0.85, 18);
  ctx.quadraticCurveTo(ship.width * 0.95, 18, ship.width, 10);
  ctx.lineTo(ship.width, -8);
  ctx.lineTo(0, -8);
  ctx.closePath();
  ctx.fillStyle = "#ffcad6";
  ctx.fill();

  // cabin
  ctx.beginPath();
  ctx.rect(ship.width * 0.15, -20, ship.width * 0.32, 12);
  ctx.fillStyle = "#ffffffaa";
  ctx.fill();

  // smokestack
  ctx.beginPath();
  ctx.rect(ship.width * 0.55, -26, 10, 14);
  ctx.fillStyle = "#d14f8a";
  ctx.fill();

  // small flag
  ctx.beginPath();
  ctx.moveTo(ship.width - 6, -28);
  ctx.lineTo(ship.width + 10, -22);
  ctx.lineTo(ship.width - 6, -16);
  ctx.fillStyle = "#ffd86f";
  ctx.fill();

  ctx.restore();
}

/* Crane draw and container logic */
function updateAndDrawCrane(now, dt) {
  const cr = scene.crane;
  ctx.save();
  // crane base
  const baseX = cr.x;
  const baseY = cr.y;
  ctx.translate(baseX, baseY);
  // support
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(-12, 60);
  ctx.lineTo(12, 60);
  ctx.lineTo(6, 0);
  ctx.closePath();
  ctx.fillStyle = "#2b1732";
  ctx.fill();

  // arm
  cr.armAngle += Math.sin(now/4000) * 0.0006; // tiny sway
  ctx.save();
  ctx.rotate(cr.armAngle);
  ctx.fillStyle = "#3a2143";
  roundRect(ctx, 0, -6, 220, 12, 6);
  // cable
  const cableX = 200;
  let contY = cr.containerY || ( -60 );
  if (cr.containerState === "down") {
    // lower container until near sea then hold
    cr.containerY = (cr.containerY === null) ? -60 : cr.containerY;
    cr.containerY += dt * 0.06;
    if (cr.containerY > 40) {
      cr.containerState = "hold";
      // after hold, raise
      setTimeout(()=>{ cr.containerState = "up"; }, 1600);
    }
    contY = cr.containerY;
  } else if (cr.containerState === "up") {
    cr.containerY -= dt * 0.04;
    if (cr.containerY < -60) {
      cr.containerState = "idle";
      cr.containerY = -60;
    }
    contY = cr.containerY;
  } else {
    // idle
    if (cr.containerY === null) cr.containerY = -60;
    contY = cr.containerY;
  }
  ctx.beginPath();
  ctx.moveTo(cableX, 0);
  ctx.lineTo(cableX, contY);
  ctx.strokeStyle = "#1f1b26";
  ctx.lineWidth = 2;
  ctx.stroke();

  // container
  ctx.fillStyle = "#ff6b6b";
  roundRect(ctx, cableX - 18, contY, 36, 22, 3);
  ctx.restore();
  ctx.restore();
}

/* Helper: rounded rect */
function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
}

/* Main render loop */
let lastFrame = performance.now();
function tick(now) {
  const dt = now - lastFrame;
  lastFrame = now;
  scene.time += dt;

  // spawn duck every 30s
  if (now - scene.lastDuckSpawn > 30000) {
    scene.lastDuckSpawn = now;
    spawnDuckCar();
  }
  // spawn ship every 60s
  if (now - scene.lastShipSpawn > 60000) {
    scene.lastShipSpawn = now;
    spawnShip();
  }

  // crane cycles
  tryCraneCycle(now);

  // background
  drawSky();
  updateAndDrawBirds(dt);
  updateAndDrawClouds(dt);
  drawSun(now);
  drawSea(now);
  drawBridge();
  drawRoad(now);

  // ships (behind road but above sea)
  for (let i = scene.ships.length - 1; i >= 0; i--) {
    const s = scene.ships[i];
    drawShipInstance(s, now);
    // remove old ships if too old
    if (now - s.startTime > s.duration + 5000) {
      scene.ships.splice(i, 1);
    }
  }

  // crane and container
  updateAndDrawCrane(now, dt);

  // duck cars (in front)
  for (let i = scene.duckCars.length - 1; i >= 0; i--) {
    const d = scene.duckCars[i];
    drawDuckCarInstance(d, now);
    if (now - d.startTime > d.duration + 4000) {
      scene.duckCars.splice(i, 1);
    }
  }

  // small foreground shimmer
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, H*0.76, W, H*0.24);
  ctx.restore();

  requestAnimationFrame(tick);
}

/* Start scene */
function startScene() {
  lastFrame = performance.now();
  requestAnimationFrame(tick);
}

/* ------------- END of Canvas / Scene ------------- */

/* Hook window focus/visibility to pause heavy tasks if needed (optional) */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // potentially stop animation loop or reduce frame rate
  } else {
    // resume
    lastFrame = performance.now();
  }
});

/* ------------- Misc: small helper functions for debug ------------- */
window.__porthub_reload = async function() {
  await loadItems(); await loadGifts();
  await refreshAfterTransaction();
  alert("Reloaded data");
};

/* ============================
   End of /public/script.js
   ============================
*/
