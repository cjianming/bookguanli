/**
 * ISBN 图书信息查询（信息来自互联网）
 * 查询顺序：
 *  1. 自定义 API（环境变量 BOOK_API_URL，适合国内数据源，占位符 {isbn}）
 *  2. Google Books
 *  3. Open Library
 */

const UA = 'library-system/1.0';

function normalizeIsbn(raw) {
  const isbn = String(raw || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (isbn.length === 13 && /^97[89]/.test(isbn)) return isbn;
  if (isbn.length === 10) return isbn;
  return null;
}

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function pickCover(cover) {
  return cover.large || cover.medium || cover.small || cover.thumbnail || '';
}

async function fromCustom(isbn) {
  const base = process.env.BOOK_API_URL;
  if (!base) return null;
  try {
    const d = await fetchJson(base.replace('{isbn}', encodeURIComponent(isbn)));
    if (!d || !d.title) return null;
    return {
      isbn,
      title: String(d.title),
      author: d.author || d.authors || '',
      publisher: d.publisher || '',
      pubdate: d.pubdate || d.publishedDate || '',
      cover_url: d.cover_url || d.cover || d.image || '',
      description: d.description || d.summary || '',
    };
  } catch {
    return null;
  }
}

async function fromGoogleBooks(isbn) {
  try {
    const d = await fetchJson(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`
    );
    const item = d.items && d.items[0];
    if (!item) return null;
    const v = item.volumeInfo || {};
    return {
      isbn,
      title: v.title || '',
      author: Array.isArray(v.authors) ? v.authors.join(', ') : '',
      publisher: v.publisher || '',
      pubdate: v.publishedDate || '',
      cover_url: v.imageLinks ? pickCover(v.imageLinks).replace('http://', 'https://') : '',
      description: v.description || '',
    };
  } catch {
    return null;
  }
}

async function fromOpenLibrary(isbn) {
  try {
    const d = await fetchJson(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
    );
    const b = d[`ISBN:${isbn}`];
    if (!b) return null;
    return {
      isbn,
      title: b.title || '',
      author: Array.isArray(b.authors) ? b.authors.map((a) => a.name).join(', ') : '',
      publisher: Array.isArray(b.publishers) ? b.publishers.map((p) => p.name).join(', ') : '',
      pubdate: b.publish_date || '',
      cover_url: b.cover ? pickCover(b.cover) : '',
      description:
        typeof b.excerpts === 'string'
          ? b.excerpts
          : b.notes
            ? String(b.notes).replace(/<[^>]+>/g, '')
            : '',
    };
  } catch {
    return null;
  }
}

async function lookupBookInfo(rawIsbn) {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isbn) {
    const err = new Error('无效的 ISBN（需为 10 位或 13 位数字）');
    err.status = 400;
    throw err;
  }
  for (const provider of [fromCustom, fromGoogleBooks, fromOpenLibrary]) {
    const info = await provider(isbn);
    if (info && info.title) return info;
  }
  const err = new Error('互联网上未找到该书的信息，可手动录入');
  err.status = 404;
  throw err;
}

module.exports = { normalizeIsbn, lookupBookInfo };
