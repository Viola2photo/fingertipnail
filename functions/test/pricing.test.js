const test = require('node:test');
const assert = require('node:assert');
const { calculateTotals, OPENING_SALE } = require('../src/lib/pricing');

// 以下前幾項是沒有開幕活動時的基本規則（sale 傳 null）

test('未滿 1000 收運費 60', () => {
  const t = calculateTotals([{ price: 390, quantity: 1 }], '', null);
  assert.deepStrictEqual([t.subtotal, t.shippingFee, t.total], [390, 60, 450]);
});

test('滿 1000 免運', () => {
  const t = calculateTotals([{ price: 590, quantity: 2 }], '', null);
  assert.deepStrictEqual([t.shippingFee, t.total], [0, 1180]);
});

test('任 4 件 1000 取最貴的 4 件並免運', () => {
  const t = calculateTotals([{ price: 590, quantity: 2 }, { price: 300, quantity: 3 }], '', null);
  // 由高到低：590,590,300,300 → 1780-1000=780 折抵；剩 1 件 300
  assert.strictEqual(t.eventDiscount, 780);
  assert.strictEqual(t.shippingFee, 0);
  assert.strictEqual(t.total, 2080 - 780);
});

test('優惠碼在活動折抵之後計算，且不會變成負數', () => {
  const t = calculateTotals([{ price: 390, quantity: 1 }], 'vip9', null);
  assert.strictEqual(t.promoDiscount, 39);
  assert.strictEqual(t.total, 390 - 39 + 60);
  const t2 = calculateTotals([{ price: 50, quantity: 1 }], 'SAVE100', null);
  assert.strictEqual(t2.promoDiscount, 50);
});

test('無效優惠碼不折抵', () => {
  const t = calculateTotals([{ price: 390, quantity: 1 }], 'NOPE', null);
  assert.strictEqual(t.promo, null);
  assert.strictEqual(t.promoDiscount, 0);
});

test('果凍膠不算進任 4 件', () => {
  const t = calculateTotals([{ price: 300, quantity: 3, name: '甜妹' }, { price: 60, quantity: 1, name: '瞬黏環保果凍膠' }], '', null);
  assert.strictEqual(t.eventDiscount, 0);
  assert.strictEqual(t.total, 960 + 60);
  const t2 = calculateTotals([{ price: 300, quantity: 4, name: '甜妹' }, { price: 60, quantity: 2, name: '果凍膠' }], '', null);
  assert.strictEqual(t2.eventDiscount, 200);
  assert.strictEqual(t2.total, 1000 + 120);
});

test('開幕活動：1 件 9 折、全館免運；果凍膠不打折', () => {
  const t = calculateTotals([{ price: 390, quantity: 1 }], '', OPENING_SALE);
  assert.deepStrictEqual([t.shippingFee, t.saleDiscount, t.total], [0, 39, 351]);
  const glue = calculateTotals([{ price: 60, quantity: 1, name: '果凍膠' }], '', OPENING_SALE);
  assert.deepStrictEqual([glue.shippingFee, glue.saleDiscount, glue.total], [0, 0, 60]);
});

test('開幕活動：任 2 件 650、任 3 件 600、4 件以上每件 200', () => {
  assert.strictEqual(calculateTotals([{ price: 450, quantity: 1 }, { price: 390, quantity: 1 }], '', OPENING_SALE).total, 650);
  assert.strictEqual(calculateTotals([{ price: 450, quantity: 3 }], '', OPENING_SALE).total, 600);
  const four = calculateTotals([{ price: 590, quantity: 2 }, { price: 300, quantity: 2 }], '', OPENING_SALE);
  assert.deepStrictEqual([four.eventDiscount, four.total], [0, 800]);
  assert.strictEqual(calculateTotals([{ price: 450, quantity: 6 }], '', OPENING_SALE).total, 1200);
});

test('開幕活動：果凍膠不算件數，照原價加上去', () => {
  const t = calculateTotals([{ price: 450, quantity: 2 }, { price: 60, quantity: 2, name: '果凍膠' }], '', OPENING_SALE);
  assert.strictEqual(t.total, 650 + 120);
});

test('開幕活動：活動價比原價貴時照原價', () => {
  const t = calculateTotals([{ price: 300, quantity: 2 }], '', OPENING_SALE);
  assert.deepStrictEqual([t.saleDiscount, t.sale, t.total], [0, null, 600]);
});

test('開幕活動期間優惠碼暫停', () => {
  const t = calculateTotals([{ price: 390, quantity: 1 }], 'NEWOPEN', OPENING_SALE);
  assert.strictEqual(t.promo, null);
  assert.strictEqual(t.total, 351);
});

test('沒指定時預設套用 OPENING_SALE', () => {
  assert.deepStrictEqual(calculateTotals([{ price: 390, quantity: 1 }]), calculateTotals([{ price: 390, quantity: 1 }], '', OPENING_SALE));
});
