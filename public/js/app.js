// 指尖造藝 前台（Preact + htm，免編譯）
import { html, render, useState, useEffect, useMemo, useRef, useCallback } from '../vendor/preact-htm.module.js';
import { SITE, SIZES, SHAPE_GROUPS, MOODS, PRICE_TIERS, ORDER_STATUS } from './config.js';
import { auth, watchUser, login, logout, watchProducts, watchMyOrders } from './firebase.js';

// ---------- 工具 ----------
const money = (n) => `NT$${Number(n || 0).toLocaleString('zh-TW')}`;
const totalStock = (p) => SIZES.reduce((s, k) => s + Number(p.stock?.[k] || 0), 0);
const firstImage = (p) => (p?.media || []).find((m) => m.type !== 'video')?.url || '';
const textOf = (p) => `${p.name || ''} ${p.description || ''} ${p.hashtags || ''}`;
const moodsOf = (p) => MOODS.filter((m) => m.words.some((w) => textOf(p).includes(w))).map((m) => m.key);
const isInAppBrowser = () => /Line\/|FBAN|FBAV|Instagram/i.test(navigator.userAgent);

function parseRoute() {
  const hash = location.hash.replace(/^#/, '');
  const m = /^\/p\/([A-Za-z0-9_-]+)/.exec(hash);
  if (m) return { name: 'product', id: m[1] };
  if (hash.startsWith('/checkout')) return { name: 'checkout' };
  if (hash.startsWith('/orders')) return { name: 'orders' };
  return { name: 'home' };
}
const go = (path) => { location.hash = path; window.scrollTo(0, 0); };
function scrollToId(id) {
  if (parseRoute().name !== 'home') { go('/'); setTimeout(() => document.getElementById(id)?.scrollIntoView(), 80); }
  else document.getElementById(id)?.scrollIntoView();
}

function loadCart() {
  try { return JSON.parse(localStorage.getItem('fingertip-cart') || '[]'); } catch (e) { return []; }
}
function saveCart(cart) {
  try { localStorage.setItem('fingertip-cart', JSON.stringify(cart)); } catch (e) { /* 無痕模式等情況忽略 */ }
}

// 建立隱藏表單整頁送往綠界（綠界付款頁不可放在 iframe）
function submitForm(action, fields, target) {
  const doc = target ? target.document : document;
  const form = doc.createElement('form');
  form.method = 'POST';
  form.action = action;
  Object.entries(fields).forEach(([name, value]) => {
    const input = doc.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = String(value);
    form.appendChild(input);
  });
  doc.body.appendChild(form);
  form.submit();
}

async function postJson(path, body, withAuth) {
  const headers = { 'Content-Type': 'application/json' };
  if (withAuth && auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  return fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

const NailIcon = ({ size = 40 }) => html`<svg width=${size} height=${size * 1.4} viewBox="0 0 56 80" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M10 78V34C10 16 20 4 28 4s18 12 18 30v44z"></path></svg>`;
const CartIcon = () => html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8z"></path><path d="M9 7V6a3 3 0 0 1 6 0v1"></path></svg>`;

function Photo({ product, alt }) {
  const src = firstImage(product);
  return src
    ? html`<img src=${src} alt=${alt || product.name} loading="lazy" />`
    : html`<div class="placeholder"><${NailIcon} /></div>`;
}

// ---------- 頁首／頁尾 ----------
function Header({ cartCount, onCart, user, query, setQuery }) {
  return html`
    <div class="announce">${SITE.announcement}</div>
    <header class="header">
      <div class="container header-inner">
        <a class="brand" href="#/">
          <img src="img/logo.webp" alt="" />
          <span><span class="brand-name">${SITE.name}</span><span class="brand-sub">${SITE.tagline}</span></span>
        </a>
        <nav class="nav" aria-label="主選單">
          <a href="#/" onClick=${(e) => { e.preventDefault(); scrollToId('shop'); }}>新品上架</a>
          <a href="#/" onClick=${(e) => { e.preventDefault(); scrollToId('shapes'); }}>依甲型挑選</a>
          <a href="#/" onClick=${(e) => { e.preventDefault(); scrollToId('moods'); }}>依風格挑選</a>
          <a href="#/" onClick=${(e) => { e.preventDefault(); scrollToId('size'); }}>尺寸指南</a>
          <a href="#/orders">我的訂單</a>
        </nav>
        <div class="header-tools">
          <label class="sr-only" for="q">搜尋款式</label>
          <input id="q" class="search" type="search" placeholder="搜尋：蝴蝶結、貓眼…" value=${query}
            onInput=${(e) => { setQuery(e.target.value); if (parseRoute().name !== 'home') go('/'); }} />
          ${user
            ? html`<button class="text-btn" onClick=${logout} title=${user.email}>登出</button>`
            : html`<button class="text-btn" onClick=${() => login().catch(() => {})}>登入</button>`}
          <button class="icon-btn" onClick=${onCart} aria-label=${`購物車，${cartCount} 件商品`}>
            <${CartIcon} />${cartCount > 0 && html`<span class="badge">${cartCount}</span>`}
          </button>
        </div>
      </div>
    </header>`;
}

function Footer() {
  return html`
    <footer class="footer">
      <div class="container footer-inner">
        <div style="flex:1 1 240px">
          <strong class="serif" style="font-size:22px;letter-spacing:.12em">${SITE.name}</strong>
          讓每一次打扮都沒有負擔，隨時換上最新流行。
        </div>
        <div style="flex:1 1 200px"><strong>付款方式</strong>綠界 ECPay：信用卡、ATM 轉帳、超商代碼</div>
        <div style="flex:1 1 200px"><strong>配送方式</strong>7-ELEVEN／全家 超商取貨、宅配<br />滿 ${money(SITE.freeShippingThreshold)} 免運，未滿運費 ${money(SITE.shippingFee)}</div>
        <div style="flex:1 1 200px"><strong>聯絡我們</strong><a href=${`mailto:${SITE.contactEmail}`}>${SITE.contactEmail}</a></div>
      </div>
    </footer>`;
}

// ---------- 首頁 ----------
function Home({ products, loading, query, filter, setFilter }) {
  const listed = useMemo(() => products.filter((p) => p.status !== 'N'), [products]);
  const newest = useMemo(() => [...listed].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))), [listed]);
  const newIds = useMemo(() => new Set(newest.slice(0, 12).map((p) => p.docId)), [newest]);
  const [visible, setVisible] = useState(24);
  useEffect(() => setVisible(24), [query, filter]);

  const shapeCount = (s) => listed.filter((p) => p.shape === s).length;
  const filtered = newest.filter((p) => {
    if (query && !textOf(p).toLowerCase().includes(query.toLowerCase())) return false;
    if (filter.shape && p.shape !== filter.shape) return false;
    if (filter.mood && !moodsOf(p).includes(filter.mood)) return false;
    if (filter.price && Number(p.price) !== filter.price) return false;
    if (filter.inStock && totalStock(p) === 0) return false;
    return true;
  });
  const sorted = filter.sort === 'price-asc' ? [...filtered].sort((a, b) => a.price - b.price)
    : filter.sort === 'price-desc' ? [...filtered].sort((a, b) => b.price - a.price) : filtered;
  const featured = newest.filter((p) => firstImage(p) && totalStock(p) > 0).slice(0, 3);
  const pick = (patch) => { setFilter({ ...filter, ...patch }); setTimeout(() => document.getElementById('shop')?.scrollIntoView(), 30); };
  const activeLabels = [filter.shape, MOODS.find((m) => m.key === filter.mood)?.label, filter.price && `NT$${filter.price}`, query && `「${query}」`].filter(Boolean);

  return html`
    <section class="container hero">
      <div class="hero-text">
        <div class="script" style="font-size:20px">Once upon a fingertip</div>
        <h1>今天，<br />想當哪一位公主？</h1>
        <p>3 分鐘貼上、隨時卸下。不用預約、不傷真甲，千金、甜妹、清冷仙氣，一週換一種心情也沒有壓力。</p>
        <div class="chips">
          <button class="btn btn-primary" onClick=${() => scrollToId('shop')}>開始挑款</button>
          <button class="btn btn-ghost" onClick=${() => scrollToId('size')}>我該選哪個尺寸？</button>
        </div>
        <div class="trust"><span>每款皆手作</span><span>XS–L 四種尺寸</span><span>綠界安全付款</span></div>
      </div>
      <div class="hero-arches" aria-hidden="true">
        ${[0, 1, 2].map((i) => html`<div class="arch">${featured[i] ? html`<${Photo} product=${featured[i]} alt="" />` : html`<div class="placeholder"><${NailIcon} /></div>`}</div>`)}
      </div>
    </section>

    <section class="steps" aria-label="購買流程">
      <div class="container steps-inner">
        <div class="step"><span class="step-num chip-pink">1</span><span><strong>挑一個風格</strong><span>依甲型或心情快速篩選</span></span></div>
        <div class="step"><span class="step-num chip-lav">2</span><span><strong>選你的尺寸</strong><span>XS／S／M／L，不確定看指南</span></span></div>
        <div class="step"><span class="step-num chip-mint">3</span><span><strong>貼上就出門</strong><span>超商取貨，綠界線上付款</span></span></div>
      </div>
    </section>

    <section id="shapes" class="container section">
      <div class="section-head">
        <div><div class="script">Choose your shape</div><h2>依甲型挑選</h2></div>
        <p class="muted" style="margin:0">短甲日常好上手，長甲顯手指修長</p>
      </div>
      <div class="shape-groups">
        ${SHAPE_GROUPS.map((g) => html`
          <div class="shape-card">
            <header>
              <span class=${`step-num ${g.chip}`}><${NailIcon} size=${18} /></span>
              <span><strong>${g.label}</strong><span class="muted" style="font-size:14px">${g.shapes.reduce((s, x) => s + shapeCount(x), 0)} 款 ・ ${g.note}</span></span>
            </header>
            <div class="chips">
              ${g.shapes.filter((s) => shapeCount(s) > 0).map((s) => html`
                <button class=${`chip ${g.chip}`} aria-pressed=${filter.shape === s} onClick=${() => pick({ shape: filter.shape === s ? '' : s })}>${s} ${shapeCount(s)}</button>`)}
            </div>
          </div>`)}
      </div>
    </section>

    <section id="moods" class="container section" style="padding-top:48px">
      <h2 class="sub-heading" style="margin-top:0">今天的心情是…</h2>
      <div class="chips">
        ${MOODS.map((m) => html`<button class=${`chip ${m.chip}`} aria-pressed=${filter.mood === m.key} onClick=${() => pick({ mood: filter.mood === m.key ? '' : m.key })}>${m.label} ・ ${m.hint}</button>`)}
      </div>
      <h3 class="sub-heading">依價位挑選</h3>
      <div class="chips">
        ${PRICE_TIERS.map((p) => html`<button class="chip chip-white" aria-pressed=${filter.price === p} onClick=${() => pick({ price: filter.price === p ? 0 : p })}>NT$${p}</button>`)}
      </div>
    </section>

    <section id="shop" class="container section">
      <div class="section-head">
        <div><div class="script">New this week</div><h2>${activeLabels.length ? '挑選結果' : '本週新款'}</h2></div>
        <span class="muted">${sorted.length} 款</span>
      </div>
      <div class="toolbar">
        <div class="active-filters">
          ${activeLabels.map((l) => html`<span class="chip chip-pink">${l}</span>`)}
          ${activeLabels.length > 0 && html`<button class="link-btn" onClick=${() => setFilter({ sort: filter.sort })}>清除篩選</button>`}
        </div>
        <span style="flex:1"></span>
        <label class="chip chip-white" style="cursor:pointer"><input type="checkbox" checked=${filter.inStock} onChange=${(e) => setFilter({ ...filter, inStock: e.target.checked })} /> 只看有貨</label>
        <label class="sr-only" for="sort">排序</label>
        <select id="sort" value=${filter.sort || ''} onChange=${(e) => setFilter({ ...filter, sort: e.target.value })}>
          <option value="">最新上架</option><option value="price-asc">價格低到高</option><option value="price-desc">價格高到低</option>
        </select>
      </div>
      ${loading
        ? html`<div class="empty">載入中…</div>`
        : sorted.length === 0
          ? html`<div class="empty">沒有符合的款式，換個條件試試看</div>`
          : html`<div class="grid">${sorted.slice(0, visible).map((p) => html`<${Card} product=${p} isNew=${newIds.has(p.docId)} />`)}</div>`}
      ${sorted.length > visible && html`<div class="more"><button class="btn btn-ghost" onClick=${() => setVisible(visible + 24)}>看更多款式</button></div>`}
    </section>

    <section id="size" class="container">
      <div class="size-guide">
        <div>
          <h2>不知道自己的尺寸？</h2>
          <p style="margin:0;color:#4A3050">用膠帶量大拇指甲最寬處，對照右邊的尺寸。介於兩個尺寸之間，建議選小一號更服貼。</p>
        </div>
        <div class="size-cells">
          ${SIZES.map((s) => html`<div class="size-cell"><strong>${s}</strong><span class="muted" style="font-size:13px">${SITE.sizeGuide?.[s] ? `拇指 ${SITE.sizeGuide[s]} mm` : '歡迎私訊詢問'}</span></div>`)}
        </div>
      </div>
    </section>`;
}

