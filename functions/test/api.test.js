// 以記憶體資料庫取代 firebase-admin，測試結帳與綠界通知流程（測試環境帳號）
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createFakeDb, fieldValue } = require('./fake-firestore');
const ecpay = require('../src/lib/ecpay');

const db = createFakeDb();
const root = db.collection('artifacts').doc('nail-inventory-app').collection('users').doc('ADMIN');
const fakeFirebase = {
  FieldValue: fieldValue,
  verifyIdToken: async (t) => (t === 'admin-token' ? { uid: 'ADMIN' } : t === 'buyer-token' ? { uid: 'BUYER' } : Promise.reject(new Error('bad'))),
  db,
  APP_ID: 'nail-inventory-app',
  ADMIN_USER_ID: 'ADMIN',
  inventoryRef: () => root.collection('inventory'),
  ordersRef: () => root.collection('orders'),
  stockMovementsRef: () => root.collection('stockMovements'),
  shippingSettingsRef: () => root.collection('settings').doc('shipping'),
  customerOrderRef: (uid, id) => db.collection('artifacts').doc('nail-inventory-app').collection('users').doc(uid).collection('orders').doc(id),
};
require.cache[path.resolve(__dirname, '../src/lib/firebase.js')] = { id: 'fake', filename: 'fake', loaded: true, exports: fakeFirebase };

const checkout = require('../src/handlers/checkout');
const webhook = require('../src/handlers/ecpayReturn');
const paymentInfo = require('../src/handlers/ecpayPaymentInfo');
const adminOrder = require('../src/handlers/adminOrder');

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.send = (b) => { res.body = b; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const req = (body, headers = {}) => ({ method: 'POST', body, headers: { host: 'shop.example.com', ...headers }, query: {} });
const STAGE = ecpay.paymentConfig();
const signed = (params) => ({ ...params, CheckMacValue: ecpay.generateCheckMacValue(params, STAGE.hashKey, STAGE.hashIv) });
const formValue = (body, name) => body && body.fields ? body.fields[name] : undefined;

test.before(async () => {
  await fakeFirebase.inventoryRef().doc('NAIL_0001').set({ id: 'NAIL_0001', name: '焦糖緞帶', price: 490, stock: { XS: 0, S: 2, M: 1, L: 0 } });
  await fakeFirebase.inventoryRef().doc('NAIL_0003').set({ id: 'NAIL_0003', name: '取貨付款測試款', price: 390, stock: { M: 3 } });
  await fakeFirebase.inventoryRef().doc('NAIL_0002').set({ id: 'NAIL_0002', name: '下架款', price: 390, status: 'N', stock: { S: 5 } });
});

let orderNo;

const STORE = { subType: 'UNIMARTC2C', id: '131386', name: '7-ELEVEN 信義門市', address: '台北市信義區松仁路100號' };

test('結帳以資料庫價格計算金額，不採用前端金額', async () => {
  const res = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'S', quantity: 1 }], total: 1, name: '王小美', phone: '0912345678', store: STORE }, { authorization: 'Bearer buyer-token' }), res);
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  assert.strictEqual(formValue(res.body, 'TotalAmount'), '550'); // 490 + 運費 60
  orderNo = formValue(res.body, 'MerchantTradeNo');
  const order = (await fakeFirebase.ordersRef().doc(orderNo).get()).data();
  assert.strictEqual(order.status, 'pending');
  assert.strictEqual(order.customerUid, 'BUYER');
  assert.ok((await fakeFirebase.customerOrderRef('BUYER', orderNo).get()).exists);
  // 送出的 CheckMacValue 可被驗證
  assert.ok(ecpay.verifyCheckMacValue(res.body.fields, STAGE.hashKey, STAGE.hashIv));
  assert.match(res.body.action, /payment-stage\.ecpay\.com\.tw\/Cashier\/AioCheckOut\/V5$/);
});

test('超過庫存或下架商品無法結帳', async () => {
  const res = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'M', quantity: 2 }], name: '王小美', phone: '0912345678', store: STORE }), res);
  assert.strictEqual(res.statusCode, 409);
  const res2 = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0002', size: 'S', quantity: 1 }], name: '王小美', phone: '0912345678', store: STORE }), res2);
  assert.strictEqual(res2.statusCode, 409);
});

