/* =========================================================================
   /public/script.js
   PortHub — Blue-Black Marketplace frontend (Supabase via backend)
   Features:
   - Tabs: NFT's | My Gifts | Terms | Admin Panel
   - Simple, professional blue-black design (styling in CSS)
   - Inputs: dull blue; Buttons: cyan
   - All Supabase access through backend endpoints (no keys here)
   - SSE /events listener for real-time gift detection (gifts sent to manager 6828395702)
   - Calls expected backend routes:
       POST /api/auth                { telegram_id, username } -> { user }
       GET  /api/items               -> { items }
       POST /api/items/new           { telegram_id, name, price, image, link }
       POST /api/buy                 { buyer_tg, item_id } -> { success }
       GET  /api/gifts/:telegram_id  -> { gifts }
       POST /api/admin/give          { admin_id, target_id, amount } -> { success }
       GET  /api/balance/:telegram_id -> { balance }
       SSE  /events                  -> events: new_gift, new_lot, etc.
   ========================================================================= */

/* =========================
   CONFIG
   ========================= */
const API_BASE = ""; // если backend на том же домене, оставь пустым; иначе полный URL "https://your-app.onrender.com"
const OWNER_TELEGRAM_ID = "6828396702"; // менеджер, на аккаунт которого кидают NFT

/* =========================
   DOM helpers
   ========================= */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const create = (t, cls = "", html = "") => { const el = document.createElement(t); if (cls) el.className = cls; if (html) el.innerHTML = html; return el; };

/* =========================
   Simple state
   ========================= */
const State = {
  user: null,     // {id, telegram_id, username, balance}
  items: [],      // marketplace items
  gifts: [],      // user's gifts
  sse: null,
};

/* =========================
   UI elements (assume index.html has these IDs/classes)
   ========================= */
const elBalance = $("#balance");
const elItems = $("#items");
const elGifts = $("#giftList");
const elAdminResult = $("#adminResult");
const btnGive = $("#giveBtn");
const inputTarget = $("#targetId");
const inputAmount = $("#amount");

/* =========================
   UTIL
   ========================= */
