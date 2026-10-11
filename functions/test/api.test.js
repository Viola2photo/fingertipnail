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
  await fakeFirebase.inventoryRef().doc('NAIL_0002').set({ id: 'NAIL_0002', name: '下架款', price: 390, status: 'N', stock: { S: 5 } });
});

let orderNo;

test('結帳以資料庫價格計算金額，不採用前端金額', async () => {
  const res = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'S', quantity: 1 }], total: 1, name: '王小美', phone: '0912345678', address: '台北市信義區' }, { authorization: 'Bearer buyer-token' }), res);
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
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'M', quantity: 2 }], name: '王小美', phone: '0912345678', address: '台北' }), res);
  assert.strictEqual(res.statusCode, 409);
  const res2 = mockRes();
  await checkout(req({ items: [{ id: 'NAIL_0002', size: 'S', quantity: 1 }], name: '王小美', phone: '0912345678', address: '台北' }), res2);
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
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'M', quantity: 1 }], name: '王小美', phone: '0912345678', address: '台北' }), res);
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
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'S', quantity: 1 }], name: '王小美', phone: '0912345678', address: '台北' }), res);
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
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'L', quantity: 1 }], name: '王小美', phone: '0912345678', address: '台北', invoice: { type: 'mobile', carrierNum: '/ABC+123' } }), res);
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
  await checkout(req({ items: [{ id: 'NAIL_0001', size: 'S', quantity: 1 }], name: '王小美', phone: '0912345678', address: '台北' }), res);
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