function Card({ product: p, isNew }) {
  const stock = totalStock(p);
  return html`
    <a class="card" href=${`#/p/${p.docId}`}>
      <div class="arch">
        <${Photo} product=${p} />
        ${stock === 0 ? html`<span class="tag soldout">售完</span>` : stock === 1 ? html`<span class="tag">最後 1 件</span>` : isNew && html`<span class="tag">NEW</span>`}
      </div>
      <div class="card-body">
        <span class="card-shape">${p.shape}</span>
        <span class="card-name">${p.name}</span>
        <span class="price">${money(p.price)}</span>
      </div>
    </a>`;
}

// ---------- 商品頁 ----------
function ProductPage({ id, products, loading, addToCart }) {
  const p = products.find((x) => x.docId === id);
  const media = (p?.media || []).filter((m) => m.url);
  const firstOpen = SIZES.find((s) => Number(p?.stock?.[s]) > 0) || '';
  const [size, setSize] = useState(firstOpen);
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState(0);
  const [added, setAdded] = useState(false);
  useEffect(() => { setSize(firstOpen); setQty(1); setPhoto(0); setAdded(false); }, [id, firstOpen]);

  if (loading) return html`<div class="container section"><div class="empty">載入中…</div></div>`;
  if (!p || p.status === 'N') return html`<div class="container section"><div class="empty">找不到這個款式，可能已經下架。<br /><a href="#/">回到首頁</a></div></div>`;

  const max = Number(p.stock?.[size] || 0);
  const current = media[photo];
  const related = products.filter((x) => x.docId !== p.docId && x.status !== 'N' && x.shape === p.shape && totalStock(x) > 0).slice(0, 4);
  const tags = String(p.hashtags || '').split('#').map((t) => t.trim()).filter(Boolean).slice(0, 5);

  return html`
    <div class="container">
      <nav class="breadcrumb" aria-label="麵包屑"><a href="#/">首頁</a><span>/</span><span>${p.shape}</span><span>/</span><span>${p.name}</span></nav>
      <section class="product">
        <div class="gallery">
          <div class="framed">
            <div class="photo">
              ${current ? (current.type === 'video'
                ? html`<video src=${current.url} autoplay muted loop playsinline></video>`
                : html`<img src=${current.url} alt=${p.name} />`) : html`<div class="placeholder"><${NailIcon} size=${64} /></div>`}
            </div>
            <img class="frame" src="img/frame.webp" alt="" />
          </div>
          ${media.length > 1 && html`
            <div class="thumbs">
              ${media.slice(0, 10).map((m, i) => html`
                <button class="thumb" aria-pressed=${photo === i} aria-label=${`第 ${i + 1} 張`} onClick=${() => setPhoto(i)}>
                  ${m.type === 'video' ? html`<div class="placeholder">▶</div>` : html`<img src=${m.url} alt="" />`}
                </button>`)}
            </div>`}
        </div>
        <div class="info">
          <div class="chips">
            <span class="chip chip-sky">${p.shape}</span>
            ${moodsOf(p).slice(0, 2).map((k) => { const m = MOODS.find((x) => x.key === k); return html`<span class=${`chip ${m.chip}`}>${m.label}</span>`; })}
          </div>
          <h1>${p.name}</h1>
          <div class="price" style="font-size:30px">${money(p.price)}</div>
          ${p.description && html`<p style="margin:0;font-size:16px;line-height:1.9;color:#4A3050">${p.description}</p>`}
          ${tags.length > 0 && html`<div class="muted" style="font-size:14px">${tags.map((t) => `#${t}`).join('　')}</div>`}

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <strong>選擇尺寸</strong>
              <button class="link-btn" onClick=${() => scrollToId('size')}>尺寸怎麼量？</button>
            </div>
            <div class="sizes" role="group" aria-label="尺寸">
              ${SIZES.map((s) => {
                const n = Number(p.stock?.[s] || 0);
                return html`<button class="size-btn" disabled=${n === 0} aria-pressed=${size === s} onClick=${() => { setSize(s); setQty(1); setAdded(false); }}>
                  <strong>${s}</strong><span>${n === 0 ? '售完' : n <= 3 ? `剩 ${n} 件` : '有現貨'}</span></button>`;
              })}
            </div>
          </div>

          ${totalStock(p) === 0
            ? html`<div class="notice notice-peach">這款目前全部售完。想要補貨通知，歡迎來信 <a href=${`mailto:${SITE.contactEmail}?subject=${encodeURIComponent(`補貨通知：${p.name}`)}`}>${SITE.contactEmail}</a></div>`
            : html`
              <div class="chips" style="align-items:center">
                <div class="qty">
                  <button aria-label="減少數量" onClick=${() => setQty(Math.max(1, qty - 1))}>−</button>
                  <span aria-live="polite">${qty}</span>
                  <button aria-label="增加數量" onClick=${() => setQty(Math.min(max, qty + 1))}>+</button>
                </div>
                <button class="btn btn-primary" style="flex:1 1 200px" disabled=${!size}
                  onClick=${() => { addToCart(p, size, qty); setAdded(true); }}>加入購物車</button>
              </div>`}
          ${added && html`<div class="notice notice-mint" role="status">已加入購物車：${p.name} ${size} × ${qty}　<a href="#/checkout">前往結帳 →</a></div>`}

          <div class="perks"><span>綠界安全付款</span><span>超商取貨</span><span>手作出貨</span></div>
        </div>
      </section>

      ${related.length > 0 && html`
        <section class="section">
          <div class="section-head"><h2>同樣是${p.shape}的你，也會喜歡</h2></div>
          <div class="grid">${related.map((x) => html`<${Card} product=${x} />`)}</div>
        </section>`}
    </div>`;
}

// ---------- 購物車與試算 ----------
function useQuote(cart, promoCode) {
  const [state, setState] = useState({ loading: false, totals: null, error: '', promoInvalid: false });
  useEffect(() => {
    if (!cart.length) { setState({ loading: false, totals: null, error: '', promoInvalid: false }); return; }
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      try {
        const res = await postJson('/api/quote', { items: cart.map((l) => ({ id: l.id, size: l.size, quantity: l.qty })), promoCode });
        const data = await res.json();
        if (!res.ok) setState({ loading: false, totals: null, error: data.error || '無法計算金額', promoInvalid: false });
        else setState({ loading: false, totals: data.totals, error: '', promoInvalid: data.promoInvalid });
      } catch (e) {
        setState({ loading: false, totals: null, error: '網路連線不穩，請稍後再試', promoInvalid: false });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [JSON.stringify(cart.map((l) => [l.id, l.size, l.qty])), promoCode]);
  return state;
}

function Summary({ cart, quote }) {
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const t = quote.totals;
  return html`
    <div style="display:flex;flex-direction:column;gap:6px">
      <div class="sum-row"><span>商品小計</span><span>${money(t?.subtotal ?? subtotal)}</span></div>
      ${t?.eventDiscount > 0 && html`<div class="sum-row"><span>任選 4 件 NT$1,000</span><span>−${money(t.eventDiscount)}</span></div>`}
      ${t?.promoDiscount > 0 && html`<div class="sum-row"><span>${t.promo?.name}</span><span>−${money(t.promoDiscount)}</span></div>`}
      <div class="sum-row"><span>運費</span><span>${t ? (t.shippingFee ? money(t.shippingFee) : '免運') : '—'}</span></div>
      <div class="sum-total"><span>結帳金額</span><span class="price">${quote.loading ? '計算中…' : t ? money(t.total) : '—'}</span></div>
      ${quote.error && html`<div class="notice notice-peach">${quote.error}</div>`}
    </div>`;
}

function CartDrawer({ cart, setCart, onClose, promo, setPromo, quote }) {
  const [code, setCode] = useState(promo);
  const update = (i, qty) => setCart(cart.map((l, j) => (j === i ? { ...l, qty } : l)).filter((l) => l.qty > 0));
  return html`
    <div class="overlay" onClick=${onClose}></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="購物車">
      <div class="drawer-head"><h2>購物車</h2><button class="icon-btn" aria-label="關閉" onClick=${onClose}>×</button></div>
      <div class="drawer-body">
        ${cart.length === 0 && html`<div class="empty">購物車是空的<br /><button class="link-btn" onClick=${onClose}>去逛逛</button></div>`}
        ${cart.map((l, i) => html`
          <div class="line">
            <div class="thumbnail">${l.image ? html`<img src=${l.image} alt="" />` : html`<div class="placeholder"><${NailIcon} size=${24} /></div>`}</div>
            <div class="line-main">
              <strong>${l.name}</strong>
              <span class="muted" style="font-size:13px">尺寸 ${l.size}</span>
              <div class="line-row">
                <div class="mini-qty">
                  <button aria-label="減少" onClick=${() => update(i, l.qty - 1)}>−</button><span style="width:24px;text-align:center">${l.qty}</span><button aria-label="增加" onClick=${() => update(i, Math.min(20, l.qty + 1))}>+</button>
                </div>
                <strong>${money(l.price * l.qty)}</strong>
              </div>
              <button class="link-btn" style="align-self:flex-start" onClick=${() => update(i, 0)}>移除</button>
            </div>
          </div>`)}
      </div>
      ${cart.length > 0 && html`
        <div class="drawer-foot">
          <form class="promo" onSubmit=${(e) => { e.preventDefault(); setPromo(code.trim()); }}>
            <label class="sr-only" for="promo">優惠碼</label>
            <input id="promo" class="search" style="width:auto;flex:1;max-width:none" placeholder="優惠碼" value=${code} onInput=${(e) => setCode(e.target.value)} />
            <button class="text-btn" type="submit">套用</button>
          </form>
          ${quote.promoInvalid && html`<div class="notice notice-peach">優惠碼無效或已過期</div>`}
          <${Summary} cart=${cart} quote=${quote} />
          <button class="btn btn-primary" disabled=${!!quote.error} onClick=${() => { onClose(); go('/checkout'); }}>前往結帳</button>
        </div>`}
    </aside>`;
}

// ---------- 結帳 ----------
function Checkout({ cart, user, quote, promo }) {
  const [form, setForm] = useState({ name: user?.displayName || '', phone: '', email: user?.email || '', address: '' });
  const [method, setMethod] = useState('UNIMARTC2C');
  const [store, setStore] = useState(null);
  const [invoice, setInvoice] = useState({ type: 'cloud', carrierNum: '', loveCode: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== location.origin || event.data?.type !== 'ECPAY_MAP_RESULT') return;
      setStore({ id: event.data.storeId, name: event.data.storeName, address: event.data.storeAddress, subType: event.data.subType });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!cart.length) return html`<div class="container section"><div class="empty">購物車是空的。<br /><a href="#/">去挑選款式</a></div></div>`;

  const isHome = method === 'HOME';
  const storeOk = isHome ? form.address.trim().length > 5 : store && store.subType === method;
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!storeOk) return setError(isHome ? '請填寫宅配地址' : '請先選擇取貨門市');
    setBusy(true);
    try {
      const res = await postJson('/api/checkout', {
        items: cart.map((l) => ({ id: l.id, size: l.size, quantity: l.qty })),
        promoCode: promo, name: form.name, phone: form.phone,
        store: isHome ? null : store, address: isHome ? form.address : '',
        invoice: { ...invoice, email: form.email },
      }, true);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.action) throw new Error(data.error || '結帳失敗，請稍後再試');
      submitForm(data.action, data.fields);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const methods = [['UNIMARTC2C', '7-ELEVEN 取貨'], ['FAMIC2C', '全家 取貨'], ['HOME', '宅配到府']];
  const invoiceTypes = [['cloud', '雲端發票', '存在綠界會員載具，中獎會通知'], ['mobile', '手機條碼', '存到你的手機條碼載具'], ['donate', '捐贈發票', '捐給社福團體']];

  return html`
    <form class="container checkout" onSubmit=${submit}>
      <div class="checkout-main">
        <h1 class="serif" style="margin:0;font-size:32px">結帳</h1>
        ${isInAppBrowser() && html`<div class="notice notice-peach">你正在 LINE／Facebook／Instagram 的內建瀏覽器中，綠界付款可能會失敗。請點右上角「⋯」選擇「用預設瀏覽器開啟」後再結帳。</div>`}

        <section class="panel">
          <h2>收件人</h2>
          <div class="fields">
            <label class="field">姓名（取貨核對用）<input required maxlength="20" autocomplete="name" value=${form.name} onInput=${set('name')} /></label>
            <label class="field">手機號碼<input required type="tel" inputmode="numeric" pattern="09[0-9]{8}" placeholder="0912345678" autocomplete="tel" value=${form.phone} onInput=${set('phone')} /><small>09 開頭 10 碼，取貨與發票通知用</small></label>
            <label class="field">Email（選填）<input type="email" autocomplete="email" value=${form.email} onInput=${set('email')} /><small>填寫可收到電子發票通知</small></label>
          </div>
        </section>

        <section class="panel">
          <h2>配送方式</h2>
          <div class="options">
            ${methods.map(([k, l]) => html`<button type="button" class="option" aria-pressed=${method === k} onClick=${() => setMethod(k)}><strong>${l}</strong><span>${quote.totals?.shippingFee === 0 ? '本單免運' : `運費 ${money(SITE.shippingFee)}`}</span></button>`)}
          </div>
          ${isHome
            ? html`<div class="fields store-picked"><label class="field">宅配地址<textarea required value=${form.address} onInput=${set('address')}></textarea></label></div>`
            : html`<div class="store-picked">
                <button type="button" class="btn btn-ghost" onClick=${() => window.open(`/api/ecpay/map?type=${method}`, 'ecpayMap', 'width=1000,height=700')}>${store && store.subType === method ? '重新選擇門市' : '開啟地圖選擇門市'}</button>
                ${store && store.subType === method && html`<div class="notice notice-mint" style="margin-top:10px">已選擇：${store.name}（${store.address}）</div>`}
              </div>`}
        </section>

        <section class="panel">
          <h2>電子發票</h2>
          <div class="options">
            ${invoiceTypes.map(([k, l, n]) => html`<button type="button" class="option" aria-pressed=${invoice.type === k} onClick=${() => setInvoice({ ...invoice, type: k })}><strong>${l}</strong><span>${n}</span></button>`)}
          </div>
          ${invoice.type === 'mobile' && html`<div class="fields store-picked"><label class="field">手機條碼<input required pattern="/[0-9A-Za-z+.\\-]{7}" placeholder="/ABC+123" value=${invoice.carrierNum} onInput=${(e) => setInvoice({ ...invoice, carrierNum: e.target.value })} /><small>斜線開頭共 8 碼</small></label></div>`}
          ${invoice.type === 'donate' && html`<div class="fields store-picked"><label class="field">愛心碼<input required inputmode="numeric" pattern="[0-9]{3,7}" placeholder="例：168001" value=${invoice.loveCode} onInput=${(e) => setInvoice({ ...invoice, loveCode: e.target.value })} /></label></div>`}
          <p class="muted" style="font-size:13px;margin:12px 0 0">需要公司統編發票，請在付款後來信 ${SITE.contactEmail}</p>
        </section>
      </div>

      <aside class="checkout-side panel">
        <h2>訂單摘要</h2>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
          ${cart.map((l) => html`<div class="sum-row"><span>${l.name} ${l.size} × ${l.qty}</span><span>${money(l.price * l.qty)}</span></div>`)}
        </div>
        <${Summary} cart=${cart} quote=${quote} />
        ${error && html`<div class="notice notice-pink" role="alert" style="margin-top:12px">${error}</div>`}
        <button class="btn btn-primary" type="submit" style="width:100%;margin-top:16px" disabled=${busy || !!quote.error || quote.loading}>${busy ? '前往綠界付款…' : '前往綠界付款'}</button>
        <p class="muted" style="font-size:12px;margin:10px 0 0">付款由綠界科技 ECPay 處理，本站不儲存信用卡資料。${!user ? ' 登入後下單可在「我的訂單」查看進度。' : ''}</p>
      </aside>
    </form>`;
}

// ---------- 我的訂單 ----------
function Orders({ user, banner }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    if (!user) return;
    return watchMyOrders(user.uid, setOrders, () => setOrders([]));
  }, [user?.uid]);

  return html`
    <div class="container section" style="max-width:860px">
      <h1 class="serif" style="margin:0 0 20px;font-size:32px">我的訂單</h1>
      ${banner && html`<div class="notice notice-mint" style="margin-bottom:16px">${banner}</div>`}
      ${!user
        ? html`<div class="empty">登入後可以查看訂單進度。<br /><br /><button class="btn btn-primary" onClick=${() => login().catch(() => {})}>使用 Google 登入</button><br /><br />沒有登入就下單的話，訂單狀態請來信 ${SITE.contactEmail} 詢問。</div>`
        : orders === null ? html`<div class="empty">載入中…</div>`
        : orders.length === 0 ? html`<div class="empty">還沒有訂單，<a href="#/">去逛逛</a></div>`
        : html`<div style="display:flex;flex-direction:column;gap:16px">${orders.map((o) => {
            const [label, chip] = ORDER_STATUS[o.status] || [o.status, 'chip-white'];
            return html`
              <article class="order-card">
                <div class="line-row">
                  <span><strong>${o.merchantTradeNo}</strong><span class="muted" style="display:block;font-size:13px">${new Date(o.createdAt).toLocaleString('zh-TW')}</span></span>
                  <span class=${`status ${chip}`}>${label}</span>
                </div>
                ${(o.items || []).map((i) => html`<div class="sum-row"><span>${i.name} ${i.size} × ${i.quantity}</span><span>${money(i.price * i.quantity)}</span></div>`)}
                ${o.status === 'awaiting_payment' && o.paymentInfo && html`<div class="notice notice-peach">
                  ${o.paymentInfo.vAccount && html`<div>ATM 轉帳：銀行代碼 ${o.paymentInfo.bankCode}，帳號 ${o.paymentInfo.vAccount}</div>`}
                  ${o.paymentInfo.paymentNo && html`<div>超商繳費代碼：${o.paymentInfo.paymentNo}</div>`}
                  ${o.paymentInfo.expireDate && html`<div>繳費期限：${o.paymentInfo.expireDate}</div>`}
                </div>`}
                <div class="sum-row"><span>${o.customerInfo?.address}</span><strong>${money(o.totalAmount)}</strong></div>
                ${o.invoiceNo && html`<div class="muted" style="font-size:13px">電子發票：${o.invoiceNo}</div>`}
              </article>`;
          })}</div>`}
    </div>`;
}

// ---------- 主程式 ----------
function App() {
  const [route, setRoute] = useState(parseRoute());
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [user, setUser] = useState(null);
  const [cart, setCartState] = useState(loadCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [promo, setPromo] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState({ sort: '' });
  const [banner, setBanner] = useState('');

  const setCart = useCallback((next) => { setCartState(next); saveCart(next); }, []);
  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => watchUser(setUser), []);
  useEffect(() => watchProducts((list) => { setProducts(list); setLoading(false); }, () => { setLoadError('商品資料讀取失敗，請重新整理'); setLoading(false); }), []);

  // 從綠界付款頁回來（/api/ecpay/result 會帶 ?order=）
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get('order');
    if (!result) return;
    setBanner(result === 'success'
      ? `付款成功！訂單編號 ${params.get('no') || ''}，我們會盡快為你出貨。`
      : `訂單 ${params.get('no') || ''} 已建立。若選擇 ATM 或超商代碼，請在期限內完成繳費。`);
    if (result === 'success') setCart([]);
    history.replaceState(null, '', `${location.pathname}#/orders`);
    setRoute({ name: 'orders' });
  }, []);

  // 商品價格、名稱、照片以最新資料為準
  const liveCart = cart.map((l) => {
    const p = products.find((x) => x.docId === l.id);
    return p ? { ...l, name: p.name, price: Number(p.price), image: firstImage(p) } : l;
  });
  const quote = useQuote(liveCart, promo);

  const addToCart = (p, size, qty) => {
    const existing = cart.find((l) => l.id === p.docId && l.size === size);
    const max = Number(p.stock?.[size] || 0);
    const next = existing
      ? cart.map((l) => (l === existing ? { ...l, qty: Math.min(max, l.qty + qty) } : l))
      : [...cart, { id: p.docId, size, qty: Math.min(max, qty), name: p.name, price: Number(p.price), image: firstImage(p) }];
    setCart(next);
  };

  const count = cart.reduce((s, l) => s + l.qty, 0);
  return html`
    <${Header} cartCount=${count} onCart=${() => setCartOpen(true)} user=${user} query=${query} setQuery=${setQuery} />
    <main>
      ${loadError && html`<div class="container"><div class="notice notice-peach" style="margin-top:16px">${loadError}</div></div>`}
      ${route.name === 'home' && html`<${Home} products=${products} loading=${loading} query=${query} filter=${filter} setFilter=${setFilter} />`}
      ${route.name === 'product' && html`<${ProductPage} id=${route.id} products=${products} loading=${loading} addToCart=${addToCart} />`}
      ${route.name === 'checkout' && html`<${Checkout} cart=${liveCart} user=${user} quote=${quote} promo=${promo} />`}
      ${route.name === 'orders' && html`<${Orders} user=${user} banner=${banner} />`}
    </main>
    <${Footer} />
    ${cartOpen && html`<${CartDrawer} cart=${liveCart} setCart=${setCart} onClose=${() => setCartOpen(false)} promo=${promo} setPromo=${setPromo} quote=${quote} />`}`;
}

const root = document.getElementById('app');
root.textContent = ''; // 清掉「載入中」文字再掛上程式
render(html`<${App} />`, root);
