// 購物車試算：前台顯示的總金額、活動折抵與優惠碼都以這裡為準（優惠碼不放在網頁程式裡，避免被看到）
const { priceCart, CartError } = require('../lib/cart');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const body = req.body || {};
    const { totals } = await priceCart(body.items, body.promoCode);
    const promoInvalid = Boolean(String(body.promoCode || '').trim()) && !totals.promo;
    res.json({ totals, promoInvalid });
  } catch (err) {
    if (err instanceof CartError) return res.status(err.status).json({ error: err.message });
    console.error('quote error', err);
    res.status(500).json({ error: '暫時無法計算金額' });
  }
};
