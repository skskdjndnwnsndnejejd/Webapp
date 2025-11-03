/* =========================================================================
  /public/script.js
  🎁 PortHub — Blue-Black NFT Marketplace frontend (Supabase realtime)
  - Visual: dark blue/black marketplace (cards like screenshot)
  - Tabs: Store | My gifts | Admin | Terms
  - Buttons: cyan; inputs: dull blue
  - Supabase: uses anon key + Realtime channels on tables: nfts, gifts
  - Manager account: OWNER_TELEGRAM_ID = "6828396702"
  - Replace SUPABASE_URL and SUPABASE_ANON_KEY with your values
  ========================================================================= */

/* ========== CONFIG (fill your values) ========== */
const SUPABASE_URL = "https://ndpkagnezdnojsfendis.supabase.co";            // <-- replace
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kcGthZ25lemRub2pzZmVuZGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxODU1NTAsImV4cCI6MjA3Nzc2MTU1MH0.yFBUraYSm8lISBvmmCuoBzTZYy5fGV_NVdM2ATCilTc";      // <-- replace
const OWNER_TELEGRAM_ID = "6828396702";
/* =============================================== */

(async () => {
  // load supabase-js ESM from jsdelivr
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 10 } }
  });

  // utility
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const create = (t, cls = '', html = '') => { const e = document.createElement(t); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
  const esc = s => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
  const fmt = v => Number(v||0).toFixed(2);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------------------------
     Ensure HTML shell (if index.html minimal)
     --------------------------- */
  function ensureDOM() {
    if (!$('#app-root')) {
      document.body.innerHTML = '';
      document.body.style.margin = '0';
      document.body.style.background = '#071023';
      const root = create('div', 'app', '');
      root.id = 'app-root';
      document.body.appendChild(root);

      // banner + header
      root.innerHTML = `
        <header class="ph-header">
          <div class="ph-banner">
            <div class="ph-title"><span class="gift-icon">🎁</span><span class="porthub-text">PortHub</span></div>
            <div class="ph-balance" id="balance">0 TON</div>
          </div>
          <nav class="ph-tabs">
            <button class="tab-btn active" data-tab="store">Store</button>
            <button class="tab-btn" data-tab="gifts">My gifts</button>
            <button class="tab-btn" data-tab="admin">Admin</button>
            <button class="tab-btn" data-tab="terms">Terms</button>
          </nav>
        </header>

        <main class="ph-main">
          <section id="store" class="tab active">
            <div class="filters">
              <input id="searchId" placeholder="Search by ID" />
            </div>
            <div id="items" class="cards-grid"></div>
          </section>

          <section id="gifts" class="tab">
            <div id="giftList" class="cards-grid"></div>
          </section>

          <section id="admin" class="tab">
            <div class="admin-panel">
              <input id="targetId" placeholder="Telegram ID" type="text" />
              <input id="amount" placeholder="Amount (TON)" type="number" />
              <button id="giveBtn" class="btn-primary">Подтвердить</button>
              <div id="adminResult" class="admin-result"></div>
            </div>
          </section>

          <section id="terms" class="tab">
            <div class="terms-card">
              <h3>Terms & Risks</h3>
              <p>PortHub — marketplace for collectible gifts & NFTs. Use at your own risk. Commission 2%.</p>
            </div>
          </section>
        </main>

        <footer class="ph-footer">
          <div class="nav-item active">Store</div>
          <div class="nav-item">My gifts</div>
          <div class="nav-item">Admin</div>
          <div class="nav-item">Terms</div>
        </footer>
      `;
    }
  }

  ensureDOM();

  /* ---------------------------
     Style injection matching screenshot (dark / blue / cyan)
     --------------------------- */
  (function injectStyles(){
    const css = `
      :root{
        --bg:#071023; --card:#0b1220; --muted:#8b98a6; --input:#0e2946; --btn:#36c3ff; --accent:#7fe3ff; --text:#eaf6ff;
      }
      *{box-sizing:border-box}
      body { margin:0; font-family: Inter, Poppins, system-ui, -apple-system, "Segoe UI", Roboto, Arial; background:var(--bg); color:var(--text); -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; }
      .app { width: min(720px, 100%); margin: 0 auto; padding: 16px; max-width: 420px; }
      .ph-header { margin-bottom: 12px; }
      .ph-banner { display:flex; align-items:center; justify-content:space-between; gap:12px; background:#000; padding:10px 12px; border-radius:12px; }
      .ph-title { display:flex; align-items:center; gap:10px; }
      .gift-icon { color:#9aa3b4; font-size:18px; }
      .porthub-text { color:#9aa3b4; font-weight:600; font-size:18px; letter-spacing:0.6px; }
      .ph-balance { background:linear-gradient(90deg,#06324a,#0b6bb1); padding:6px 10px; border-radius:999px; color:#001827; font-weight:700; font-size:13px; }
      .ph-tabs { display:flex; gap:8px; margin-top:10px; }
      .tab-btn { flex:1; padding:8px; border-radius:10px; border: none; background: rgba(255,255,255,0.02); color:var(--text); font-weight:700; cursor:pointer; }
      .tab-btn.active { background: linear-gradient(90deg,var(--btn), #0bb2ff); color:#001827; transform: translateY(-2px); box-shadow: 0 8px 22px rgba(20,120,200,0.08); }
      .ph-main { margin-top:12px; min-height:60vh; }
      .filters { margin-bottom:12px; display:flex; gap:8px; }
      input { background:var(--input); border:none; padding:12px; border-radius:10px; color:var(--text); outline:none; width:100%; }
      input::placeholder { color: rgba(234,246,255,0.35); }
      .cards-grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      .item-card, .gift-card { background:var(--card); border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:8px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); }
      .item-top { display:flex; gap:8px; align-items:center; }
      .item-img, .gift-img { width:100%; height:140px; border-radius:10px; object-fit:cover; background:#061025; }
      .item-meta { display:flex; flex-direction:column; gap:6px; padding-top:4px; }
      .item-title { font-weight:700; color:var(--text); font-size:15px; }
      .item-id { color:var(--muted); font-size:12px; }
      .item-bottom { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:auto; }
      .price-pill { background: linear-gradient(90deg,#36c3ff,#0bb2ff); padding:8px 10px; border-radius:999px; color:#001827; font-weight:800; display:flex; align-items:center; gap:8px; }
      .btn { padding:8px 10px; border-radius:10px; border:none; cursor:pointer; font-weight:700; }
      .btn-primary { background:var(--btn); color:#001827; }
      .btn-ghost { background:transparent; color:var(--muted); border:1px solid rgba(255,255,255,0.03); }
      .gift-meta { padding:6px 0; color:var(--text); font-weight:600; }
      .gift-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:8px; }
      .admin-panel { display:flex; flex-direction:column; gap:8px; }
      .admin-result { margin-top:8px; color:var(--muted); min-height:20px; }
      .terms-card { background:var(--card); padding:12px; border-radius:10px; color:var(--muted); }
      .ph-footer { position:fixed; left:0; right:0; bottom:0; display:flex; justify-content:space-around; gap:6px; padding:10px; background: linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.8)); max-width:420px; margin:0 auto; border-top:1px solid rgba(255,255,255,0.02); }
      .nav-item { flex:1; text-align:center; padding:8px 6px; color:var(--muted); font-weight:700; }
      .nav-item.active { color:var(--btn); }
      .empty { color:var(--muted); padding:10px; text-align:center; }
      @media (max-width:420px){ .cards-grid{grid-template-columns:1fr 1fr} .item-img{height:120px} }
    `;
    const s = document.createElement('style');
    s.innerHTML = css;
    document.head.appendChild(s);
  })();

  /* ---------------------------
     DOM refs
     --------------------------- */
  const elBalance = $('#balance');
  const elItems = $('#items');
  const elGifts = $('#giftList');
  const elSearch = $('#searchId');
  const elTarget = $('#targetId');
  const elAmount = $('#amount');
  const elGive = $('#giveBtn');
  const elAdminResult = $('#adminResult');

  /* ---------------------------
     Application state
     --------------------------- */
  const State = { user: null, nfts: [], gifts: [], subs: [] };

  /* ---------------------------
     Telegram init (optional)
     --------------------------- */
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  let tgUser = null;
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    tgUser = tg.initDataUnsafe.user;
  }

  /* ---------------------------
     Supabase operations (wrapper)
     --------------------------- */
  async function getOrCreateUser(telegram_id, username='') {
    try {
      const { data } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).limit(1);
      if (data && data.length) return data[0];
      const { data: ins } = await supabase.from('users').insert([{ telegram_id, username, balance: 0 }]).select().single();
      return ins;
    } catch (e) {
      console.error('getOrCreateUser', e);
      throw e;
    }
  }

  async function loadNfts() {
    try {
      const { data } = await supabase
        .from('nfts')
        .select('*, users:owner_id(id,username,telegram_id)')
        .order('created_at', { ascending: false });
      State.nfts = data || [];
      renderStore();
    } catch (e) { console.error('loadNfts', e); }
  }

  async function loadGiftsForUser(telegram_id) {
    try {
      // get user id
      const { data: users } = await supabase.from('users').select('id').eq('telegram_id', telegram_id).limit(1);
      if (!users || users.length === 0) { State.gifts = []; renderGifts(); return; }
      const uid = users[0].id;
      const { data } = await supabase.from('gifts').select('*').eq('user_id', uid).order('created_at', { ascending: false });
      State.gifts = data || [];
      renderGifts();
    } catch (e) { console.error('loadGiftsForUser', e); }
  }

  async function loadBalance(telegram_id) {
    try {
      const { data } = await supabase.from('users').select('balance').eq('telegram_id', telegram_id).single();
      if (data && typeof data.balance !== 'undefined') {
        if (State.user) State.user.balance = data.balance;
        updateBalanceUI();
      }
    } catch (e) { console.error('loadBalance', e); }
  }

  /* ---------------------------
     Realtime subscriptions (gifts + nfts)
     --------------------------- */
  function subscribeRealtime() {
    // unsubscribe previous
    if (State.subs && State.subs.length) {
      State.subs.forEach(s => s.unsubscribe && s.unsubscribe());
      State.subs = [];
    }

    // gifts table insert
    const giftsChannel = supabase
      .channel('gifts-ch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gifts' }, payload => {
        const g = payload.new;
        // if gift is to manager, then server or bot probably handled; refresh relevant user gifts
        console.log('gifts INSERT', g);
        // If current user is sender, refresh
        if (State.user && String(g.from_telegram_id) === String(State.user.telegram_id)) {
          loadGiftsForUser(State.user.telegram_id);
          toast('Подарок зачислен в My Gifts');
        }
        // if manager user
        if (State.user && String(State.user.telegram_id) === String(OWNER_TELEGRAM_ID)) {
          loadGiftsForUser(State.user.telegram_id);
          toast('Новый входящий подарок (менеджер)');
        }
      })
      .subscribe(status => {
        console.log('gifts channel status', status);
      });

    State.subs.push(giftsChannel);

    // nfts insert/update
    const nftsChannel = supabase
      .channel('nfts-ch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nfts' }, payload => {
        loadNfts();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'nfts' }, payload => {
        loadNfts();
      })
      .subscribe(status => { console.log('nfts channel', status); });

    State.subs.push(nftsChannel);
  }

  /* ---------------------------
     Render functions
     --------------------------- */
  function updateBalanceUI() {
    if (!elBalance) return;
    if (!State.user) elBalance.textContent = '0 TON';
    else elBalance.textContent = `${fmt(State.user.balance)} TON`;
  }

  function renderStore() {
    if (!elItems) return;
    elItems.innerHTML = '';
    const nfts = State.nfts || [];
    if (!nfts.length) { elItems.innerHTML = `<div class="empty">Каталог пуст</div>`; return; }
    for (const it of nfts) {
      const card = create('div','item-card');
      const img = create('img','item-img'); img.src = it.image || '/images/placeholder-nft.png';
      const meta = create('div','item-meta');
      meta.innerHTML = `<div class="item-title">${esc(it.name)}</div><div class="item-id">#${esc(it.id)}</div><div class="item-desc">${esc(it.description||'')}</div>`;
      const bottom = create('div','item-bottom');
      const price = create('div','price-pill'); price.innerHTML = `<span>💎</span> <strong>${fmt(it.price)}</strong>`;
      const btns = create('div','');
      const buy = create('button','btn btn-primary','Купить'); buy.onclick = () => buyNft(it.id);
      const more = create('button','btn btn-ghost','Подробнее'); more.onclick = () => openDetails(it);
      btns.appendChild(buy); btns.appendChild(more);
      bottom.appendChild(price); bottom.appendChild(btns);

      card.appendChild(img);
      card.appendChild(meta);
      card.appendChild(bottom);
      elItems.appendChild(card);
    }
  }

  function renderGifts() {
    if (!elGifts) return;
    elGifts.innerHTML = '';
    if (!State.gifts || State.gifts.length === 0) {
      const div = create('div','empty');
      div.innerHTML = `<div style="font-weight:700">Подарков нет :(</div>
                       <div style="margin-top:6px;color:#9aa3b4">Но в любой момент ты можешь их пополнить отправив NFT менеджеру!</div>`;
      elGifts.appendChild(div);
      return;
    }
    for (const g of State.gifts) {
      const card = create('div','gift-card');
      const img = create('img','gift-img'); img.src = g.image_url || '/images/placeholder-gift.png';
      const meta = create('div','gift-meta'); meta.innerHTML = `<div class="gift-name">${esc(g.nft_name)}</div><div class="gift-link"><a href="${esc(g.nft_link)}" target="_blank">${esc(g.nft_link)}</a></div>`;
      const actions = create('div','gift-actions');
      const listBtn = create('button','btn btn-primary','Выставить лот'); listBtn.onclick = ()=> listGift(g);
      const delBtn = create('button','btn btn-ghost','Удалить'); delBtn.onclick = ()=> deleteGift(g);
      actions.appendChild(listBtn); actions.appendChild(delBtn);
      card.appendChild(img); card.appendChild(meta); card.appendChild(actions);
      elGifts.appendChild(card);
    }
  }

  /* ---------------------------
     Actions: buyNft / listGift / deleteGift
     --------------------------- */

  async function buyNft(itemId) {
    if (!State.user) { alert('Войдите через Telegram'); return; }
    try {
      // re-get buyer
      const { data: buyers } = await supabase.from('users').select('*').eq('telegram_id', State.user.telegram_id).limit(1);
      const buyer = buyers && buyers[0];
      if (!buyer) throw new Error('Buyer not found');

      const { data: items } = await supabase.from('nfts').select('*').eq('id', itemId).limit(1);
      const it = items && items[0];
      if (!it) throw new Error('Item not found');

      if (Number(buyer.balance) < Number(it.price)) { alert('Недостаточно средств'); return; }
      if (!confirm(`Купить "${it.name}" за ${fmt(it.price)} TON? (комиссия 2%)`)) return;

      const { data: sellers } = await supabase.from('users').select('*').eq('id', it.owner_id).limit(1);
      const seller = sellers && sellers[0];
      if (!seller) throw new Error('Seller not found');

      const commission = Number(it.price) * 0.02;
      const sellerGets = Number(it.price) - commission;

      // perform updates
      await supabase.from('users').update({ balance: Number(buyer.balance) - Number(it.price) }).eq('telegram_id', buyer.telegram_id);
      await supabase.from('users').update({ balance: Number(seller.balance) + sellerGets }).eq('id', seller.id);
      await supabase.from('nfts').update({ owner_id: buyer.id }).eq('id', it.id);
      await supabase.from('transactions').insert([{ buyer_id: buyer.id, seller_id: seller.id, item_id: it.id, amount: it.price }]);

      // refresh
      await loadNfts();
      await loadBalance(State.user.telegram_id);
      toast('Покупка успешна');
    } catch (e) {
      console.error('buyNft', e);
      alert('Ошибка покупки: ' + (e.message||e));
    }
  }

  async function listGift(g) {
    if (!State.user) { alert('Войдите'); return; }
    const priceStr = prompt('Укажите цену для лота (TON):', '1.00');
    if (!priceStr) return;
    const price = Number(priceStr);
    if (isNaN(price) || price <= 0) { alert('Некорректная цена'); return; }
    try {
      await supabase.from('nfts').insert([{
        name: g.nft_name,
        description: `Лот из My Gifts: ${g.nft_name}`,
        price: price,
        owner_id: State.user.id,
        image: g.image_url,
        link: g.nft_link
      }]);
      toast('Лот выставлен');
      await loadNfts();
    } catch (e) {
      console.error('listGift', e);
      alert('Ошибка выставления лота');
    }
  }

  async function deleteGift(g) {
    if (!confirm('Удалить этот подарок?')) return;
    try {
      await supabase.from('gifts').delete().eq('id', g.id);
      toast('Подарок удалён');
      await loadGiftsForUser(State.user.telegram_id);
    } catch (e) {
      console.error('deleteGift', e);
      alert('Ошибка удаления');
    }
  }

  /* ---------------------------
     Admin give balance (client-side calls; ideally via backend)
     --------------------------- */
  if (elGive) {
    elGive.addEventListener('click', async () => {
      const target = elTarget.value.trim();
      const amount = Number(elAmount.value);
      if (!target || !amount || amount <= 0) { alert('Укажите корректный ID и сумму'); return; }
      // Client-side enforcement isn't secure; ideally server should check admin identity.
      if (!tgUser || String(tgUser.id) !== OWNER_TELEGRAM_ID) {
        if (!confirm('Вы не менеджер в этой сессии. Продолжить?')) return;
      }
      try {
        const { data: users } = await supabase.from('users').select('*').eq('telegram_id', target).limit(1);
        if (!users || users.length === 0) { alert('Пользователь не найден'); return; }
        const usr = users[0];
        await supabase.from('users').update({ balance: Number(usr.balance || 0) + amount }).eq('telegram_id', target);
        elAdminResult.textContent = `Выдано ${fmt(amount)} TON пользователю ${target}`;
        toast('Баланс выдан');
      } catch (e) {
        console.error('admin give', e);
        elAdminResult.textContent = 'Ошибка при выдаче';
      }
    });
  }

  /* ---------------------------
     Open details modal (simple)
     --------------------------- */
  function openDetails(item) {
    // simple modal using alert for now; can be expanded
    const txt = `Название: ${item.name}\nЦена: ${fmt(item.price)} TON\nВладелец: ${item.users ? item.users.username : '—'}\n\nОткрыть страницу?`;
    if (confirm(txt)) {
      window.open(item.link || '#', '_blank');
    }
  }

  /* ---------------------------
     Toast utility
     --------------------------- */
  function toast(msg, ttl=2500) {
    let root = document.getElementById('ph-toast-root');
    if (!root) {
      root = create('div'); root.id = 'ph-toast-root';
      root.style.position = 'fixed'; root.style.right = '18px'; root.style.bottom = '78px'; root.style.zIndex = 9999;
      document.body.appendChild(root);
    }
    const el = create('div'); el.textContent = msg;
    el.style.background = 'linear-gradient(90deg,#022a44,#06324a)';
    el.style.color = '#eaf6ff'; el.style.padding = '10px 12px'; el.style.borderRadius = '10px';
    el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)'; el.style.marginTop = '8px'; el.style.opacity = '0';
    root.appendChild(el);
    requestAnimationFrame(()=> { el.style.opacity = '1'; });
    setTimeout(()=> { el.style.opacity = '0'; setTimeout(()=> el.remove(), 400); }, ttl);
  }

  /* ---------------------------
     Tabs behavior + footer nav sync
     --------------------------- */
  $$('.tab-btn').forEach((b, idx) => {
    b.addEventListener('click', () => {
      $$('.tab-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const tabId = b.dataset.tab;
      $$('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      // footer nav sync
      $$('.nav-item').forEach(n => n.classList.remove('active'));
      $$('.nav-item')[idx].classList.add('active');
    });
  });
  $$('.nav-item').forEach((n, idx) => {
    n.addEventListener('click', ()=> $$('.tab-btn')[idx].click());
  });

  /* ---------------------------
     Search by ID (simple)
     --------------------------- */
  if (elSearch) {
    elSearch.addEventListener('input', (e) => {
      const v = e.target.value.trim();
      if (!v) return renderStore();
      const items = State.nfts.filter(it => String(it.id).includes(v) || (it.name && it.name.toLowerCase().includes(v.toLowerCase())));
      elItems.innerHTML = '';
      if (!items.length) { elItems.innerHTML = '<div class="empty">Ничего не найдено</div>'; return; }
      for (const it of items) {
        const card = create('div','item-card');
        const img = create('img','item-img'); img.src = it.image || '/images/placeholder-nft.png';
        const meta = create('div','item-meta'); meta.innerHTML = `<div class="item-title">${esc(it.name)}</div><div class="item-id">#${esc(it.id)}</div>`;
        const bottom = create('div','item-bottom');
        const price = create('div','price-pill'); price.innerHTML = `<span>💎</span> <strong>${fmt(it.price)}</strong>`;
        const btns = create('div',''); const buy = create('button','btn btn-primary','Купить'); buy.onclick=()=>buyNft(it.id);
        btns.appendChild(buy);
        bottom.appendChild(price); bottom.appendChild(btns);
        card.appendChild(img); card.appendChild(meta); card.appendChild(bottom);
        elItems.appendChild(card);
      }
    });
  }

  /* ---------------------------
     Init sequence
     --------------------------- */
  async function init() {
    try {
      if (tgUser) {
        State.user = await getOrCreateUser(tgUser.id, tgUser.username || tgUser.first_name || '');
        await loadBalance(State.user.telegram_id);
        await loadGiftsForUser(State.user.telegram_id);
      } else {
        console.warn('No Telegram in initDataUnsafe — limited mode');
      }
      await loadNfts();
      subscribeRealtime();
    } catch (e) {
      console.error('init', e);
    }
  }

  init();

})();
