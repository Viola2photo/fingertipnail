// AES（官方測試向量）與電子發票請求內容
const test = require('node:test');
const assert = require('node:assert');
const ecpay = require('../src/lib/ecpay');
const { normalizeInvoiceRequest, buildIssueData } = require('../src/lib/invoice');
const vectors = require('./aes-vectors.json').vectors.filter((v) => !v.mode);

for (const v of vectors.filter((x) => x.plaintext_json && x.expected_base64)) {
  test(`AES 加密：${v.name}`, () => {
    if (v.expected_url_encoded) assert.strictEqual(ecpay.aesUrlEncode(v.plaintext_json), v.expected_url_encoded);
    assert.strictEqual(ecpay.aesEncrypt(v.plaintext_json, v.hashKey, v.hashIV), v.expected_base64);
  });
}

for (const v of vectors.filter((x) => x.direction && x.encrypted_base64)) {
  test(`AES 解密：${v.name}`, () => {
    const out = ecpay.aesDecrypt(v.encrypted_base64, v.hashKey, v.hashIV);
    const expected = v.expected_json ? (typeof v.expected_json === 'string' ? JSON.parse(v.expected_json) : v.expected_json) : JSON.parse(v.expected_decrypted);
    assert.deepStrictEqual(out, expected);
  });
}

test('AES 加解密往返（含空白與中文）', () => {
  const data = { Name: '指尖 造藝 ~!*()', N: 1 };
  assert.deepStrictEqual(ecpay.aesDecrypt(ecpay.aesEncrypt(data, 'ejCk326UnaZWKisg', 'q9jcZX8Ib9LM8wYk'), 'ejCk326UnaZWKisg', 'q9jcZX8Ib9LM8wYk'), data);
});

test('發票方式檢查', () => {
  assert.strictEqual(normalizeInvoiceRequest({ type: 'mobile', carrierNum: '/abc+123' }, '0912345678').invoice.carrierNum, '/ABC+123');
  assert.ok(normalizeInvoiceRequest({ type: 'mobile', carrierNum: 'ABC1234' }).error);
  assert.ok(normalizeInvoiceRequest({ type: 'donate', loveCode: '12' }).error);
  assert.strictEqual(normalizeInvoiceRequest({ type: 'donate', loveCode: '168' }).invoice.loveCode, '168');
  assert.ok(normalizeInvoiceRequest({ type: 'cloud', email: 'bad' }).error);
  assert.strictEqual(normalizeInvoiceRequest(undefined, '0912345678').invoice.type, 'cloud');
});

const order = (totals, invoice) => ({
  merchantTradeNo: 'NSTEST0001', customerInfo: { name: '王小美', phone: '0912345678' },
  items: [{ name: '焦糖緞帶', size: 'S', quantity: 2, price: 490 }, { name: '彩虹法式', size: 'M', quantity: 1, price: 300 }],
  totals, totalAmount: totals.total, invoice,
});

test('發票品項加總等於訂單金額（含運費）', () => {
  const d = buildIssueData(order({ subtotal: 1280, eventDiscount: 0, promoDiscount: 0, shippingFee: 0, total: 1280 }, { type: 'cloud', phone: '0912345678' }), '2000132');
  assert.strictEqual(d.SalesAmount, 1280);
  assert.strictEqual(d.Items.length, 2);
  assert.strictEqual(d.CarrierType, '1');
  assert.strictEqual(d.Donation, '0');
});

test('有折扣時合併為一個品項，避免負數金額', () => {
  const d = buildIssueData(order({ subtotal: 1280, eventDiscount: 0, promoDiscount: 128, shippingFee: 60, total: 1212 }, { type: 'mobile', carrierNum: '/ABC+123', phone: '0912345678' }), '2000132');
  assert.strictEqual(d.SalesAmount, 1212);
  assert.ok(d.Items.every((i) => i.ItemAmount > 0));
  assert.strictEqual(d.CarrierType, '3');
  assert.strictEqual(d.CarrierNum, '/ABC+123');
});

test('捐贈發票：CarrierType 必須為空字串', () => {
  const d = buildIssueData(order({ subtotal: 1280, shippingFee: 0, total: 1280 }, { type: 'donate', loveCode: '168', phone: '0912345678' }), '2000132');
  assert.strictEqual(d.Donation, '1');
  assert.strictEqual(d.CarrierType, '');
  assert.strictEqual(d.LoveCode, '168');
});

test('金額不一致時拒絕開立', () => {
  assert.throws(() => buildIssueData(order({ subtotal: 1280, shippingFee: 0, total: 999 }, { type: 'cloud' }), '2000132'));
});
