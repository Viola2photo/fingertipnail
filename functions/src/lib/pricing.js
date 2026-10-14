// 訂單金額計算。shop.html 用同一套規則顯示金額，但實際收款一律以伺服器這裡算的為準，
// 避免有人改瀏覽器裡的金額。修改活動、運費或優惠碼時，請同步修改 shop.html 的同名常數。
const SHIPPING_FEE = 60;
const FREE_SHIPPING_THRESHOLD = 1000;
const BUNDLE_SIZE = 4;
const BUNDLE_PRICE = 1000;
// 名稱含這個字的加購品（果凍膠）不算進「任 4 件」，與前台 config.js 的 SITE.glueKeyword 相同
const ADDON_KEYWORD = '果凍膠';
const isAddon = (line) => String(line.name || '').includes(ADDON_KEYWORD);

const PROMO_CODES = {
  VIP9: { type: 'percent', value: 0.9, name: 'VIP 專屬 9 折' },
  SAVE100: { type: 'minus', value: 100, name: '滿額現折 100 元' },
  NEWOPEN: { type: 'percent', value: 0.85, name: '歡慶開幕 85 折' },
};

// lines: [{ price, quantity, name? }]
function calculateTotals(lines, promoCode) {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const unitPrices = [];
  lines.filter((l) => !isAddon(l)).forEach((l) => { for (let i = 0; i < l.quantity; i++) unitPrices.push(l.price); });
  unitPrices.sort((a, b) => b - a);

  // 任 4 件 1000：拿最貴的件數組成組合
  const bundleCount = Math.floor(unitPrices.length / BUNDLE_SIZE);
  let eventDiscount = 0;
  if (bundleCount > 0) {
    const bundled = unitPrices.slice(0, bundleCount * BUNDLE_SIZE).reduce((a, b) => a + b, 0);
    eventDiscount = Math.max(0, bundled - bundleCount * BUNDLE_PRICE);
  }
  const eventFreeShipping = bundleCount > 0;

  const shippingFee = (subtotal === 0 || eventFreeShipping || subtotal >= FREE_SHIPPING_THRESHOLD) ? 0 : SHIPPING_FEE;

  const code = String(promoCode || '').toUpperCase().trim();
  const promo = PROMO_CODES[code] ? { ...PROMO_CODES[code], code } : null;
  const afterEvent = subtotal - eventDiscount;
  let promoDiscount = 0;
  if (promo && afterEvent > 0) {
    promoDiscount = promo.type === 'percent' ? Math.round(afterEvent * (1 - promo.value)) : promo.value;
  }
  if (afterEvent - promoDiscount < 0) promoDiscount = afterEvent;

  const total = subtotal - eventDiscount - promoDiscount + shippingFee;
  return { subtotal, eventDiscount, promo, promoDiscount, shippingFee, total };
}

module.exports = { ADDON_KEYWORD, SHIPPING_FEE, FREE_SHIPPING_THRESHOLD, PROMO_CODES, calculateTotals };
