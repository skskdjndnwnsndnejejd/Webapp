/* =========================================================================
   /public/script.js
   🎁 PortHub — Frontend
   - Stylized canvas background (sun/pixels/birds/road/duck/ship/crane)
   - Premium UI: Poppins/Inter fonts, inputs colored like background (darker)
   - Uses backend API endpoints for secure operations (no secret keys here)
   - SSE connection to /events for realtime gift notifications
   ========================================================================= */

/* =======================
   0. CONFIG / ADJUST HERE
   ======================= */
// If your backend is at the same origin, API_BASE = ''. If separate, set full URL.
const API_BASE = ""; // e.g. "https://your-render-service.onrender.com" or '' for same origin

// Owner Telegram ID (manager) — the account that receives collectibles
const OWNER_TELEGRAM_ID = "6828396702";

/* =======================
   1. Fonts injection (Poppins + Inter from Google)
   ======================= */
(function loadFonts() {
  const link = document.createElement("link");
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&family=Poppins:wght@400;600;800&display=swap";
  link.rel = "stylesheet";
  document.head.appendChild(link);
})();

/* =======================
   2. Utilities
   ======================= */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const formatTon = v => parseFloat(v || 0).toFixed(2) + " TON";
const qCreate = (tag, cls, html) => { const el = document.createElement(tag); if (cls) el.className = cls; if (html) el.innerHTML = html; return el; };

/* =======================
   3. DOM references
   ======================= */
// assume index.html layout as previously created
const rootApp = document.querySelector(".app") || document.body;
const tabsBtns = () => $$(".tab-btn");
const tabSections = () => $$(".tab");
const balanceNode = $("#balance");
const itemsNode = $("#items");
const giftListNode = $("#giftList");
const adminResultNode = $("#adminResult");
const giveBtn = $("#giveBtn");
const targetIdInput = $("#targetId");
const amountInput = $("#amount");

/* =======================
   4. State
   ======================= */
const State = {
  user: null,    // {id, telegram_id, username, balance}
  items: [],
  gifts: [],
  lastGiftTimestamp: 0,
  sse: null,
  animPaused: false
};

/* =======================
   5. Safe API helper (talks to your server)
   ======================= */
async function apiFetch(path, opts = {}) {
  const url = (API_BASE || "") + path;
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  const cfg = {
    method: opts.method || "GET",
    headers,
    credentials: "same-origin"
  };
  if (opts.body !== undefined) cfg.body = JSON.stringify(opts.body);
  const r = await fetch(url, cfg);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`API ${path} failed ${r.status}: ${text}`);
  }
  return r.json();
}

/* =======================
   6. Auth init (Telegram WebApp integration)
   ======================= */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
let tgUser = null;
if (tg) {
  try {
    tg.expand();
    tgUser = tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : null;
    // optionally set theme params
    if (tg.MainButton) tg.MainButton.hide();
  } catch (e) {
    console.warn("tg init error", e);
  }
}

async function frontAuth() {
  if (!tgUser) {
    console.warn("No Telegram user in initDataUnsafe — you can still work in dev mode.");
    return;
  }
  // call backend to create/get user
  try {
    const payload = { telegram_id: tgUser.id, username: tgUser.username || (tgUser.first_name || "") };
    const res = await apiFetch("/api/auth", { method: "POST", body: payload });
    State.user = res.user;
    renderBalance();
  } catch (err) {
    console.error("frontAuth error:", err);
  }
}

/* =======================
   7. Render helpers (premium style)
   ======================= */
function renderBalance() {
  if (!balanceNode) return;
  if (!State.user) {
    balanceNode.textContent = "💰 —";
  } else {
    balanceNode.textContent = `💰 ${Number(State.user.balance || 0).toFixed(2)} TON`;
  }
}

