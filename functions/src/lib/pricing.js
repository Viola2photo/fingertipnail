// 訂單金額計算。shop.html 用同一套規則顯示金額，但實際收款一律以伺服器這裡算的為準，
// 避免有人改瀏覽器裡的金額。修改活動、運費或優惠碼時，請同步修改 shop.html 的同名常數。
const SHIPPING_FEE = 60;
const FREE_SHIPPING_THRESHOLD = 1000;
const BUNDLE_SIZE = 4;
const BUNDLE_PRICE = 1000;
// 名稱含這個字的加購品（果凍膠）不算進「任 4 件」，與前台 config.js 的 SITE.glueKeyword 相同
const ADDON_KEYWORD = '果凍膠';
const isAddon = (line) => String(line.name || '').includes(ADDON_KEYWORD);

// 開幕活動：全館免運＋件數優惠（取代任 4 件 1000）。果凍膠不打折、不算件數。
// 1 件 9 折、任選 2 件 650、任選 3 件 600、4 件以上每件 200。活動期間優惠碼暫停。
// 活動結束把 enabled 改成 false，並同步修改前台 config.js 的 SITE.openingSale 與公告。
const OPENING_SALE = { enabled: true, singleRate: 0.9, setPrices: { 2: 650, 3: 600 }, perItemFrom: 4, perItemPrice: 200, freeShipping: true, allowPromoCodes: false };

// 開幕活動的商品價（不含果凍膠）與折扣名稱
function openingSalePrice(unitPrices, sale) {
  const n = unitPrices.length;
  const sum = unitPrices.reduce((a, b) => a + b, 0);
  if (n === 0) return { price: 0, name: '' };
  if (n === 1) return { price: Math.round(sum * sale.singleRate), name: `開幕單件 ${Math.round(sale.singleRate * 10)} 折` };
  if (sale.setPrices[n]) return { price: sale.setPrices[n], name: `開幕任選 ${n} 件 ${sale.setPrices[n]} 元` };
  if (n >= sale.perItemFrom) return { price: n * sale.perItemPrice, name: `開幕 ${sale.perItemFrom} 件以上每件 ${sale.perItemPrice} 元` };
  return { price: sum, name: '' };
}

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

  const saleOn = Boolean(sale && sale.enabled);

  // 任 4 件 1000：拿最貴的件數組成組合（開幕活動期間改用活動價，不另外算）
  const bundleCount = saleOn ? 0 : Math.floor(unitPrices.length / BUNDLE_SIZE);
  let eventDiscount = 0;
  if (bundleCount > 0) {
    const bundled = unitPrices.slice(0, bundleCount * BUNDLE_SIZE).reduce((a, b) => a + b, 0);
    eventDiscount = Math.max(0, bundled - bundleCount * BUNDLE_PRICE);
  }
  const eventFreeShipping = bundleCount > 0;

  const shippingFee = (subtotal === 0 || eventFreeShipping || subtotal >= FREE_SHIPPING_THRESHOLD || (saleOn && sale.freeShipping)) ? 0 : SHIPPING_FEE;

  const afterBundle = subtotal - eventDiscount;
  let saleDiscount = 0;
  let sale_ = null;
  if (saleOn) {
    const { price, name } = openingSalePrice(unitPrices, sale);
    // 活動價比原價貴時（例如 2 件都 300 元）照原價，不會多收
    saleDiscount = Math.max(0, unitPrices.reduce((a, b) => a + b, 0) - price);
    if (saleDiscount > 0) sale_ = { name };
  }

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
