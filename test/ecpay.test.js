// 執行：npm test（Node 18+ 內建 test runner）
const test = require('node:test');
const assert = require('node:assert');
const ecpay = require('../lib/ecpay');
const vectors = require('./checkmacvalue-vectors.json').vectors;

// 官方測試向量（ECPay-API-Skill test-vectors/checkmacvalue.json），E-Ticket 公式不同不適用
for (const v of vectors.filter((x) => !x.formula)) {
  test(`CheckMacValue：${v.name}`, () => {
    const got = ecpay.generateCheckMacValue(v.params, v.hashKey, v.hashIV, v.method.toLowerCase());
    assert.strictEqual(got, v.expected);
  });
}

test('verifyCheckMacValue 接受正確值、拒絕被竄改的值', () => {
  const v = vectors.find((x) => x.name.startsWith('Callback'));
  const params = { ...v.params, CheckMacValue: v.expected };
  assert.ok(ecpay.verifyCheckMacValue(params, v.hashKey, v.hashIV));
  assert.ok(!ecpay.verifyCheckMacValue({ ...params, TradeAmt: '1' }, v.hashKey, v.hashIV));
  assert.ok(!ecpay.verifyCheckMacValue({ ...params, CheckMacValue: 'short' }, v.hashKey, v.hashIV));
});

test('taipeiDateTime 轉成 UTC+8 並補零', () => {
  assert.strictEqual(ecpay.taipeiDateTime(new Date('2026-01-02T03:04:05Z')), '2026/01/02 11:04:05');
  assert.strictEqual(ecpay.taipeiDateTime(new Date('2026-12-31T20:00:00Z')), '2027/01/01 04:00:00');
});

test('newMerchantTradeNo 僅英數字且不超過 20 字元', () => {
  for (let i = 0; i < 50; i++) {
    const no = ecpay.newMerchantTradeNo();
    assert.match(no, /^[A-Za-z0-9]{1,20}$/);
  }
});

test('cleanText 去除標籤、控制字元並依字元截斷', () => {
  assert.strictEqual(ecpay.cleanText('<b>甜心</b>\n蝴蝶結', 100), '甜心 蝴蝶結');
  assert.strictEqual(ecpay.cleanText('穿戴甲穿戴甲', 3), '穿戴甲');
});

test('parsePipeResponse 解析物流建單成功與失敗', () => {
  const ok = ecpay.parsePipeResponse('1|MerchantID=2000933&AllPayLogisticsID=123&CVSPaymentNo=C1');
  assert.ok(ok.ok);
  assert.strictEqual(ok.data.AllPayLogisticsID, '123');
  const bad = ecpay.parsePipeResponse('0|ReceiverName 格式錯誤');
  assert.ok(!bad.ok);
  assert.strictEqual(bad.message, 'ReceiverName 格式錯誤');
});

test('autoSubmitForm 會跳脫參數值', () => {
  const html = ecpay.autoSubmitForm('https://example.com', { ItemName: '"><script>x</script>' });
  assert.ok(!html.includes('<script>x'));
});
