// 購物車檢查與金額計算：一律以資料庫的價格與庫存為準，不採用瀏覽器傳來的金額
const { inventoryRef } = require('./firebase');
const { calculateTotals } = require('./pricing');

const SIZES = ['XS', 'S', 'M', 'L'];
const MAX_QTY_PER_LINE = 20;

class CartError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}

// items: [{ id, size, quantity }] → { lines, totals }
async function priceCart(items, promoCode) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) throw new CartError('購物車是空的', 400);
  const lines = [];
  for (const raw of items) {
    const id = String(raw.id || '');
    const size = String(raw.size || '');
    const quantity = Math.floor(Number(raw.quantity));
    if (!id || !SIZES.includes(size) || !(quantity >= 1 && quantity <= MAX_QTY_PER_LINE)) throw new CartError('購物車內容有誤', 400);
    const snap = await inventoryRef().doc(id).get();
    if (!snap.exists) throw new CartError('有商品已下架，請重新整理');
    const product = snap.data();
    if (product.status === 'N') throw new CartError(`「${product.name}」已下架`);
    const inStock = Number(product.stock?.[size] || 0);
    const already = lines.filter((l) => l.id === id && l.size === size).reduce((s, l) => s + l.quantity, 0);
    if (inStock < already + quantity) throw new CartError(`「${product.name}」${size} 庫存只剩 ${inStock} 件`);
    lines.push({
      id, size, quantity, name: product.name, price: Number(product.price) || 0,
      shape: product.shape || '', image: product.media?.find((m) => m.type !== 'video')?.url || '',
    });
  }
  const totals = calculateTotals(lines, promoCode);
  if (!(totals.total > 0)) throw new CartError('訂單金額有誤', 400);
  return { lines, totals };
}

module.exports = { SIZES, CartError, priceCart };