test('CheckMacValue 錯誤的通知會被拒絕', async () => {
  const res = mockRes();
  await webhook(req({ MerchantTradeNo: orderNo, RtnCode: '1', TradeAmt: '550', CheckMacValue: 'X'.repeat(64) }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual((await fakeFirebase.ordersRef().doc(orderNo).get()).data().status, 'pending');
});

test('ATM 取號通知（RtnCode=2）記錄繳費資訊', async () => {
  const res = mockRes();
  await paymentInfo(req(signed({ MerchantID: '3002607', MerchantTradeNo: orderNo, RtnCode: '2', RtnMsg: 'Get VirtualAccount Succeeded', TradeNo: 'T1', TradeAmt: '550', PaymentType: 'ATM_TAISHIN', TradeDate: '2026/10/11 10:00:00', BankCode: '812', vAccount: '9103522175887271', ExpireDate: '2026/10/14' })), res);
  assert.strictEqual(res.body, '1|OK');
  const order = (await fakeFirebase.ordersRef().doc(orderNo).get()).data();
  assert.strictEqual(order.status, 'awaiting_payment');
  assert.strictEqual(order.paymentInfo.vAccount, '9103522175887271');
});

test('付款成功扣庫存；重送的通知不會重複扣', async () => {
  const payload = signed({ MerchantID: '3002607', MerchantTradeNo: orderNo, RtnCode: '1', RtnMsg: '交易成功', TradeNo: 'T1', TradeAmt: '550', PaymentDate: '2026/10/11 10:05:00', PaymentType: 'ATM_TAISHIN', PaymentTypeChargeFee: '10', TradeDate: '2026/10/11 10:00:00', SimulatePaid: '0' });
  for (let i = 0; i < 2; i++) {
    const res = mockRes();
    await webhook(req({ ...payload }), res);
    assert.strictEqual(res.body, '1|OK');
  }
  const product = (await fakeFirebase.inventoryRef().doc('NAIL_0001').get()).data();
  assert.strictEqual(product.stock.S, 1);
  const order = (await fakeFirebase.ordersRef().doc(orderNo).get()).data();
  assert.strictEqual(order.status, 'paid');
  assert.strictEqual(order.payment.fee, 10);
  const buyerCopy = (await fakeFirebase.customerOrderRef('BUYER', orderNo).get()).data();
  assert.strictEqual(buyerCopy.status, 'paid');
  const movements = [...db.store.keys()].filter((k) => k.includes('/stockMovements/'));
  assert.strictEqual(movements.length, 1);
});

test('金額不符的通知不扣庫存並標記人工確認', async () => {
  const res = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'M', quantity: 1 }], name: '王小美', phone: '0912345678', store: STORE }), res);
  const no = formValue(res.body, 'MerchantTradeNo');
  const res2 = mockRes();
  await webhook(req(signed({ MerchantID: '3002607', MerchantTradeNo: no, RtnCode: '1', TradeAmt: '1', PaymentType: 'Credit_CreditCard', SimulatePaid: '0' })), res2);
  assert.strictEqual(res2.body, '1|OK');
  assert.strictEqual((await fakeFirebase.ordersRef().doc(no).get()).data().status, 'amount_mismatch');
  assert.strictEqual((await fakeFirebase.inventoryRef().doc('NAIL_0001').get()).data().stock.M, 1);
});

test('後台 API 需要店家帳號；取消已付款訂單可退回庫存', async () => {
  const denied = mockRes();
  await adminOrder(req({ action: 'cancel', orderId: orderNo }, { authorization: 'Bearer buyer-token' }), denied);
  assert.strictEqual(denied.statusCode, 403);

  const res = mockRes();
  await adminOrder(req({ action: 'cancel', orderId: orderNo, restock: true }, { authorization: 'Bearer admin-token' }), res);
  assert.deepStrictEqual(res.body, { ok: true });
  assert.strictEqual((await fakeFirebase.inventoryRef().doc('NAIL_0001').get()).data().stock.S, 2);
  assert.strictEqual((await fakeFirebase.ordersRef().doc(orderNo).get()).data().status, 'cancelled');
});

// ---- 路由、試算、模擬付款、排程 ----
const quote = require('../src/handlers/quote');
const { routeKey } = require('../src/router');
const maintenance = require('../src/maintenance');

test('路由同時支援網站網址與 Cloud Functions 直連網址', () => {
  assert.strictEqual(routeKey({ method: 'POST', path: '/api/ecpay/return' }), 'POST /api/ecpay/return');
  assert.strictEqual(routeKey({ method: 'POST', path: '/api/api/ecpay/return/' }), 'POST /api/ecpay/return');
});

test('試算：以資料庫價格計算，無效優惠碼會回報', async () => {
  const res = mockRes();
  await quote(req({ items: [{ id: 'NAIL_0001', size: 'S', quantity: 1 }], promoCode: 'NOPE' }), res);
  assert.strictEqual(res.body.totals.total, 550);
  assert.strictEqual(res.body.promoInvalid, true);
});