function esc(s) { if (s == null) return ""; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function fmt(v) { return parseFloat(v || 0).toFixed(2); }

/* =========================
   API helper (talk to backend)
   ========================= */
async function apiFetch(path, opts = {}) {
  const url = (API_BASE || "") + path;
  const cfg = {
    method: opts.method || "GET",
    headers: Object.assign({ "Content-Type": "application/json" }, opts.headers || {}),
    credentials: "same-origin",
  };
  if (opts.body !== undefined) cfg.body = JSON.stringify(opts.body);
  const res = await fetch(url, cfg);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed ${res.status}: ${text}`);
  }
  return res.json();
}

/* =========================
   Telegram init (optional)
   ========================= */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
let tgUser = null;
if (tg) {
  try {
    tg.expand();
    tgUser = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : null;
  } catch (e) { console.warn("tg init error", e); }
}

/* =========================
   AUTH frontend -> call backend /api/auth
   ========================= */
async function authFront() {
  try {
    if (!tgUser) {
      console.warn("No tg user in initDataUnsafe; UI still works for testing.");
      return;
    }
    const payload = { telegram_id: tgUser.id, username: tgUser.username || tgUser.first_name || "" };
    const json = await apiFetch("/api/auth", { method: "POST", body: payload });
    State.user = json.user;
    renderBalance();
  } catch (e) {
    console.error("authFront error", e);
  }
}

/* =========================
   Load items & gifts
   ========================= */
async function loadItems() {
  try {
    const json = await apiFetch("/api/items");
    State.items = json.items || [];
    renderItems();
  } catch (e) {
    console.error("loadItems", e);
    elItems.innerHTML = `<div class="empty">Ошибка загрузки каталога</div>`;
  }
}

async function loadGifts() {
  try {
    if (!State.user) {
      elGifts.innerHTML = `<div class="empty">Войдите через Telegram, чтобы увидеть ваши подарки</div>`;
      return;
    }
    const json = await apiFetch(`/api/gifts/${State.user.telegram_id}`);
    State.gifts = json.gifts || [];
    renderGifts();
  } catch (e) {
    console.error("loadGifts", e);
    elGifts.innerHTML = `<div class="empty">Ошибка загрузки подарков</div>`;
  }
}

/* =========================
   Render helpers (blue-black theme)
   Note: actual CSS must define classes for visual appearance.
   ========================= */
function renderBalance() {
  if (!elBalance) return;
  if (!State.user) elBalance.textContent = "TON: —";
  else elBalance.textContent = `TON: ${fmt(State.user.balance)}`;
}

function renderItems() {
  elItems.innerHTML = "";
  if (!State.items || State.items.length === 0) {
    elItems.innerHTML = `<div class="empty">Нет товаров</div>`;
    return;
  }
  for (const it of State.items) {
    const card = create("div", "item-card");
    const left = create("div", "item-left");
    const img = create("img", "item-img");
    img.src = it.image || "/images/placeholder-nft.png";
    img.alt = it.name || "NFT";
    const meta = create("div", "item-meta");
    meta.innerHTML = `<div class="item-title">${esc(it.name)}</div>
                      <div class="item-desc">${esc(it.description || "")}</div>
                      <div class="item-price">Цена: <span class="price">${fmt(it.price)}</span> TON</div>
                      <div class="item-owner">Владелец: <span class="mono">${it.owner ? esc(it.owner.username || it.owner.telegram_id) : "—"}</span></div>`;
    left.appendChild(img);
    left.appendChild(meta);

    const right = create("div", "item-right");
    const buy = create("button", "btn btn-primary", "Купить");
    buy.addEventListener("click", () => buyItem(it.id));
    const more = create("a", "link-more", "Подробнее");
    more.href = it.link || "#";
    more.target = "_blank";
    right.appendChild(buy);
    right.appendChild(more);

    card.appendChild(left);
    card.appendChild(right);
    elItems.appendChild(card);
  }
}

function renderGifts() {
  elGifts.innerHTML = "";
  if (!State.gifts || State.gifts.length === 0) {
    elGifts.innerHTML = `<div class="empty">Нет подарков</div>`;
    return;
  }
  for (const g of State.gifts) {
    const card = create("div", "gift-card");
    const img = create("img", "gift-img");
    img.src = g.image_url || "/images/placeholder-gift.png";
    const meta = create("div", "gift-meta");
    meta.innerHTML = `<div class="gift-name">${esc(g.nft_name)}</div>
                      <div class="gift-link"><a href="${esc(g.nft_link)}" target="_blank">${esc(g.nft_link)}</a></div>
                      <div class="gift-status">Статус: <span class="mono">${esc(g.status || "в наличии")}</span></div>`;
    const actions = create("div", "gift-actions");
    const listBtn = create("button", "btn btn-outline", "Выставить лот");
    listBtn.addEventListener("click", () => createLotFromGift(g));
    actions.appendChild(listBtn);

    card.appendChild(img);
    card.appendChild(meta);
    card.appendChild(actions);
    elGifts.appendChild(card);
  }
}

/* =========================
   Purchase flow
   ========================= */
async function buyItem(itemId) {
  try {
    if (!State.user) { alert("Войдите через Telegram для покупки."); return; }
    const it = State.items.find(i => i.id === itemId);
    if (!it) { alert("Товар не найден."); return; }
    if (Number(State.user.balance) < Number(it.price)) { alert("Недостаточно средств."); return; }
    const ok = confirm(`Купить "${it.name}" за ${fmt(it.price)} TON? (Комиссия 2%)`);
    if (!ok) return;

    const res = await apiFetch("/api/buy", { method: "POST", body: { buyer_tg: State.user.telegram_id, item_id: itemId } });
    if (res && res.success) {
      await refreshDataAfterTx();
      alert("Покупка успешна.");
    } else {
      alert("Ошибка покупки.");
    }
  } catch (e) {
    console.error("buyItem error", e);
    alert("Ошибка покупки: " + (e.message || e));
  }
}

/* =========================
   Create lot from gift
   ========================= */
async function createLotFromGift(gift) {
  try {
    if (!State.user) { alert("Войдите через Telegram"); return; }
    const priceStr = prompt("Укажите цену (TON) для выставления лота:", "1.00");
    if (!priceStr) return;
    const price = Number(priceStr);
    if (isNaN(price) || price <= 0) { alert("Некорректная цена"); return; }
    const res = await apiFetch("/api/items/new", {
      method: "POST",
      body: {
        telegram_id: State.user.telegram_id,
        name: gift.nft_name || "Gift",
        description: `Лот из My Gifts: ${gift.nft_name || ""}`,
        price: price,
        image: gift.image_url,
        link: gift.nft_link
      }
    });
    if (res && res.success) {
      await loadItems();
      alert("Лот выставлен.");
    } else {
      alert("Ошибка выставления лота.");
    }
  } catch (e) {
    console.error("createLotFromGift", e);
    alert("Ошибка выставления лота: " + (e.message || e));
  }
}

/* =========================
   Admin: give balance
   ========================= */
if (btnGive) {
  btnGive.addEventListener("click", async () => {
    const target = (inputTarget && inputTarget.value) ? inputTarget.value.trim() : null;
    const amount = Number(inputAmount && inputAmount.value ? inputAmount.value : 0);
    if (!target || !amount || amount <= 0) { alert("Укажите корректный ID и сумму."); return; }
    try {
      const res = await apiFetch("/api/admin/give", { method: "POST", body: { admin_id: tgUser ? tgUser.id : null, target_id: target, amount } });
      if (res && res.success) {
        elAdminResult.textContent = `Выдано ${fmt(amount)} TON пользователю ${target}.`;
        if (State.user && String(State.user.telegram_id) === String(target)) await refreshDataAfterTx();
      } else {
        elAdminResult.textContent = `Ошибка: ${JSON.stringify(res)}`;
      }
    } catch (e) {
      console.error("admin give", e);
      elAdminResult.textContent = `Ошибка: ${e.message || e}`;
    }
  });
}

/* =========================
   Refresh after transaction
   ========================= */
async function refreshDataAfterTx() {
  try {
    if (State.user) {
      const bal = await apiFetch(`/api/balance/${State.user.telegram_id}`);
      if (bal && typeof bal.balance !== "undefined") State.user.balance = bal.balance;
    }
    await loadItems();
    await loadGifts();
    renderBalance();
  } catch (e) {
    console.error("refreshDataAfterTx", e);
  }
}

/* =========================
   SSE: connect to /events to receive new_gift events
   ========================= */
function connectSSE() {
  try {
    if (State.sse) { State.sse.close(); State.sse = null; }
    const url = (API_BASE || "") + "/events";
    const es = new EventSource(url, { withCredentials: true });
    State.sse = es;
    es.onopen = () => console.info("SSE connected");
    es.onerror = e => {
      console.warn("SSE error", e);
      // reconnect with delay
      setTimeout(connectSSE, 5000);
    };
    es.addEventListener("new_gift", ev => {
      try {
        const payload = JSON.parse(ev.data);
        handleNewGift(payload);
      } catch (e) { console.error("parse new_gift", e); }
    });
    es.addEventListener("new_lot", ev => {
      try {
        const payload = JSON.parse(ev.data);
        // refresh items
        loadItems();
      } catch (e) { console.error("parse new_lot", e); }
    });
  } catch (e) {
    console.error("connectSSE failed", e);
  }
}

/* =========================
   Handle incoming gift event
   payload expected structure:
     { gift: {...}, from_telegram_id: "...", from_username: "...", to_telegram_id: "6828..." }
   Server should emit this when gifts table gets new row or Telegram webhook detects incoming gift.
   ========================= */
function handleNewGift(payload) {
  try {
    const gift = payload.gift || payload;
    // show simple toast
    showToast(`Новый подарок: ${gift.nft_name || "подарок"}`);
    // If current user is the sender, refresh their My Gifts
    if (State.user && String(State.user.telegram_id) === String(payload.from_telegram_id)) {
      loadGifts();
    }
    // If gift sent to manager, server probably created a gifts record on behalf of sender;
    // If current user is owner (manager), refresh manager's gifts
    if (State.user && String(State.user.telegram_id) === String(OWNER_TELEGRAM_ID)) {
      loadGifts();
    }
  } catch (e) {
    console.error("handleNewGift error", e);
  }
}

/* =========================
   Small toast utility
   ========================= */
const toastRoot = (function() {
  let r = $("#ph-toasts");
  if (!r) {
    r = create("div", "");
    r.id = "ph-toasts";
    r.style.position = "fixed";
    r.style.right = "18px";
    r.style.bottom = "18px";
    r.style.zIndex = "9999";
    document.body.appendChild(r);
  }
  return r;
})();

function showToast(msg, ttl = 3000) {
  const el = create("div", "ph-toast", esc(msg));
  el.style.background = "rgba(10,20,40,0.9)";
  el.style.color = "#e6f7ff";
  el.style.padding = "10px 14px";
  el.style.borderRadius = "10px";
  el.style.boxShadow = "0 8px 28px rgba(0,0,0,0.6)";
  el.style.marginTop = "8px";
  toastRoot.appendChild(el);
  requestAnimationFrame(() => el.style.opacity = "1");
  setTimeout(() => { el.style.opacity = "0"; setTimeout(()=> el.remove(), 400); }, ttl);
}

/* =========================
   Tabs behaviour (simple)
   ========================= */
$$(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    $$(".tab").forEach(t => t.classList.remove("active"));
    $(`#${tab}`).classList.add("active");
  });
});

