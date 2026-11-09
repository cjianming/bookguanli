/**
 * 封面图片服务：代理下载 + 本地磁盘缓存
 * 豆瓣图片 CDN 有防盗链（需 Referer），客户端直接加载会失败，
 * 因此由服务端代为下载并缓存到 data/covers/，客户端统一走 /api/cover/:isbn。
 * 豆瓣失败时回退 Open Library 封面源。
 */

const fs = require('fs');
const path = require('path');

const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const COVER_DIR = path.join(__dirname, '..', '..', 'data', 'covers');
const TIMEOUT_MS = 6000;

function cachePath(isbn, ext) {
  return path.join(COVER_DIR, `${isbn}.${ext}`);
}

function findCache(isbn) {
  for (const ext of ['jpg', 'png']) {
    const f = cachePath(isbn, ext);
    if (fs.existsSync(f)) return { file: f, ext };
  }
  return null;
}

async function downloadImage(url, referer) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers = { 'User-Agent': UA_BROWSER };
    if (referer) headers.Referer = referer;
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) return null;
    // 防盗链站点可能返回 HTML 反爬页，必须是图片才接受
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (!type.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) return null; // 过小视为占位图/错误页
    return { buf, ext: type.includes('png') ? 'png' : 'jpg' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 从豆瓣图书页重新提取 og:image（入库时封面字段可能为空）
async function doubanCoverFromPage(isbn) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://book.douban.com/isbn/${isbn}/`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA_BROWSER, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const og = html.match(/<meta\s+property="og:image"\s+content="(https:\/\/img\d\.doubanio\.com[^"]+)"/);
    return og ? og[1].replace('/sqxs/', '/l/').replace('/s/', '/l/') : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取封面：本地缓存 → 数据库记录的原始 URL（带 Referer）
 *          → 豆瓣页面重新提取 → Open Library
 * 返回 { file, ext } 或 null
 */
async function getCover(isbn, remoteUrl) {
  const cached = findCache(isbn);
  if (cached) return cached;

  fs.mkdirSync(COVER_DIR, { recursive: true });

  const attempts = [];
  if (remoteUrl) attempts.push({ url: remoteUrl, referer: 'https://book.douban.com/' });
  const pageCover = await doubanCoverFromPage(isbn);
  if (pageCover && pageCover !== remoteUrl) {
    attempts.push({ url: pageCover, referer: 'https://book.douban.com/' });
  }
  attempts.push({ url: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`, referer: undefined });

  for (const a of attempts) {
    const r = await downloadImage(a.url, a.referer);
    if (r) {
      const f = cachePath(isbn, r.ext);
      fs.writeFileSync(f, r.buf);
      return { file: f, ext: r.ext };
    }
  }
  return null;
}

module.exports = { getCover };