test('綠界模擬付款（SimulatePaid=1）不改訂單、不扣庫存', async () => {
  const res = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'S', quantity: 1 }], name: '王小美', phone: '0912345678', store: STORE }), res);
  const no = formValue(res.body, 'MerchantTradeNo');
  const before = (await fakeFirebase.inventoryRef().doc('NAIL_0001').get()).data().stock.S;
  const res2 = mockRes();
  await webhook(req(signed({ MerchantID: '3002607', MerchantTradeNo: no, RtnCode: '1', TradeAmt: '550', PaymentType: 'Credit_CreditCard', SimulatePaid: '1' })), res2);
  assert.strictEqual(res2.body, '1|OK');
  assert.strictEqual((await fakeFirebase.ordersRef().doc(no).get()).data().status, 'pending');
  assert.strictEqual((await fakeFirebase.inventoryRef().doc('NAIL_0001').get()).data().stock.S, before);
});

test('排程：漏收通知的已付款訂單會補登，並自動開立電子發票', async () => {
  process.env.INVOICE_ENABLED = 'true';
  await fakeFirebase.inventoryRef().doc('NAIL_0001').update({ stock: { XS: 0, S: 2, M: 1, L: 1 } });
  const res = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'L', quantity: 1 }], name: '王小美', phone: '0912345678', store: STORE, invoice: { type: 'mobile', carrierNum: '/ABC+123' } }), res);
  const no = formValue(res.body, 'MerchantTradeNo');
  await fakeFirebase.ordersRef().doc(no).update({ createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString() });

  const INV = ecpay.invoiceConfig();
  let invoiceRequest;
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (url.includes('QueryTradeInfo')) {
      const p = { MerchantID: '3002607', MerchantTradeNo: no, TradeNo: 'T9', TradeAmt: '550', PaymentType: 'Credit_CreditCard', PaymentDate: '2026/10/11 10:00:00', TradeStatus: '1', PaymentTypeChargeFee: '12' };
      return { ok: true, text: async () => new URLSearchParams(signed(p)).toString() };
    }
    if (url.includes('/B2CInvoice/Issue')) {
      const body = JSON.parse(opts.body);
      invoiceRequest = ecpay.aesDecrypt(body.Data, INV.hashKey, INV.hashIv);
      return { ok: true, json: async () => ({ TransCode: 1, Data: ecpay.aesEncrypt({ RtnCode: 1, RtnMsg: '開立發票成功', InvoiceNo: 'AB12345678', InvoiceDate: '2026-10-11 10:10:00', RandomNumber: '1234' }, INV.hashKey, INV.hashIv) }) };
    }
    throw new Error(`unexpected ${url}`);
  };
  try {
    const log = await maintenance.runMaintenance();
    const log2 = await maintenance.runMaintenance();
    const order = (await fakeFirebase.ordersRef().doc(no).get()).data();
    assert.strictEqual(order.status, 'paid', JSON.stringify(log));
    assert.strictEqual((await fakeFirebase.inventoryRef().doc('NAIL_0001').get()).data().stock.L, 0);
    assert.strictEqual(order.invoiceNo, 'AB12345678', JSON.stringify(log2));
    assert.strictEqual(invoiceRequest.RelateNumber, no);
    assert.strictEqual(invoiceRequest.CarrierNum, '/ABC+123');
    assert.strictEqual(invoiceRequest.SalesAmount, 550);
  } finally {
    global.fetch = realFetch;
    delete process.env.INVOICE_ENABLED;
  }
});

test('排程：繳費期限已過且未付款的 ATM 訂單自動取消', async () => {
  const res = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'S', quantity: 1 }], name: '王小美', phone: '0912345678', store: STORE }), res);
  const no = formValue(res.body, 'MerchantTradeNo');
  await fakeFirebase.ordersRef().doc(no).update({ status: 'awaiting_payment', paymentInfo: { expireDate: '2026/01/01' } });
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, text: async () => new URLSearchParams(signed({ MerchantID: '3002607', MerchantTradeNo: no, TradeStatus: '0', TradeAmt: '550' })).toString() });
  try {
    await maintenance.reconcileUnpaid([]);
    assert.strictEqual((await fakeFirebase.ordersRef().doc(no).get()).data().status, 'cancelled');
  } finally { global.fetch = realFetch; }
});

test('繳費期限（台灣時間）解析', () => {
  assert.strictEqual(maintenance.parseTaipei('2026/10/14').toISOString(), '2026-10-14T15:59:59.000Z');
  assert.strictEqual(maintenance.parseTaipei('2026/10/14 12:00:00').toISOString(), '2026-10-14T04:00:00.000Z');
});

test('只填地址（宅配）無法結帳，必須選擇超商門市', async () => {
  const res = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'S', quantity: 1 }], name: '王小美', phone: '0912345678', address: '台北市信義區' }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /取貨門市/);
});

// ---- 收件人姓名、取貨付款、物流單 ----
const adminLogistics = require('../src/handlers/adminLogistics');
const logisticsNotify = require('../src/handlers/logisticsNotify');
const LOGI = ecpay.logisticsConfig();
const admin = { authorization: 'Bearer admin-token' };

