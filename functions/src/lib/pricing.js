// 訂單金額計算。shop.html 用同一套規則顯示金額，但實際收款一律以伺服器這裡算的為準，
// 避免有人改瀏覽器裡的金額。修改活動、運費或優惠碼時，請同步修改 shop.html 的同名常數。
const SHIPPING_FEE = 60;
const FREE_SHIPPING_THRESHOLD = 1000;
const BUNDLE_SIZE = 4;
const BUNDLE_PRICE = 1000;
// 名稱含這個字的加購品（果凍膠）不算進「任 4 件」，與前台 config.js 的 SITE.glueKeyword 相同
const ADDON_KEYWORD = '果凍膠';
const isAddon = (line) => String(line.name || '').includes(ADDON_KEYWORD);

// 開幕活動：全館免運＋全面折扣（在任 4 件之後再打折）。活動結束把 enabled 改成 false，
// 並同步修改前台 config.js 的 SITE.openingSale。活動期間優惠碼暫停，避免折太多。
const OPENING_SALE = { enabled: true, rate: 0.9, name: '開幕全面 9 折', freeShipping: true, allowPromoCodes: false };

const PROMO_CODES = {
  VIP9: { type: 'percent', value: 0.9, name: 'VIP 專屬 9 折' },
  SAVE100: { type: 'minus', value: 100, name: '滿額現折 100 元' },
  NEWOPEN: { type: 'percent', value: 0.85, name: '歡慶開幕 85 折' },
};

// lines: [{ price, quantity, name? }]
function calculateTotals(lines, promoCode, sale = OPENING_SALE) {
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

  const saleOn = Boolean(sale && sale.enabled);
  const shippingFee = (subtotal === 0 || eventFreeShipping || subtotal >= FREE_SHIPPING_THRESHOLD || (saleOn && sale.freeShipping)) ? 0 : SHIPPING_FEE;

  const afterBundle = subtotal - eventDiscount;
  const saleDiscount = saleOn && afterBundle > 0 ? Math.round(afterBundle * (1 - sale.rate)) : 0;
  const sale_ = saleOn ? { name: sale.name, rate: sale.rate } : null;

  const code = String(promoCode || '').toUpperCase().trim();
  const promoAllowed = !saleOn || sale.allowPromoCodes;
  const promo = promoAllowed && PROMO_CODES[code] ? { ...PROMO_CODES[code], code } : null;
  const afterEvent = afterBundle - saleDiscount;
  let promoDiscount = 0;
  if (promo && afterEvent > 0) {
    promoDiscount = promo.type === 'percent' ? Math.round(afterEvent * (1 - promo.value)) : promo.value;
  }
  if (afterEvent - promoDiscount < 0) promoDiscount = afterEvent;

  const total = subtotal - eventDiscount - saleDiscount - promoDiscount + shippingFee;
  return { subtotal, eventDiscount, sale: sale_, saleDiscount, promo, promoDiscount, shippingFee, total };
}

module.exports = { ADDON_KEYWORD, SHIPPING_FEE, FREE_SHIPPING_THRESHOLD, OPENING_SALE, PROMO_CODES, calculateTotals };