function escapeHtml(s) { if (s == null) return ""; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* =======================
   8. Items & Gifts render with premium cards
   ======================= */
function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function renderItems() {
  clearNode(itemsNode);
  if (!State.items || State.items.length === 0) {
    const empty = qCreate("div", "empty-note", "Каталог пуст — зайди позже.");
    itemsNode.appendChild(empty);
    return;
  }

  for (const it of State.items) {
    const card = qCreate("div", "item-card");
    const left = qCreate("div", "item-left");
    const img = qCreate("img", "item-img");
    img.src = it.image || "/images/placeholder-nft.png";
    img.alt = it.name || "NFT";

    const meta = qCreate("div", "item-meta");
    const title = qCreate("div", "item-title", escapeHtml(it.name));
    const price = qCreate("div", "item-price", `<span class="accent">${Number(it.price).toFixed(2)} TON</span>`);
    const owner = qCreate("div", "item-owner", `Owner: <span class="mono">${it.owner ? escapeHtml(it.owner.username || it.owner.telegram_id) : "—"}</span>`);

    meta.appendChild(title);
    meta.appendChild(price);
    meta.appendChild(owner);

    left.appendChild(img);
    left.appendChild(meta);

    const right = qCreate("div", "item-right");
    const buy = qCreate("button", "btn btn-buy", "Приобрести");
    buy.addEventListener("click", () => onBuyItem(it.id));
    const more = qCreate("a", "link-more", "Подробнее");
    more.href = it.link || "#";
    more.target = "_blank";

    right.appendChild(buy);
    right.appendChild(more);

    card.appendChild(left);
    card.appendChild(right);
    itemsNode.appendChild(card);
  }
}

function renderGifts() {
  clearNode(giftListNode);
  if (!State.gifts || State.gifts.length === 0) {
    giftListNode.appendChild(qCreate("div", "empty-note", "У вас пока нет подарков."));
    return;
  }
  for (const g of State.gifts) {
    const card = qCreate("div", "gift-card");
    const img = qCreate("img", "gift-img");
    img.src = g.image_url || "/images/placeholder-gift.png";
    const meta = qCreate("div", "gift-meta");
    meta.innerHTML = `<div class="gift-name">${escapeHtml(g.nft_name)}</div>
                      <div class="gift-link"><a href="${g.nft_link}" target="_blank">${escapeHtml(g.nft_link)}</a></div>
                      <div class="gift-status">Status: <span class="mono">${escapeHtml(g.status||"в наличии")}</span></div>`;
    const actions = qCreate("div", "gift-actions");
    const listBtn = qCreate("button", "btn btn-outline", "Выставить лот");
    listBtn.addEventListener("click", () => onCreateLotFromGift(g));
    actions.appendChild(listBtn);
    card.appendChild(img);
    card.appendChild(meta);
    card.appendChild(actions);
    giftListNode.appendChild(card);
  }
}

/* =======================
   9. Load data from server
   ======================= */
async function loadItems() {
  try {
    const json = await apiFetch("/api/items");
    State.items = json.items || [];
    renderItems();
  } catch (e) {
    console.error("loadItems error", e);
    itemsNode.innerHTML = "<div class='error'>Ошибка загрузки каталога</div>";
  }
}

async function loadGiftsForUser() {
  try {
    if (!State.user) return;
    const json = await apiFetch(`/api/gifts/${State.user.telegram_id}`);
    State.gifts = json.gifts || [];
    renderGifts();
  } catch (e) {
    console.error("loadGifts error", e);
    giftListNode.innerHTML = "<div class='error'>Ошибка загрузки подарков</div>";
  }
}

/* =======================
   10. Purchase flow
   ======================= */
async function onBuyItem(itemId) {
  if (!State.user) { alert("Войдите через Telegram, чтобы купить."); return; }
  try {
    const it = State.items.find(x => x.id === itemId);
    if (!it) { alert("Товар не найден"); return; }
    if (Number(State.user.balance) < Number(it.price)) { alert("Недостаточно средств"); return; }
    const ok = confirm(`Купить ${it.name} за ${Number(it.price).toFixed(2)} TON? Комиссия 2%`);
    if (!ok) return;
    const res = await apiFetch("/api/buy", { method: "POST", body: { buyer_tg: State.user.telegram_id, item_id: itemId } });
    if (res.success) {
      await refreshAfterTx();
      showToast("Покупка успешна 🎉");
    } else {
      alert("Ошибка покупки: " + (res.error || "unknown"));
    }
  } catch (e) {
    console.error("buy error", e);
    alert("Ошибка покупки: " + (e.message || e));
  }
}

async function refreshAfterTx() {
  // refresh user balance & data
  try {
    if (State.user) {
      const bal = await apiFetch(`/api/balance/${State.user.telegram_id}`);
      if (bal && typeof bal.balance !== "undefined") State.user.balance = bal.balance;
    }
    await loadItems();
    await loadGiftsForUser();
    renderBalance();
  } catch (e) {
    console.error("refreshAfterTx error", e);
  }
}

/* =======================
   11. Create lot from gift
   ======================= */
async function onCreateLotFromGift(gift) {
  if (!State.user) { alert("Войдите через Telegram"); return; }
  const priceStr = prompt("Укажи цену лота (TON). Комиссия 2% будет удержана при продаже.", "1.00");
  if (!priceStr) return;
  const price = Number(priceStr);
  if (isNaN(price) || price <= 0) { alert("Некорректная цена"); return; }

  try {
    const res = await apiFetch("/api/items/new", {
      method: "POST",
      body: {
        telegram_id: State.user.telegram_id,
        name: gift.nft_name || "Gift",
        description: `Лот из My Gifts: ${gift.nft_name}`,
        price: price,
        image: gift.image_url,
        link: gift.nft_link
      }
    });
    if (res.success) {
      showToast("Лот выставлен успешно");
      await loadItems();
    } else {
      alert("Ошибка выставления лота");
    }
  } catch (e) {
    console.error("create lot error", e);
    alert("Ошибка выставления лота: " + (e.message || e));
  }
}

/* =======================
   12. Admin: give balance
   ======================= */
if (giveBtn) {
  giveBtn.addEventListener("click", async () => {
    const target = (targetIdInput && targetIdInput.value) ? targetIdInput.value.trim() : null;
    const amount = Number(amountInput && amountInput.value ? amountInput.value : 0);
    if (!target || !amount || amount <= 0) { alert("Укажи корректный ID и сумму"); return; }
    try {
      const resp = await apiFetch("/api/admin/give", { method: "POST", body: { admin_id: tgUser ? tgUser.id : null, target_id: target, amount } });
      if (resp.success) {
        adminResultNode.innerText = `Выдано ${Number(amount).toFixed(2)} TON пользователю ${target}.`;
        if (State.user && String(State.user.telegram_id) === String(target)) await refreshAfterTx();
      } else {
        adminResultNode.innerText = `Ошибка: ${resp.error || JSON.stringify(resp)}`;
      }
    } catch (e) {
      console.error("admin give error", e);
      adminResultNode.innerText = `Ошибка: ${e.message || e}`;
    }
  });
}

/* =======================
   13. SSE realtime connection for new gifts + notifications
   ======================= */
function connectSSE() {
  // open Server-Sent Events connection to backend /events
  try {
    if (!!State.sse) State.sse.close();
    const url = (API_BASE || "") + "/events";
    const es = new EventSource(url, { withCredentials: true });
    State.sse = es;
    es.onopen = () => console.log("SSE connected");
    es.onerror = (e) => {
      console.warn("SSE error", e);
      // try reconnect after delay
      setTimeout(() => connectSSE(), 5000);
    };
    es.addEventListener("new_gift", (ev) => {
      try {
        const data = JSON.parse(ev.data);
        // data should include: gift row, to_telegram_id, from_telegram_id, from_username
        handleIncomingGiftEvent(data);
      } catch (e) { console.error("parse sse data", e); }
    });
    es.addEventListener("new_lot", (ev) => {
      console.log("new_lot", ev.data);
      // optional: reload items
      loadItems();
      showToast("Новый лот появился в каталоге");
    });
    // generic message
    es.onmessage = function(e) {
      // fallback: generic server messages
      // console.log("SSE msg", e.data);
    };
  } catch (e) {
    console.error("connectSSE failed", e);
  }
}

function handleIncomingGiftEvent(payload) {
  // payload ex: { gift: {...}, to_telegram_id: "6828...", from_telegram_id: "...", from_username: "..." }
  try {
    // if gift is addressed to manager account (owner), we must add it to My Gifts of the sender OR add to manager's gifts?
    // According to your earlier spec: when user sends collectible to manager (6828...), script automatically
    // credits the sender's My Gifts (i.e., records that manager accepted and added gift to platform)
    // But precise business logic can vary. Here we implement:
    //  - if payload.to_telegram_id === OWNER_TELEGRAM_ID, then the server will have created a gift record with user_id = sender_id
    //  - we will notify the sender (if current user is payload.from_telegram_id) and refresh their My Gifts.
    const gift = payload.gift || payload;
    showToast(`🎁 Получен новый подарок: ${gift.nft_name || "подарок"}`);
    // If current user is the sender, refresh My Gifts (it might have been added)
    if (State.user && String(State.user.telegram_id) === String(payload.from_telegram_id)) {
      loadGiftsForUser();
    }
    // If current user is owner (manager), refresh owner's gifts
    if (State.user && String(State.user.telegram_id) === String(OWNER_TELEGRAM_ID)) {
      loadGiftsForUser();
    }
    // Optionally: add to local list
    // State.gifts.unshift(gift);
    // renderGifts();
  } catch (e) {
    console.error("handleIncomingGiftEvent error", e);
  }
}

/* =======================
   14. Toast / Notifications
   ======================= */
const toastsRoot = (function createToasts() {
  let root = $("#porthub-toasts");
  if (!root) {
    root = qCreate("div", "porthub-toasts");
    root.id = "porthub-toasts";
    document.body.appendChild(root);
  }
  return root;
})();

function showToast(text, timeout = 3500) {
  const s = qCreate("div", "ph-toast", text);
  toastsRoot.appendChild(s);
  requestAnimationFrame(() => s.classList.add("visible"));
  setTimeout(() => {
    s.classList.remove("visible");
    setTimeout(() => {
      try { toastsRoot.removeChild(s); } catch (e) {}
    }, 400);
  }, timeout);
}

/* =======================
   15. Init sequence
   ======================= */
async function init() {
  // 1) populate UI fonts & styles (we already loaded fonts)
  // 2) auth front
  await frontAuth();
  // 3) load items + gifts
  await loadItems();
  await loadGiftsForUser();
  // 4) connect SSE
  connectSSE();
  // 5) canvas starts below
  startCanvas();
  // 6) initial render
  renderBalance();
}

init();

/* =======================
   16. CANVAS section — stylized, performant, modern
   ======================= */

(function canvasModule() {
  // Create and manage full-screen canvas background with stylized "stylized" art:
  // - top: sun + birds (light shapes)
  // - mid: sea + bridge + ship
  // - foreground: curved road arc + duck-car moving per schedule
  // - right/mid: port crane with animated container

  const canvas = document.getElementById("sunsetCanvas") || (function () {
    const c = document.createElement("canvas");
    c.id = "sunsetCanvas";
    c.style.position = "fixed";
    c.style.top = 0;
    c.style.left = 0;
    c.style.width = "100%";
    c.style.height = "100%";
    c.style.zIndex = 0;
    c.style.pointerEvents = "none";
    document.body.insertBefore(c, document.body.firstChild);
    return c;
  })();

  const ctx = canvas.getContext("2d", { alpha: false });

  let W = innerWidth, H = innerHeight;
  function resize() {
    W = innerWidth; H = innerHeight;
    const DPR = window.devicePixelRatio || 1;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", () => { resize(); seedScene(); });
  resize();

  // Scene state
  const scene = {
    t: 0,
    birds: [],
    ships: [],
    clouds: [],
    duckCars: [],
    lastDuck: 0,
    lastShip: 0,
    crane: { x: Math.round(W * 0.75), y: Math.round(H * 0.64), containerY: -60, state: "idle", armAngle: -0.55 },
  };

  // palette (premium)
  const color = {
    skyTop: "#5e3bdb",
    skyMid: "#ffb84d",
    skyBottom: "#1b043e",
    seaTop: "#2a1a59",
    seaBottom: "#0b0020",
    road: "#20102d",
    roadLine: "#ffdf5a",
    accent: "#ffd966",
    text: "#ffffff"
  };

  // seed birds/clouds
  function seedScene() {
    scene.birds = [];
    scene.clouds = [];
    scene.ships = [];
    scene.duckCars = [];
    scene.lastDuck = performance.now();
    scene.lastShip = performance.now();
    const birdN = Math.max(3, Math.floor(W / 320));
    for (let i=0;i<birdN;i++){
      scene.birds.push({
        x: Math.random()*W,
        y: rand(H*0.05, H*0.25),
        dir: Math.random() > 0.5 ? 1 : -1,
        speed: rand(0.3, 1.3),
        phase: Math.random()*Math.PI*2
      });
    }
    const cloudN = Math.max(2, Math.floor(W/420));
    for (let i=0;i<cloudN;i++){
      scene.clouds.push({ x: Math.random()*W, y: rand(20, H*0.18), size: rand(80,200), speed: rand(0.02,0.15) });
    }
  }
  seedScene();

  function rand(a,b){return Math.random()*(b-a)+a;}
  function randInt(a,b){return Math.floor(rand(a,b+1));}

  // spawn duck every 30s
  function maybeSpawnDuck(now) {
    if (now - scene.lastDuck > 30000) {
      scene.lastDuck = now;
      scene.duckCars.push({ start: now, dur: 30000, scale: rand(0.92,1.06) });
    }
  }
  // spawn ship every 60s
  function maybeSpawnShip(now) {
    if (now - scene.lastShip > 60000) {
      scene.lastShip = now;
      scene.ships.push({ start: now, dur: 60000, y: H*0.74 + rand(-6,14), w: rand(120,240) });
    }
  }

  // draw sky gradient
  function drawSky(t) {
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, color.skyTop);
    g.addColorStop(0.35, color.skyMid);
    g.addColorStop(1, color.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);
  }

  // sun
  let lastSunFlash = 0;
  function drawSun(t) {
    const sx = W*0.14;
    const sy = H*0.16;
    const r = Math.min(W,H)*0.07;
    // glow
    const g = ctx.createRadialGradient(sx,sy,r*0.2,sx,sy,r*3);
    g.addColorStop(0, "rgba(255,244,200,0.9)");
    g.addColorStop(0.4, "rgba(255,190,80,0.45)");
    g.addColorStop(1, "rgba(150,80,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx,sy,r*2,0,Math.PI*2); ctx.fill();
    // disc
    ctx.beginPath(); ctx.fillStyle = "#fff0c6"; ctx.arc(sx,sy,r*0.9,0,Math.PI*2); ctx.fill();

    // rare rays
    if (Math.random() < 0.002 || (t - lastSunFlash > 10000 && Math.random()<0.06)) {
      lastSunFlash = t;
      for (let i=0;i<8;i++){
        ctx.beginPath();
        ctx.moveTo(sx,sy);
        const ang = (i/8)*Math.PI*2 + Math.random()*0.15;
        ctx.lineTo(sx + Math.cos(ang)*(r*3.5), sy + Math.sin(ang)*(r*3.5));
        ctx.strokeStyle = "rgba(255,234,145,0.05)";
        ctx.lineWidth = 14;
        ctx.stroke();
      }
    }
  }

  // clouds & birds
  function drawClouds(t, dt) {
    for (const c of scene.clouds) {
      c.x += c.speed * dt * 0.06;
      if (c.x > W + c.size) c.x = -c.size;
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.ellipse(c.x, c.y, c.size*0.7, c.size*0.36, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(c.x + c.size*0.36, c.y+6, c.size*0.55, c.size*0.28, 0,0,Math.PI*2);
      ctx.fill();
    }
    // birds
    for (const b of scene.birds) {
      b.x += b.dir * b.speed * dt * 0.04;
      b.phase += dt*0.003*b.speed;
      if (b.dir > 0 && b.x > W + 80) b.x = -80;
      if (b.dir < 0 && b.x < -80) b.x = W + 80;
      const wing = Math.sin(b.phase) * 6;
      ctx.beginPath();
      ctx.strokeStyle = "#fff8c8";
      ctx.lineWidth = 2;
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - 20*b.dir, b.y - 8 + wing);
      ctx.lineTo(b.x - 36*b.dir, b.y - 2);
      ctx.stroke();
    }
  }

  // sea
  function drawSea(t) {
    const sy = H * 0.68;
    const g = ctx.createLinearGradient(0, sy, 0, H);
    g.addColorStop(0, color.seaTop);
    g.addColorStop(1, color.seaBottom);
    ctx.fillStyle = g; ctx.fillRect(0, sy, W, H-sy);

    // gentle waves
    ctx.save();
    ctx.globalAlpha = 0.22;
    for (let i=0;i<4;i++){
      ctx.beginPath();
      const amp = 4 + i*2;
      const freq = 0.0025 + i*0.0008;
      ctx.moveTo(0, sy + i*12);
      for (let x = 0; x <= W; x += 12) {
        const y = sy + i*12 + Math.sin(t*0.002 + x*freq + i)*amp;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = ["#ffd7a9","#ffc08a","#ff9fb2","#caa1ff"][i%4];
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  // bridge silhouette
  function drawBridge() {
    const by = H*0.56;
    ctx.save();
    ctx.fillStyle = "rgba(10,6,22,0.9)";
    ctx.fillRect(0, by-8, W, 14);
    const archCount = 6;
    for (let i=0;i<archCount;i++){
      const x = (i/archCount)*W;
      ctx.beginPath();
      ctx.ellipse(x+W/archCount/2, by+6, W/archCount/2.6, 22, 0, 0, Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  // road (curved)
  function drawRoad(t) {
    const top = H*0.78;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-W*0.2, top);
    ctx.quadraticCurveTo(W*0.5, H*0.52, W*1.2, top);
    ctx.lineTo(W*1.2, H); ctx.lineTo(-W*0.2, H); ctx.closePath();
    ctx.fillStyle = color.road; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-W*0.2, top+18);
    ctx.quadraticCurveTo(W*0.5, H*0.545, W*1.2, top+18);
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 6; ctx.stroke();

    // dashed center line
    ctx.save();
    ctx.setLineDash([38, 28]);
    ctx.lineDashOffset = -(t*0.02);
    ctx.beginPath();
    ctx.moveTo(-W*0.2, top+9);
    ctx.quadraticCurveTo(W*0.5, H*0.535, W*1.2, top+9);
    ctx.strokeStyle = color.roadLine;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  // arc path mapping t->pos
  function arcPath(t) {
    const P0 = {x:-W*0.2, y:H*0.78+9};
    const P1 = {x:W*0.5, y:H*0.52+6};
    const P2 = {x:W*1.2, y:H*0.78+9};
    const x = (1-t)*(1-t)*P0.x + 2*(1-t)*t*P1.x + t*t*P2.x;
    const y = (1-t)*(1-t)*P0.y + 2*(1-t)*t*P1.y + t*t*P2.y;
    return {x,y};
  }

  // draw duck car
  function drawDuck(d, now) {
    const elapsed = now - d.start;
    const rawT = Math.min(1, elapsed / d.dur);
    const ease = rawT < 0.5 ? 2*rawT*rawT : -1 + (4 - 2*rawT)*rawT;
    const pos = arcPath(ease);
    const bob = Math.sin(elapsed/600 * Math.PI*2)*4;
    ctx.save();
    ctx.translate(pos.x, pos.y + bob);
    ctx.scale(d.scale, d.scale);

    // shadow
    ctx.beginPath();
    ctx.ellipse(0, 26, 46, 12, 0,0,Math.PI*2);
    ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fill();

    // body
    roundRect(ctx, -48, -6, 96, 28, 9);
    ctx.fillStyle = "#ffd24a"; ctx.fill();

    // roof
    roundRect(ctx, -22, -20, 44, 18, 6); ctx.fillStyle = "#ffd86f"; ctx.fill();

    // windows (sunglasses)
    ctx.beginPath(); ctx.rect(-14, -18, 28, 12); ctx.fillStyle = "#201726"; ctx.fill();

    // wheels
    ctx.beginPath(); ctx.arc(-26,18,8,0,Math.PI*2); ctx.arc(26,18,8,0,Math.PI*2); ctx.fillStyle = "#100b12"; ctx.fill();

    // beak front
    ctx.beginPath(); ctx.moveTo(48, -2); ctx.lineTo(62,0); ctx.lineTo(48,8); ctx.fillStyle="#ffb84d"; ctx.fill();

    ctx.restore();
  }

  // draw ship
  function drawShip(s, now) {
    const elapsed = now - s.start;
    const t = (elapsed % s.dur) / s.dur;
    const x = -s.w + (W + s.w*2) * t;
    const y = s.y;
    ctx.save();
    ctx.translate(x, y);
    // hull
    ctx.beginPath();
    ctx.moveTo(0, 18); ctx.lineTo(s.w*0.85,18);
    ctx.quadraticCurveTo(s.w*0.95,18,s.w,10); ctx.lineTo(s.w,-8); ctx.lineTo(0,-8); ctx.closePath();
    ctx.fillStyle = "#ffccd6"; ctx.fill();

    // cabin
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(s.w*0.15, -20, s.w*0.32, 12);

    // smokestack
    ctx.fillStyle = "#d14f8a"; ctx.fillRect(s.w*0.55, -26, 10, 14);
    ctx.restore();
  }

  // crane draw & logic
  function updateDrawCrane(now, dt) {
    const cr = scene.crane;
    cr.x = Math.round(W*0.76);
    cr.y = Math.round(H*0.64);
    // base
    ctx.save();
    ctx.translate(cr.x, cr.y);
    ctx.fillStyle = "#32183a";
    roundRect(ctx, -12, 0, 24, 60, 6);
    // arm
    cr.armAngle = -0.6 + Math.sin(now/4200)*0.01;
    ctx.save();
    ctx.rotate(cr.armAngle);
    roundRect(ctx, 0, -6, 200, 12, 6); ctx.fillStyle = "#3a2150"; ctx.fill();
    // cable & container
    const cableX = 180;
    if (!cr.state || cr.state==="idle") {
      // occasionally lower
      if (Math.random() < 0.0008) cr.state = "down";
    }
    if (cr.state === "down") {
      cr.containerY = (cr.containerY === undefined ? -60 : cr.containerY) + dt*0.06;
      if (cr.containerY > 40) { cr.state = "hold"; setTimeout(()=>{ cr.state="up"; }, 1400); }
    } else if (cr.state === "up") {
      cr.containerY -= dt*0.04;
      if (cr.containerY < -60) { cr.state="idle"; cr.containerY=-60; }
    } else {
      if (cr.containerY === undefined) cr.containerY = -60;
    }
    ctx.beginPath(); ctx.moveTo(cableX,0); ctx.lineTo(cableX, cr.containerY); ctx.strokeStyle="#1b1320"; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle = "#ff5757"; roundRect(ctx, cableX-18, cr.containerY, 36, 22, 3);
    ctx.restore();
    ctx.restore();
  }

  // helper round rect
  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2*r) r = w/2; if (h < 2*r) r = h/2;
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
    ctx.fill();
  }

  // main loop
  let last = performance.now();
  function loop(now) {
    const dt = now - last;
    last = now;
    if (!State.animPaused) {
      draw(now, dt);
    }
    requestAnimationFrame(loop);
  }

  function draw(now, dt) {
    scene.t = now;
    // background
    drawSky(now);
    drawSun(now);
    drawClouds(now, dt);
    drawSea(now);
    drawBridge();
    drawRoad(now);
    // ships behind road
    for (let i = scene.ships.length - 1; i >= 0; i--) {
      const s = scene.ships[i];
      drawShip(s, now);
      if (now - s.start > s.dur + 5000) scene.ships.splice(i,1);
    }
    updateDrawCrane(now, dt);

    // ducks (foreground)
    for (let i = scene.duckCars.length - 1; i >= 0; i--) {
      const d = scene.duckCars[i];
      drawDuck(d, now);
      if (now - d.start > d.dur + 4000) scene.duckCars.splice(i,1);
    }

    // maybe spawn
    maybeSpawnDuck(now);
    maybeSpawnShip(now);

    // shimmer
    ctx.save(); ctx.globalAlpha = 0.06; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, H*0.76, W, H*0.24); ctx.restore();
  }

  // start
  requestAnimationFrame(loop);

  // convenience: expose stop/start
  window.porthubPause = () => { State.animPaused = true; };
  window.porthubResume = () => { State.animPaused = false; };

})(); // end canvasModule

/* =======================
   17. STYLES: inject minimal UI CSS for pro look (inputs same color as bg slightly darker)
   ======================= */
(function injectStyles(){
  const css = `
  /* --- global app UI styles (professional) --- */
  .app {
    position: relative;
    z-index: 10;
    margin: 4vh auto;
    width: min(420px, 94%);
    padding: 18px;
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(8,4,20,0.45), rgba(6,4,14,0.35));
    box-shadow: 0 8px 40px rgba(10,8,20,0.6);
    backdrop-filter: blur(8px) saturate(1.1);
    color: var(--ph-text, #fff);
    font-family: 'Inter', 'Poppins', system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
  }
  header h1 { font-family: 'Poppins', 'Inter'; font-weight:800; font-size:28px; margin:0; letter-spacing:0.6px;
    background: linear-gradient(90deg, #ffd966, #ff5aa3); -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  }
  header .subtitle { color: rgba(255,230,210,0.85); font-size:12px; margin-bottom:8px; }
  #balance { color:#ffd966; font-weight:600; margin-top:6px; }

  nav { display:flex; gap:8px; margin: 10px 0 14px; }
  .tab-btn { flex:1; padding:8px 10px; border-radius:10px; border:none; cursor:pointer; font-weight:700; font-size:13px; color:#fff; background: rgba(255,255,255,0.04); }
  .tab-btn.active { background: linear-gradient(90deg,#ffdf5a, #ff6aa3); color:#0b0020; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(255,180,80,0.06); }

  .tab { display:none; }
  .tab.active { display:block; animation: fadeIn 220ms ease; }

  @keyframes fadeIn { from {opacity:0; transform: translateY(6px)} to {opacity:1; transform:none} }

  .item-card, .gift-card {
    display:flex; gap:12px; align-items:center;
    padding:12px; border-radius:12px;
    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
    border: 1px solid rgba(255,255,255,0.04);
    box-shadow: 0 6px 18px rgba(10,6,20,0.5);
  }
  .item-left { display:flex; gap:12px; align-items:center; }
  .item-img, .gift-img { width:72px; height:72px; object-fit:cover; border-radius:10px; box-shadow: 0 6px 18px rgba(0,0,0,0.4); }
  .item-title { font-weight:800; font-size:15px; color:#fff; }
  .item-price .accent { color:#ffd966; font-weight:700; }
  .item-right { display:flex; flex-direction:column; gap:8px; align-items:flex-end; }

  .btn { padding:8px 10px; border-radius:9px; cursor:pointer; font-weight:700; border:none; font-size:13px; }
  .btn-buy { background: linear-gradient(90deg,#ffd966,#ff6aa3); color:#081026; }
  .btn-outline { background:transparent; border:1px solid rgba(255,217,102,0.12); color:#ffd966; }

  input[type="number"], input[type="text"] {
    padding:10px 12px; border-radius:10px; border:none; outline:none;
    background: rgba(20,12,40,0.65);
    color: #ffdfe6; font-weight:600; width:100%;
    box-shadow: inset 0 -1px 0 rgba(255,255,255,0.02);
  }
  input::placeholder { color: rgba(255,255,255,0.25); font-weight:600; }

  .porthub-toasts { position: fixed; right: 18px; bottom: 18px; z-index: 9999; display:flex; flex-direction:column; gap:8px; }
  .ph-toast { padding:10px 14px; border-radius:10px; background: linear-gradient(90deg, rgba(0,0,0,0.6), rgba(255,255,255,0.02)); color:#fff; transform: translateY(10px); opacity:0; transition: all .28s ease; box-shadow: 0 8px 30px rgba(0,0,0,0.45); }
  .ph-toast.visible { opacity:1; transform:none; }

  .empty-note { padding:14px; color: rgba(255,255,255,0.6); }
  .mono { font-family: monospace; font-size:12px; color: #ffdfe6; }
  .error { color: #ffb3b3; }
  `;
  const s = document.createElement("style");
  s.innerHTML = css;
  document.head.appendChild(s);
})();

/* =======================
   18. SERVER REQUIREMENTS (brief)
   ======================= */
/*
To enable full functionality (secure Supabase usage + realtime events), your server should:

1) Keep SUPABASE_URL and SUPABASE_KEY (service role) in environment variables in Render.
2) Use supabase-js on the server to:
   - provide endpoints:
     POST /api/auth         { telegram_id, username } -> creates/returns users row
     GET  /api/items        -> returns items (with owner username)
     POST /api/items/new    -> create new item (body contains telegram_id, name, price, image, link)
     POST /api/buy          -> { buyer_tg, item_id } -> performs transaction (check balance, 2% commission), updates balances, inserts transactions
     GET  /api/gifts/:telegram_id -> returns gifts for user's telegram id
     POST /api/admin/give   -> { admin_id, target_id, amount } -> only allow if admin_id === OWNER_TELEGRAM_ID
     GET  /api/balance/:telegram_id -> returns { balance }

3) Realtime notifications:
   - The server should either:
     A) Subscribe to Supabase Realtime on the server (recommended) and when a new row is inserted into `gifts` (or `items`), forward a simple event to connected clients via SSE at /events (e.g. `event: new_gift` with JSON payload)
     B) Or implement a Telegram Bot webhook that, when the manager receives a collectible message, inserts a `gifts` row into Supabase and then notifies clients via SSE.

4) SSE endpoint on server:
   - Implement `/events` that holds open connections and sends events:
     res.write(`event: new_gift\ndata: ${JSON.stringify({gift, from_telegram_id, from_username, to_telegram_id})}\n\n`);
   - Clean up connections properly.

Security notes:
- Do NOT expose service_role key to frontend.
- SSE endpoint can be public, but it's better to only allow authenticated users (optional).

If you want, я могу сразу сгенерировать серверные SSE-handling изменения (server.js patch) — скажи и я пришлю.
*/

/* =======================
   19. End
   ======================= */
console.log("PortHub frontend loaded — premium UI initialized.");
