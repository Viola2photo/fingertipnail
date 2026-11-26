// 訂單通知信（Resend 寄信服務，https://resend.com）
// 三種信：
//   placedShop     有新訂單 → 寄給店家（SHOP_NOTIFY_EMAIL）
//   placedCustomer 訂單成立 → 寄給顧客（結帳填的 Email，沒填用登入帳號的 Email）
//   shipped        已出貨   → 寄給顧客
// 每封信寄出後記在訂單 notify.<種類>，不會重複寄；寄失敗會標記 notifyPending，由每 10 分鐘的排程重寄（最多 5 次）。
// 沒有設定 RESEND_API_KEY（填 -）時不寄信，網站其他功能照常。
const { ordersRef } = require('./firebase');
const { applyOrderUpdate } = require('./orders');

const SHOP_NAME = '指尖造藝';
const MAX_ATTEMPTS = 5;
const KINDS = ['placedShop', 'placedCustomer', 'shipped'];
const KIND_LABELS = { placedShop: '新訂單通知（店家）', placedCustomer: '訂單成立（顧客）', shipped: '出貨通知（顧客）' };

function env(name) {
  const v = String(process.env[name] || '').trim();
  return v && v !== '-' ? v : '';
}

function mailEnabled() {
  return Boolean(env('RESEND_API_KEY'));
}

function fromAddress() {
  return env('MAIL_FROM') || `${SHOP_NAME} <hello@tiptipart.com>`;
}

function siteUrl() {
  return (env('SITE_URL') || 'https://tiptipart.com').replace(/\/$/, '');
}

const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

function customerEmail(order) {
  const e = String(order.customerEmail || order.invoice?.email || '').trim();
  return validEmail(e) ? e : '';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const money = (n) => `NT$ ${Number(n || 0).toLocaleString('en-US')}`;
const STORE_LABELS = { UNIMARTC2C: '7-ELEVEN', FAMIC2C: '全家', HILIFEC2C: '萊爾富', OKMARTC2C: 'OK 超商' };
const isCod = (order) => order.payment?.paymentType === 'COD';

function itemsTable(order) {
  const rows = (order.items || []).map((l) => `<tr><td style="padding:6px 0">${esc(l.name)}（${esc(l.size)}）× ${Number(l.quantity) || 1}</td><td style="padding:6px 0;text-align:right">${money(l.subtotal ?? (l.price * l.quantity))}</td></tr>`);
  const t = order.totals || {};
  const discount = (t.eventDiscount || 0) + (t.saleDiscount || 0) + (t.promoDiscount || 0);
  if (discount > 0) rows.push(`<tr><td style="padding:6px 0">優惠折抵</td><td style="padding:6px 0;text-align:right">− ${money(discount)}</td></tr>`);
  rows.push(`<tr><td style="padding:6px 0">運費</td><td style="padding:6px 0;text-align:right">${t.shippingFee ? money(t.shippingFee) : '免運'}</td></tr>`);
  rows.push(`<tr><td style="padding:8px 0;border-top:1px solid #eee"><b>合計</b></td><td style="padding:8px 0;border-top:1px solid #eee;text-align:right"><b>${money(order.totalAmount)}</b></td></tr>`);
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.join('')}</table>`;
}

function itemsText(order) {
  return (order.items || []).map((l) => `・${l.name}（${l.size}）× ${l.quantity}`).join('\n') + `\n合計：${money(order.totalAmount)}`;
}

function storeLine(order) {
  const s = order.shipping || {};
  return `${STORE_LABELS[s.subType] || '超商'} ${s.name || ''}（${s.address || ''}）`;
}

function layout(title, body) {
  return `<!doctype html><html><body style="margin:0;background:#faf6f3;font-family:-apple-system,'PingFang TC','Microsoft JhengHei',sans-serif;color:#333">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font-size:20px;font-weight:600;margin-bottom:16px">${SHOP_NAME}</div>
<div style="background:#fff;border-radius:12px;padding:20px">
<h2 style="font-size:18px;margin:0 0 12px">${esc(title)}</h2>
${body}
</div>
<p style="font-size:12px;color:#999;margin-top:16px">這封信由 ${SHOP_NAME} 網站自動寄出。有任何問題直接回覆這封信，或寫信到 hello@tiptipart.com。<br>${SHOP_NAME}不會用電話、LINE 或簡訊要求您操作 ATM 或提供信用卡資料。</p>
</div></body></html>`;
}

const p = (s) => `<p style="font-size:14px;line-height:1.7;margin:0 0 12px">${s}</p>`;

function buildMessage(kind, order) {
  const no = order.merchantTradeNo;
  const name = order.customerInfo?.name || '';
  const pay = isCod(order) ? '超商取貨付款（取貨時付款）' : '信用卡（已付款）';
  const ordersLink = `${siteUrl()}/#/orders`;

  if (kind === 'placedShop') {
    const email = customerEmail(order);
    return {
      to: env('SHOP_NOTIFY_EMAIL'),
      subject: `【新訂單】${no}｜${name}｜${money(order.totalAmount)}`,
      html: layout('有新訂單了', [
        p(`訂單編號：<b>${esc(no)}</b><br>付款方式：${esc(pay)}`),
        p(`收件人：${esc(name)}　${esc(order.customerInfo?.phone || '')}${email ? `<br>Email：${esc(email)}` : ''}<br>取貨門市：${esc(storeLine(order))}`),
        itemsTable(order),
        order.oversold?.length ? p(`<b style="color:#c0392b">⚠ 庫存不足：${esc(order.oversold.join('、'))}</b>`) : '',
        p(`<a href="${siteUrl()}/admin.html">到後台處理出貨</a>`),
      ].join('')),
      text: `有新訂單 ${no}\n付款方式：${pay}\n收件人：${name} ${order.customerInfo?.phone || ''}\n取貨門市：${storeLine(order)}\n${itemsText(order)}`,
      replyTo: email || undefined,
    };
  }

  if (kind === 'placedCustomer') {
    return {
      to: customerEmail(order),
      subject: `【${SHOP_NAME}】訂單成立通知 ${no}`,
      html: layout('謝謝你的訂購！', [
        p(`${esc(name)} 你好，我們已收到你的訂單，會盡快為你手工製作與出貨。`),
        p(`訂單編號：<b>${esc(no)}</b><br>付款方式：${esc(pay)}<br>取貨門市：${esc(storeLine(order))}`),
        itemsTable(order),
        p('出貨時會再寄信通知你。包裹到店後超商會傳簡訊給你，請記得帶證件在 7 天內取貨。'),
        p(`<a href="${ordersLink}">查看我的訂單</a>`),
      ].join('')),
      text: `${name} 你好，我們已收到你的訂單 ${no}。\n付款方式：${pay}\n取貨門市：${storeLine(order)}\n${itemsText(order)}\n出貨時會再寄信通知你。查看訂單：${ordersLink}`,
    };
  }

  if (kind === 'shipped') {
    const lg = order.logistics || {};
    const tracking = lg.cvsPaymentNo || order.manualTrackingNo || '';
    return {
      to: customerEmail(order),
      subject: `【${SHOP_NAME}】你的訂單已出貨 ${no}`,
      html: layout('你的訂單已出貨', [
        p(`${esc(name)} 你好，訂單 <b>${esc(no)}</b> 已經安排出貨了！`),
        p(`取貨門市：${esc(storeLine(order))}${tracking ? `<br>物流編號：${esc(tracking)}` : ''}${isCod(order) ? `<br>取貨時需付款：<b>${money(order.totalAmount)}</b>` : ''}`),
        p('包裹一般約 2～4 天到店，到店時超商會傳簡訊通知你，請記得帶證件在 7 天內取貨。'),
        itemsTable(order),
        p(`<a href="${ordersLink}">查看我的訂單</a>`),
      ].join('')),
      text: `${name} 你好，訂單 ${no} 已出貨。\n取貨門市：${storeLine(order)}${tracking ? `\n物流編號：${tracking}` : ''}${isCod(order) ? `\n取貨時需付款：${money(order.totalAmount)}` : ''}\n到店時超商會傳簡訊通知你，請在 7 天內取貨。`,
    };
  }
  throw new Error(`未知的信件種類 ${kind}`);
}

