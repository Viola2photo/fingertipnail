// 綠界 B2C 電子發票開立（AES-JSON）
// 規格：ECPay-API-Skill guides/04-invoice-b2c.md（SNAPSHOT 2026-04）、guides/14-aes-encryption.md
// 上線前請到綠界開發者網站核對 Issue（7896.md）的最新欄位規格。
const ecpay = require('./ecpay');

// 顧客可選的發票方式（結帳頁）
const INVOICE_TYPES = ['cloud', 'mobile', 'donate'];

// 檢查並整理顧客填的發票資料；回傳 { invoice } 或 { error }
function normalizeInvoiceRequest(raw, phone) {
  const type = INVOICE_TYPES.includes(raw?.type) ? raw.type : 'cloud';
  const email = String(raw?.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Email 格式不正確' };
  const invoice = { type, email, phone };
  if (type === 'mobile') {
    const code = String(raw?.carrierNum || '').trim().toUpperCase();
    // 手機條碼：斜線開頭共 8 碼（guides/04 §CarrierNum）
    if (!/^\/[0-9A-Z+\-.]{7}$/.test(code)) return { error: '手機條碼格式為 / 開頭共 8 碼' };
    invoice.carrierNum = code;
  }
  if (type === 'donate') {
    const loveCode = String(raw?.loveCode || '').trim();
    if (!/^\d{3,7}$/.test(loveCode)) return { error: '愛心碼為 3–7 位數字' };
    invoice.loveCode = loveCode;
  }
  return { invoice };
}

// 發票品項：無折扣時逐項列出；有折扣時合併為一項（避免負數品項），運費另列。
// 所有 ItemAmount 加總必須等於 SalesAmount（guides/04 §Items）。
function buildItems(order) {
  const t = order.totals || {};
  const discount = Number(t.eventDiscount || 0) + Number(t.promoDiscount || 0);
  const items = [];
  if (discount > 0) {
    const goods = Number(t.subtotal || 0) - discount;
    items.push({ ItemName: `穿戴甲（${order.items.length} 款，含優惠折抵）`, ItemCount: 1, ItemWord: '批', ItemPrice: goods, ItemTaxType: '1', ItemAmount: goods });
  } else {
    order.items.forEach((l) => items.push({
      ItemName: ecpay.cleanText(`${l.name} ${l.size}`, 100), ItemCount: l.quantity, ItemWord: '盒',
      ItemPrice: l.price, ItemTaxType: '1', ItemAmount: l.price * l.quantity,
    }));
  }
  if (Number(t.shippingFee) > 0) items.push({ ItemName: '運費', ItemCount: 1, ItemWord: '次', ItemPrice: t.shippingFee, ItemTaxType: '1', ItemAmount: t.shippingFee });
  return items.map((it, i) => ({ ItemSeq: i + 1, ...it }));
}

function buildIssueData(order, merchantId) {
  const inv = order.invoice || { type: 'cloud', phone: order.customerInfo?.phone };
  const items = buildItems(order);
  const data = {
    MerchantID: merchantId,
    RelateNumber: order.merchantTradeNo,
    CustomerName: ecpay.cleanText(order.customerInfo?.name, 60),
    CustomerPhone: inv.phone || order.customerInfo?.phone || '',
    CustomerEmail: inv.email || '',
    Print: '0',
    Donation: inv.type === 'donate' ? '1' : '0',
    LoveCode: inv.type === 'donate' ? inv.loveCode : '',
    // Donation=1 時 CarrierType 必須為空字串（互斥）
    CarrierType: inv.type === 'donate' ? '' : inv.type === 'mobile' ? '3' : '1',
    CarrierNum: inv.type === 'mobile' ? inv.carrierNum : '',
    TaxType: '1',
    SalesAmount: items.reduce((s, it) => s + it.ItemAmount, 0),
    Items: items,
    InvType: '07',
    vat: '1',
  };
  if (data.SalesAmount !== Number(order.totalAmount)) throw new Error(`發票金額 ${data.SalesAmount} 與訂單金額 ${order.totalAmount} 不符`);
  return data;
}

// 開立；成功回傳 { invoiceNo, invoiceDate, randomNumber }，失敗丟出錯誤（訊息會顯示在後台）
async function issueInvoice(order) {
  const cfg = ecpay.invoiceConfig();
  const body = {
    MerchantID: cfg.merchantId,
    RqHeader: { Timestamp: Math.floor(Date.now() / 1000), Revision: '3.0.0' },
    Data: ecpay.aesEncrypt(buildIssueData(order, cfg.merchantId), cfg.hashKey, cfg.hashIv),
  };
  const res = await ecpay.postJson(`${cfg.host}/B2CInvoice/Issue`, body);
  // 雙層檢查：先 TransCode（傳輸層），再解密 Data 看 RtnCode（業務層，整數 1）
  if (Number(res.TransCode) !== 1) throw new Error(`發票傳輸錯誤：${res.TransMsg || res.TransCode}`);
  const data = ecpay.aesDecrypt(res.Data, cfg.hashKey, cfg.hashIv);
  if (Number(data.RtnCode) !== 1) throw new Error(`發票開立失敗：${data.RtnMsg || data.RtnCode}`);
  return { invoiceNo: data.InvoiceNo, invoiceDate: data.InvoiceDate || '', randomNumber: data.RandomNumber || '' };
}

module.exports = { INVOICE_TYPES, normalizeInvoiceRequest, buildItems, buildIssueData, issueInvoice };
