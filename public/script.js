/* =========================================================================
 /public/script.js
 PortHub — Blue-Black marketplace frontend (Supabase Realtime)
 - Tables: users, nfts, transactions, gifts
 - Realtime: listens INSERT on gifts -> auto-refresh My Gifts
 - No service_role in frontend. Use anon key (or route via backend if you need security)
 ========================================================================= */

/* ============== CONFIG: замените на свои значения ============== */
const SUPABASE_URL = "https://ndpkagnezdnojsfendis.supabase.co";        // <- замените на ваш SUPABASE_URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kcGthZ25lemRub2pzZmVuZGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxODU1NTAsImV4cCI6MjA3Nzc2MTU1MH0.yFBUraYSm8lISBvmmCuoBzTZYy5fGV_NVdM2ATCilTc";  // <- замените на anon key
const OWNER_TELEGRAM_ID = "6828396702"; // менеджер, на аккаунт которого кидают NFT
/* ============================================================ */

(async () => {
  // динамически импортируем supabase-js (ESM)
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');

  // init client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 10 } }
  });

  // --- DOM shortcuts --- (index.html must contain corresponding elements)
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // Ensure required DOM elements exist (if not, create minimal layout)
  function ensureLayout() {
    if (!$('body')) return;
    if (!$('#sunsetCanvas')) {
      // minimal placeholders are created in index.html earlier; here we only require main .app container and tab structure
    }
  }
  ensureLayout();

  // elements used by script (these ids/classes should be present in index.html)
  const elBalance = $('#balance');
  const elItems = $('#items');
  const elGifts = $('#giftList');
  const elAdminResult = $('#adminResult');
  const btnGive = $('#giveBtn');
  const inputTarget = $('#targetId');
  const inputAmount = $('#amount');

  // basic state
  const State = {
    user: null,     // {id, telegram_id, username, balance}
    nfts: [],       // items
    gifts: [],      // user's gifts
    subGifts: null,
    subNfts: null
  };

  // helper
  const esc = s => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
  const fmt = v => Number(v||0).toFixed(2);

  /* -------------------------
     Telegram front auth (initDataUnsafe)
     ------------------------- */
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  let tgUser = null;
  if (tg) {
    try {
      tg.expand();
      tgUser = tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user : null;
    } catch (e) {
      console.warn('tg init failed', e);
    }
  }

  /* -------------------------
     Supabase helpers
     ------------------------- */
  async function getOrCreateUser(telegram_id, username = '') {
    // try get user
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id)
      .limit(1);

    if (error) {
      console.error('getOrCreateUser select error', error);
      throw error;
    }
    if (users && users.length) return users[0];

    // insert
    const { data: inserted, error: insErr } = await supabase
      .from('users')
      .insert([{ telegram_id, username, balance: 0 }])
      .select()
      .single();

    if (insErr) {
      console.error('getOrCreateUser insert error', insErr);
      throw insErr;
    }
    return inserted;
  }

  async function fetchNfts() {
    const { data, error } = await supabase
      .from('nfts')
      .select('*, users:owner_id(id, username, telegram_id)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetchNfts error', error);
      return [];
    }
    State.nfts = data || [];
    renderNfts();
    return State.nfts;
  }

  async function fetchGiftsForUser(telegram_id) {
    // look up user id first
    const { data: users } = await supabase.from('users').select('id').eq('telegram_id', telegram_id).limit(1);
    if (!users || users.length === 0) {
      State.gifts = [];
      renderGifts();
      return [];
    }
    const uid = users[0].id;
    const { data, error } = await supabase.from('gifts').select('*').eq('user_id', uid).order('created_at', { ascending: false });
    if (error) {
      console.error('fetchGiftsForUser error', error);
      State.gifts = [];
    } else {
      State.gifts = data || [];
    }
    renderGifts();
    return State.gifts;
  }

  async function fetchBalance(telegram_id) {
    const { data, error } = await supabase.from('users').select('balance').eq('telegram_id', telegram_id).single();
    if (error) { console.error('fetchBalance', error); return null; }
    return data.balance;
  }

  /* -------------------------
     Realtime: subscribe to gifts and nfts
     ------------------------- */
  function subscribeRealtime() {
    // unsubscribe prior
    if (State.subGifts) State.subGifts.unsubscribe();
    if (State.subNfts) State.subNfts.unsubscribe();

    // subscribe to gifts INSERT
    State.subGifts = supabase
      .channel('public:gifts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gifts' }, payload => {
        const gift = payload.new;
        // If gift.to_telegram_id equals manager account -> auto processing case
        // We'll refresh gifts for the relevant user(s).
        console.log('Realtime gift insert', gift);
        // If current user is the sender -> refresh their My Gifts
        if (State.user && String(gift.from_telegram_id) === String(State.user.telegram_id)) {
          fetchGiftsForUser(State.user.telegram_id);
          toast('Подарок зачислен в My Gifts');
        }
        // If current user is manager -> refresh manager gifts
        if (State.user && String(State.user.telegram_id) === String(OWNER_TELEGRAM_ID)) {
          fetchGiftsForUser(State.user.telegram_id);
          toast('Новый входящий подарок (менеджер)');
        }
      })
      .subscribe(async status => {
        console.log('gifts channel status', status);
      });

    // optionally subscribe to nfts INSERT/UPDATE to refresh marketplace live
    State.subNfts = supabase
      .channel('public:nfts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nfts' }, payload => {
        console.log('Realtime nfts insert', payload.new);
        fetchNfts();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'nfts' }, payload => {
        fetchNfts();
      })
      .subscribe(status => console.log('nfts channel status', status));
  }

  /* -------------------------
     UI Rendering (blue-black style)
     ------------------------- */

  function renderBalanceUI() {
    if (!elBalance) return;
    if (!State.user) elBalance.textContent = 'TON: —';
    else elBalance.textContent = `TON: ${fmt(State.user.balance)}`;
  }

  function renderNfts() {
    if (!elItems) return;
    elItems.innerHTML = '';
    if (!State.nfts || State.nfts.length === 0) {
      elItems.innerHTML = `<div class="empty">Каталог пуст</div>`;
      return;
    }
    for (const it of State.nfts) {
      const card = document.createElement('div');
      card.className = 'item-card';
      const left = document.createElement('div'); left.className = 'item-left';
      const img = document.createElement('img'); img.className = 'item-img'; img.src = it.image || '/images/placeholder-nft.png';
      const meta = document.createElement('div'); meta.className = 'item-meta';
      meta.innerHTML = `<div class="item-title">${esc(it.name)}</div>
                        <div class="item-desc">${esc(it.description || '')}</div>
                        <div class="item-price">Цена: <span class="price">${fmt(it.price)}</span> TON</div>
                        <div class="item-owner">Владелец: <span class="mono">${it.users ? esc(it.users.username || it.users.telegram_id) : '—'}</span></div>`;
      left.appendChild(img); left.appendChild(meta);

      const right = document.createElement('div'); right.className = 'item-right';
      const buy = document.createElement('button'); buy.className = 'btn btn-primary'; buy.textContent = 'Купить';
      buy.onclick = () => buyNft(it.id);
      const more = document.createElement('a'); more.className = 'link-more'; more.href = it.link || '#'; more.target = '_blank'; more.textContent = 'Подробнее';
      right.appendChild(buy); right.appendChild(more);

      card.appendChild(left); card.appendChild(right);
      elItems.appendChild(card);
    }
  }

  function renderGifts() {
    if (!elGifts) return;
    elGifts.innerHTML = '';
    if (!State.gifts || State.gifts.length === 0) {
      // special message requested:
      const div = document.createElement('div');
      div.className = 'empty';
      div.innerHTML = `<div style="font-weight:700">Подарков нет :(</div>
                       <div style="margin-top:6px;color:#bfcbe6">Но в любой момент ты можешь их пополнить отправив NFT менеджеру!</div>`;
      elGifts.appendChild(div);
      return;
    }
    for (const g of State.gifts) {
      const card = document.createElement('div');
      card.className = 'gift-card';
      card.innerHTML = `<img class="gift-img" src="${g.image_url || '/images/placeholder-gift.png'}" alt="${esc(g.nft_name)}" />
                        <div class="gift-meta">
                          <div class="gift-name">${esc(g.nft_name)}</div>
                          <div class="gift-link"><a href="${esc(g.nft_link)}" target="_blank">${esc(g.nft_link)}</a></div>
                          <div class="gift-status">Статус: <span class="mono">${esc(g.status||'в наличии')}</span></div>
                        </div>
                        <div class="gift-actions"><button class="btn btn-outline">Выставить лот</button></div>`;
      elGifts.appendChild(card);
      // attach list button event
      const btn = card.querySelector('.btn-outline');
      btn.addEventListener('click', () => listGiftAsItem(g));
    }
  }

  /* -------------------------
     Actions: buy / list / admin give
     ------------------------- */
  async function buyNft(itemId) {
    if (!State.user) { alert('Войдите через Telegram'); return; }
    const it = State.nfts.find(x => x.id === itemId);
    if (!it) { alert('Товар не найден'); return; }
    if (Number(State.user.balance) < Number(it.price)) { alert('Недостаточно средств'); return; }
    if (!confirm(`Купить "${it.name}" за ${fmt(it.price)} TON? (комиссия 2%)`)) return;

    try {
      // perform transaction via Supabase RPC or direct updates.
      // We'll implement using a single RPC-like sequence client-side (requires anon key to allow updates).
      // Safer: you should implement /api/buy on backend and call it. Here we attempt via direct queries.
      // 1) get buyer row
      const { data: buyers } = await supabase.from('users').select('*').eq('telegram_id', State.user.telegram_id).limit(1);
      const buyer = buyers && buyers[0];
      if (!buyer) throw new Error('Buyer not found');
      // 2) get item
      const { data: items } = await supabase.from('nfts').select('*').eq('id', itemId).limit(1);
      const item = items && items[0];
      if (!item) throw new Error('Item not found');
      // 3) get seller
      const { data: sellers } = await supabase.from('users').select('*').eq('id', item.owner_id).limit(1);
      const seller = sellers && sellers[0];
      if (!seller) throw new Error('Seller not found');

      const commission = Number(item.price) * 0.02;
      const sellerGets = Number(item.price) - commission;

      // perform updates in sequence (no transaction on client, but ok for MVP)
      await supabase.from('users').update({ balance: Number(buyer.balance) - Number(item.price) }).eq('telegram_id', buyer.telegram_id);
      await supabase.from('users').update({ balance: Number(seller.balance) + sellerGets }).eq('id', seller.id);
      await supabase.from('nfts').update({ owner_id: buyer.id }).eq('id', item.id);
      await supabase.from('transactions').insert([{ buyer_id: buyer.id, seller_id: seller.id, item_id: item.id, amount: item.price }]);

      // refresh local state
      State.user.balance = Number(buyer.balance) - Number(item.price);
      await fetchNfts();
      renderBalanceUI();
      toast('Покупка успешна');
    } catch (e) {
      console.error('buyNft error', e);
      alert('Ошибка покупки: ' + (e.message || e));
    }
  }

  async function listGiftAsItem(gift) {
    if (!State.user) { alert('Войдите'); return; }
    const priceStr = prompt('Укажите цену для лота (TON):', '1.00');
    if (!priceStr) return;
    const price = Number(priceStr);
    if (isNaN(price) || price <= 0) { alert('Некорректная цена'); return; }
    try {
      await supabase.from('nfts').insert([{
        name: gift.nft_name,
        description: `Лот из My Gifts: ${gift.nft_name}`,
        price: price,
        owner_id: State.user.id,
        image: gift.image_url,
        link: gift.nft_link
      }]);
      await fetchNfts();
      toast('Лот выставлен');
    } catch (e) {
      console.error('listGiftAsItem error', e);
      alert('Ошибка выставления лота');
    }
  }

  if (btnGive) {
    btnGive.addEventListener('click', async () => {
      try {
        const target = inputTarget.value.trim();
        const amount = Number(inputAmount.value);
        if (!target || !amount || amount <= 0) { alert('Заполните корректно'); return; }
        // Only allow if current tg user equals owner? Here check local tgUser id (not secure)
        if (!tgUser || String(tgUser.id) !== OWNER_TELEGRAM_ID) {
          // still allow but must be done via server ideally; client-side enforcement is not secure
          if (!confirm('Вы не менеджер. Продолжить отправку запроса на сервер?')) return;
        }
        // Find user by telegram_id and update
        const { data: users } = await supabase.from('users').select('*').eq('telegram_id', target).limit(1);
        if (!users || users.length === 0) { alert('Пользователь не найден'); return; }
        const user = users[0];
        await supabase.from('users').update({ balance: Number(user.balance || 0) + Number(amount) }).eq('telegram_id', target);
        elAdminResult.textContent = `Выдано ${fmt(amount)} TON пользователю ${target}`;
        toast('Баланс обновлён');
      } catch (e) {
        console.error('admin give error', e);
        elAdminResult.textContent = 'Ошибка: ' + (e.message || e);
      }
    });
  }

  /* -------------------------
     Notifications (simple toast)
     ------------------------- */
  function toast(msg, time = 2500) {
    const rootId = 'ph-toast-root';
    let root = document.getElementById(rootId);
    if (!root) {
      root = document.createElement('div');
      root.id = rootId;
      root.style.position = 'fixed';
      root.style.right = '18px';
      root.style.bottom = '18px';
      root.style.zIndex = 9999;
      document.body.appendChild(root);
    }
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.background = 'linear-gradient(90deg,#0b2946,#052238)';
    el.style.color = '#eaf6ff';
    el.style.padding = '10px 14px';
    el.style.borderRadius = '10px';
    el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
    el.style.marginTop = '8px';
    el.style.opacity = '0';
    el.style.transition = 'all .28s ease';
    root.appendChild(el);
    requestAnimationFrame(()=> { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
    setTimeout(()=> { el.style.opacity = '0'; setTimeout(()=> el.remove(), 300); }, time);
  }

  /* -------------------------
     Small UI helpers: tabs
     ------------------------- */
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      $$('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(tab).classList.add('active');
    });
  });

  /* -------------------------
     Init: create/get user, fetch data, subscribe realtime
     ------------------------- */
  async function init() {
    try {
      if (tgUser) {
        // create/get user in users table
        State.user = await getOrCreateUser(tgUser.id, tgUser.username || tgUser.first_name || '');
        // fetch gifts & balance
        await fetchGiftsForUser(State.user.telegram_id);
        const bal = await fetchBalance(State.user.telegram_id);
        if (bal !== null) State.user.balance = bal;
        renderBalanceUI();
      } else {
        // not in Telegram — just fetch NFTs to view marketplace
        console.warn('No Telegram initDataUnsafe: limited functionality');
      }
      await fetchNfts();
      subscribeRealtime();
    } catch (e) {
      console.error('init error', e);
    }
  }

  init();

  /* -------------------------
     Minimal CSS injection for blue-black theme (inputs dull blue, buttons cyan)
     (If you already have style.css - adapt there instead)
     ------------------------- */
  (function injectCSS(){
    const css = `
      :root{--bg:#0b0f14;--card:#0f1720;--muted:#6f7b88;--input:#071832;--btn:#36c3ff;--accent:#6fcfff;--text:#dbeafe}
      body { background: var(--bg); color: var(--text); font-family: Inter, Poppins, system-ui, -apple-system, "Segoe UI", Roboto, Arial; }
      .app { width: min(420px,94%); margin: 4vh auto; background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); padding: 16px; border-radius: 12px; box-shadow: 0 8px 40px rgba(0,0,0,0.6); }
      header h1 { color: #9aa3b4; font-weight:800; margin:0; font-size:22px; letter-spacing:0.6px; }
      header .subtitle { color: #9aa3b4; font-size:12px; margin-top:6px; }
      #balance { color: var(--accent); font-weight:700; margin-top:8px; }
      nav { display:flex; gap:8px; margin:12px 0; }
      .tab-btn { flex:1; padding:8px; border-radius:8px; border: none; background:rgba(255,255,255,0.02); color:var(--text); cursor:pointer; font-weight:700; }
      .tab-btn.active { background: linear-gradient(90deg,var(--btn), #0bb2ff); color:#001827; transform: translateY(-2px); }
      .tab { display:none; }
      .tab.active { display:block; }
      .item-card, .gift-card { display:flex; gap:12px; align-items:center; padding:10px; border-radius:10px; background:var(--card); border:1px solid rgba(255,255,255,0.02); margin-bottom:10px; }
      .item-img, .gift-img { width:72px; height:72px; object-fit:cover; border-radius:8px; background:#08182a; }
      .item-title { font-weight:700; color:#e6f6ff; }
      .item-desc { color:var(--muted); font-size:13px; margin-top:6px; }
      .item-price .price { color: var(--accent); font-weight:800; }
      .item-right { display:flex; flex-direction:column; gap:8px; align-items:flex-end; }
      .btn { padding:8px 10px; border-radius:8px; cursor:pointer; font-weight:700; border:none; }
      .btn-primary { background: var(--btn); color:#001827; }
      .btn-outline { background:transparent; color:var(--accent); border:1px solid rgba(111,207,255,0.12); }
      input[type="number"], input[type="text"] { background: var(--input); border: none; padding:10px 12px; border-radius:8px; color:var(--text); outline:none; width:100%; }
      .empty { color:#9aa3b4; padding:12px; }
      .mono { font-family:monospace; color:#a9c9e6; }
    `;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  })();

})();
