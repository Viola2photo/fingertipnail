const test = require('node:test');
const assert = require('node:assert');
const { calculateTotals } = require('../src/lib/pricing');

test('未滿 1000 收運費 60', () => {
  const t = calculateTotals([{ price: 390, quantity: 1 }]);
  assert.deepStrictEqual([t.subtotal, t.shippingFee, t.total], [390, 60, 450]);
});

test('滿 1000 免運', () => {
  const t = calculateTotals([{ price: 590, quantity: 2 }]);
  assert.deepStrictEqual([t.shippingFee, t.total], [0, 1180]);
});

test('任 4 件 1000 取最貴的 4 件並免運', () => {
  const t = calculateTotals([{ price: 590, quantity: 2 }, { price: 300, quantity: 3 }]);
  // 由高到低：590,590,300,300 → 1780-1000=780 折抵；剩 1 件 300
  assert.strictEqual(t.eventDiscount, 780);
  assert.strictEqual(t.shippingFee, 0);
  assert.strictEqual(t.total, 2080 - 780);
});

test('優惠碼在活動折抵之後計算，且不會變成負數', () => {
  const t = calculateTotals([{ price: 390, quantity: 1 }], 'vip9');
  assert.strictEqual(t.promoDiscount, 39);
  assert.strictEqual(t.total, 390 - 39 + 60);
  const t2 = calculateTotals([{ price: 50, quantity: 1 }], 'SAVE100');
  assert.strictEqual(t2.promoDiscount, 50);
});

test('無效優惠碼不折抵', () => {
  const t = calculateTotals([{ price: 390, quantity: 1 }], 'NOPE');
  assert.strictEqual(t.promo, null);
  assert.strictEqual(t.promoDiscount, 0);
});

test('果凍膠不算進任 4 件', () => {
  const t = calculateTotals([{ price: 300, quantity: 3, name: '甜妹' }, { price: 60, quantity: 1, name: '瞬黏環保果凍膠' }]);
  assert.strictEqual(t.eventDiscount, 0);
  assert.strictEqual(t.total, 960 + 60);
  const t2 = calculateTotals([{ price: 300, quantity: 4, name: '甜妹' }, { price: 60, quantity: 2, name: '果凍膠' }]);
  assert.strictEqual(t2.eventDiscount, 200);
  assert.strictEqual(t2.total, 1000 + 120);
});