async function sendMail({ to, subject, html, text, replyTo }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromAddress(), to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`寄信失敗 ${res.status}：${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// 寄出這筆訂單該寄、還沒寄的信。kinds 省略時依訂單狀態判斷。永不丟出錯誤（寄信失敗不能影響下單或出貨）。
async function notifyOrder(merchantTradeNo, kinds) {
  if (!mailEnabled()) return [];
  const results = [];
  try {
    const snap = await ordersRef().doc(merchantTradeNo).get();
    if (!snap.exists) return results;
    const order = snap.data();
    const notify = { ...(order.notify || {}) };
    const wanted = kinds || dueKinds(order);
    const errors = [];
    // 同時寄出（綠界付款通知要在 10 秒內回應，每封信最多等 4 秒）
    await Promise.all(wanted.filter((kind) => !notify[kind]).map(async (kind) => {
      const label = KIND_LABELS[kind];
      const msg = buildMessage(kind, order);
      if (!msg.to) { notify[kind] = 'skipped'; results.push(`${label}：沒有收件信箱`); return; }
      try {
        await sendMail(msg);
        notify[kind] = new Date().toISOString();
        results.push(`${label}：已寄出`);
      } catch (e) {
        errors.push(`${label}：${e.message}`);
        results.push(`${label}：${e.message}`);
      }
    }));
    const attempts = errors.length ? (order.notifyAttempts || 0) + 1 : 0;
    await applyOrderUpdate(null, order, {
      notify,
      notifyPending: errors.length > 0 && attempts < MAX_ATTEMPTS,
      notifyAttempts: attempts,
      notifyError: errors.join('；'),
    });
  } catch (e) {
    console.error('notify order error', merchantTradeNo, e);
    results.push(`錯誤：${e.message}`);
  }
  return results;
}

function dueKinds(order) {
  const kinds = [];
  if (['paid', 'shipping', 'shipped', 'completed'].includes(order.status)) kinds.push('placedShop', 'placedCustomer');
  if (['shipping', 'shipped'].includes(order.status)) kinds.push('shipped');
  return kinds;
}

// 排程：重寄先前失敗的信
async function retryPendingNotifications(log) {
  if (!mailEnabled()) return;
  const snaps = await ordersRef().where('notifyPending', '==', true).limit(20).get();
  for (const doc of snaps.docs) {
    const r = await notifyOrder(doc.id);
    log.push(`通知信 ${doc.id}：${r.join('、')}`);
  }
}

module.exports = { KINDS, mailEnabled, buildMessage, customerEmail, notifyOrder, retryPendingNotifications, sendMail };