/* =========================
   Init sequence
   ========================= */
async function init() {
  try {
    if (tgUser) {
      await authFront();
    }
    await loadItems();
    await loadGifts();
    connectSSE();
    renderBalance();
  } catch (e) {
    console.error("init error", e);
  }
}
init();

/* =========================
   Minimal styles note (should be in style.css)
   - body background: dark grey/black
   - banner: black, PortHub text tuśklo-grey + gift icon
   - inputs: background #0e1b33 (dull blue)
   - buttons: background #36c3ff (cyan)
   - text: mostly light grey
   ========================= */

/* =========================
   SERVER SIDE REMINDERS (what server must implement)
   =========================
   1) /api/auth (POST) - creates or returns user row by telegram_id
   2) /api/items (GET) - returns items with owner info (join users)
   3) /api/items/new (POST) - create new item; body: telegram_id, name, description, price, image, link
   4) /api/buy (POST) - executes transaction: checks buyer balance, deducts, credits seller minus 2%, updates item.owner_id, inserts into transactions
   5) /api/gifts/:telegram_id (GET) - returns gifts for a given telegram_id
   6) /api/admin/give (POST) - only allowed for OWNER_TELEGRAM_ID: adds amount to target user's balance
   7) /api/balance/:telegram_id (GET) - returns { balance }
   8) /events (SSE GET) - keep connections; server emits 'new_gift' when a new gift is recorded for manager or relevant user
      Example SSE message:
        event: new_gift
        data: {"gift": { ... }, "from_telegram_id":"12345","from_username":"alice","to_telegram_id":"6828396702"}
   Notes:
   - Server should hold Supabase service_role key and subscribe to realtime or process Telegram webhook, and forward events to SSE clients.
   - Do NOT put Supabase service key in frontend.
   ========================= */

/* =========================
   Done
   ========================= */
console.log("PortHub script loaded — blue-black marketplace ready.");