test('收件人姓名需符合超商規定（中文 2～5 字或英文 4～10 字母）', async () => {
  const bad = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0003', size: 'M', quantity: 1 }], name: '張', phone: '0912345678', store: STORE }), bad);
  assert.strictEqual(bad.statusCode, 400);
  assert.match(bad.body.error, /中文 2～5 字/);
  assert.strictEqual(ecpay.logisticsName('Viola Chang'), 'ViolaChang');
  assert.strictEqual(ecpay.logisticsName('Viola Chang 2'), '');
  assert.strictEqual(ecpay.logisticsName('歐陽娜娜美子'), '');
});

let codNo;
test('超商取貨付款：不經綠界付款頁，訂單直接成立並扣庫存，但還不算收款', async () => {
  const res = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0003', size: 'M', quantity: 1 }], name: 'Viola Chang', phone: '0912345678', store: STORE, paymentMethod: 'cod' }), res);
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.cod, true);
  assert.strictEqual(res.body.action, undefined);
  codNo = res.body.orderNo;
  const order = (await fakeFirebase.ordersRef().doc(codNo).get()).data();
  assert.strictEqual(order.status, 'paid');
  assert.strictEqual(order.payment.paymentType, 'COD');
  assert.strictEqual(order.paidAt, undefined);
  assert.strictEqual((await fakeFirebase.inventoryRef().doc('NAIL_0003').get()).data().stock.M, 2);
});

test('建立物流單：沒填寄件人會提示到出貨設定；取貨付款帶代收金額', async () => {
  const noSender = mockRes();
  await adminLogistics(req({ action: 'create', orderId: codNo }, admin), noSender);
  assert.strictEqual(noSender.statusCode, 400);
  assert.match(noSender.body.error, /出貨設定/);

  await fakeFirebase.shippingSettingsRef().set({ senderName: '張力予', senderPhone: '0911222333' });
  const realFetch = global.fetch;
  let sent;
  global.fetch = async (url, opts) => { sent = Object.fromEntries(new URLSearchParams(opts.body)); return { ok: true, text: async () => '1|AllPayLogisticsID=LG123&CVSPaymentNo=C987&CVSValidationNo=V1' }; };
  try {
    const res = mockRes();
    await adminLogistics(req({ action: 'create', orderId: codNo }, admin), res);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
  } finally { global.fetch = realFetch; }
  assert.strictEqual(sent.IsCollection, 'Y');
  assert.strictEqual(sent.GoodsAmount, '450');
  assert.strictEqual(sent.CollectionAmount, '450');
  assert.strictEqual(sent.ReceiverName, 'ViolaChang');
  assert.strictEqual(sent.SenderName, '張力予');
  assert.ok(ecpay.verifyCheckMacValue(sent, LOGI.hashKey, LOGI.hashIv, 'md5'));
  const order = (await fakeFirebase.ordersRef().doc(codNo).get()).data();
  assert.strictEqual(order.status, 'shipping');
  assert.strictEqual(order.logistics.cvsPaymentNo, 'C987');
});

test('物流通知：顧客已取貨（2067）→ 訂單完成，取貨付款記為已收款', async () => {
  const body = { MerchantID: LOGI.merchantId, AllPayLogisticsID: 'LG123', RtnCode: '2067', RtnMsg: '買家已到店取貨' };
  body.CheckMacValue = ecpay.generateCheckMacValue(body, LOGI.hashKey, LOGI.hashIv, 'md5');
  const res = mockRes();
  await logisticsNotify(req(body), res);
  assert.strictEqual(res.body, '1|OK');
  const order = (await fakeFirebase.ordersRef().doc(codNo).get()).data();
  assert.strictEqual(order.status, 'completed');
  assert.strictEqual(order.payment.collected, true);
  assert.ok(order.paidAt);
});

test('後台可修改不合規的收件人姓名；建立物流單後就不能改', async () => {
  const res = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0003', size: 'M', quantity: 1 }], name: '王小美', phone: '0912345678', store: STORE, paymentMethod: 'cod' }), res);
  const no = res.body.orderNo;
  const bad = mockRes();
  await adminOrder(req({ action: 'receiver', orderId: no, name: 'A' }, admin), bad);
  assert.strictEqual(bad.statusCode, 400);
  const ok = mockRes();
  await adminOrder(req({ action: 'receiver', orderId: no, name: '王美美' }, admin), ok);
  assert.deepStrictEqual(ok.body, { ok: true });
  assert.strictEqual((await fakeFirebase.ordersRef().doc(no).get()).data().customerInfo.name, '王美美');
  const locked = mockRes();
  await adminOrder(req({ action: 'receiver', orderId: codNo, name: '王美美' }, admin), locked);
  assert.match(locked.body.error, /已建立物流單/);
});
