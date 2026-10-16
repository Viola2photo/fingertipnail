// 後台「網站文字」可以改的欄位。後台存到 Firestore 的 settings/siteText；欄位空白就用這裡的預設文字。
// 新增欄位：在這裡加一筆，再到 app.js 用 text.欄位名 顯示。
import { SITE } from './config.js';
import { GLUE_PAGE } from './pages.js';

export const SITE_TEXT_FIELDS = [
  { key: 'announcement', group: '頁首', label: '頂部公告列', default: SITE.announcement },
  { key: 'heroScript', group: '首頁', label: '大標題上方的英文小字', default: 'Once upon a fingertip' },
  { key: 'heroTitle', group: '首頁', label: '大標題（按 Enter 換行）', default: '今天，\n想當哪一位公主？', multiline: true },
  { key: 'heroText', group: '首頁', label: '大標題下方介紹', default: '3 分鐘貼上、隨時卸下。不用預約、不傷真甲，千金、甜妹、清冷仙氣，一週換一種心情也沒有壓力。', multiline: true },
  { key: 'sizeTitle', group: '首頁', label: '尺寸區塊標題', default: '不知道自己的尺寸？' },
  { key: 'sizeText', group: '首頁', label: '尺寸區塊說明', default: '最多人選 S，大約 7～8 成的人都適合。右邊是 S 每根手指的寬度，用軟尺或紙條量指甲最寬處，差不多就選 S；偏大或偏小再看完整尺寸表。', multiline: true },
  { key: 'glueOfferTitle', group: '果凍膠加購提醒（款式頁、結帳頁）', label: '標題', default: GLUE_PAGE.offerTitle },
  { key: 'glueOfferText', group: '果凍膠加購提醒（款式頁、結帳頁）', label: '說明', default: GLUE_PAGE.offerText, multiline: true },
];

export const DEFAULT_SITE_TEXT = Object.fromEntries(SITE_TEXT_FIELDS.map((f) => [f.key, f.default]));

// 只採用有填字的欄位，其餘用預設
export function mergeSiteText(saved) {
  const out = { ...DEFAULT_SITE_TEXT };
  for (const f of SITE_TEXT_FIELDS) {
    const v = saved?.[f.key];
    if (typeof v === 'string' && v.trim()) out[f.key] = v.trim();
  }
  return out;
}
