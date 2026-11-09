/**
 * ISBN 图书信息查询（信息来自互联网）
 * 策略：所有数据源并行竞速（谁先返回有效结果用谁），单源限时 5 秒，
 * 保证整体响应时间远小于手机端 10 秒超时。
 *
 * 数据源：
 *  1. 自定义 API（环境变量 BOOK_API_URL，占位符 {isbn}）
 *  2. 豆瓣（国内直连，解析图书页 HTML）
 *  3. Google Books（国外）
 *  4. Open Library（国外）
 */

const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const SOURCE_TIMEOUT_MS = 5000;

function normalizeIsbn(raw) {
  const isbn = String(raw || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (isbn.length === 13 && /^97[89]/.test(isbn)) return isbn;
  if (isbn.length === 10) return isbn;
  return null;
}

async function fetchWithTimeout(url, timeoutMs, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA_BROWSER,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        ...headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, headers) {
  const res = await fetchWithTimeout(url, SOURCE_TIMEOUT_MS, headers);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function pickCover(cover) {
  return cover.large || cover.medium || cover.small || cover.thumbnail || '';
}

/* ---------------- 自定义数据源 ---------------- */

async function fromCustom(isbn) {
  const base = process.env.BOOK_API_URL;
  if (!base) return null;
  try {
    const d = await fetchJson(base.replace('{isbn}', encodeURIComponent(isbn)), {
      Accept: 'application/json',
    });
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

/* ---------------- 豆瓣（国内直连） ---------------- */

function parseDoubanInfo(html) {
  const info = {};

  // 标题：取 h1 或 <title>（去掉 " (豆瓣)" 后缀）
  const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/);
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/);
  const rawTitle = h1 ? h1[1] : titleTag ? titleTag[1] : '';
  info.title = stripTags(rawTitle)
    .replace(/\s*\((豆瓣|douban)\)\s*$/i, '')
    .trim();
  if (!info.title) return null;

  // info 区块
  const infoBlock = html.match(/<div\s+id="info"[^>]*>([\s\S]*?)<\/div>/);
  if (infoBlock) {
    const block = infoBlock[1];
    const field = (name) => {
      const re = new RegExp(`<span\\s+class="pl">\\s*${name}<\\/span>[\\s\\S]*?(?=<span\\s+class="pl">|<br|$)`);
      const m = block.match(re);
      return m ? m[0] : '';
    };
    const authorSeg = field('作者');
    const authors = [...authorSeg.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((m) => m[1].trim());
    if (authors.length) info.author = authors.join(', ');

    const pubSeg = field('出版社');
    const pubLink = pubSeg.match(/<a[^>]*>([^<]+)<\/a>/);
    info.publisher = stripTags(pubLink ? pubLink[1] : pubSeg.replace(/^[\s\S]*?出版社:<\/span>/, ''));

    const dateSeg = field('出版年');
    const dateMatch = dateSeg.match(/出版年:<\/span>\s*([^\s<]+)/);
    if (dateMatch) info.pubdate = dateMatch[1].trim();
  }

  // 封面：优先 og:image 大图，其次正文 <img>
  const og = html.match(/<meta\s+property="og:image"\s+content="(https:\/\/img\d\.doubanio\.com[^"]+)"/);
  const cover = html.match(/<img[^>]+src="(https:\/\/img\d\.doubanio\.com\/view\/subject\/[^"]+)"/);
  if (og) {
    info.cover_url = og[1].replace('/sqxs/', '/l/').replace('/s/', '/l/');
  } else if (cover) {
    info.cover_url = cover[1].replace('/s/', '/l/').replace(/sq[sx]_\d+_\d+/, '');
  }

  // 简介（取第一个 intro 区块内的段落）
  const intro = html.match(/<div[^>]+class="intro"[\s\S]*?<div[^>]+class="intro"([\s\S]*?)<\/div>/) ||
    html.match(/<div[^>]+class="intro"([\s\S]*?)<\/div>/);
  if (intro) {
    const paras = [...intro[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => stripTags(m[1]));
    info.description = paras.filter(Boolean).join('\n').slice(0, 2000);
  }

  return info;
}

async function fromDouban(isbn) {
  try {
    // /isbn/{isbn}/ 会 302 到图书详情页
    const res = await fetchWithTimeout(
      `https://book.douban.com/isbn/${isbn}/`,
      SOURCE_TIMEOUT_MS,
      { Accept: 'text/html,application/xhtml+xml' }
    );
    if (!res.ok) return null;
    const html = await res.text();
    if (!html || html.length < 500) return null;
    const parsed = parseDoubanInfo(html);
    if (!parsed || !parsed.title) return null;
    return { isbn, author: '', publisher: '', pubdate: '', cover_url: '', description: '', ...parsed };
  } catch {
    return null;
  }
}

/* ---------------- Google Books ---------------- */

async function fromGoogleBooks(isbn) {
  try {
    const d = await fetchJson(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`,
      { Accept: 'application/json' }
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

/* ---------------- Open Library ---------------- */

async function fromOpenLibrary(isbn) {
  try {
    const d = await fetchJson(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
      { Accept: 'application/json' }
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

/* ---------------- 并行竞速 ---------------- */

async function lookupBookInfo(rawIsbn) {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isbn) {
    const err = new Error('无效的 ISBN（需为 10 位或 13 位数字）');
    err.status = 400;
    throw err;
  }

  const tasks = [fromCustom(isbn), fromDouban(isbn), fromGoogleBooks(isbn), fromOpenLibrary(isbn)]
    .filter(Boolean)
    .map((p) =>
      p.then((r) => {
        if (!r || !r.title) throw new Error('empty');
        return r;
      })
    );

  try {
    return await Promise.any(tasks);
  } catch {
    const err = new Error('互联网上未找到该书的信息，可手动录入');
    err.status = 404;
    throw err;
  }
}

module.exports = { normalizeIsbn, lookupBookInfo };
