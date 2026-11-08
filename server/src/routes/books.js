const express = require('express');
const db = require('../db');
const { normalizeIsbn, lookupBookInfo } = require('../services/isbn');

const router = express.Router();

const bookCols = [
  'id', 'isbn', 'title', 'author', 'publisher', 'pubdate',
  'cover_url', 'description', 'copies', 'available', 'location',
  'created_at', 'updated_at',
];

function getBook(id) {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
  if (!book) {
    const err = new Error('图书不存在');
    err.status = 404;
    throw err;
  }
  return book;
}

// 关键词搜索（书名 / 作者 / ISBN / 出版社）
router.get('/books', (req, res, next) => {
  const kw = String(req.query.keyword || '').trim();
  let rows;
  if (kw) {
    const like = `%${kw}%`;
    rows = db
      .prepare(
        `SELECT * FROM books
         WHERE title LIKE ? OR author LIKE ? OR isbn LIKE ? OR publisher LIKE ?
         ORDER BY id DESC`
      )
      .all(like, like, like, like);
  } else {
    rows = db.prepare('SELECT * FROM books ORDER BY id DESC').all();
  }
  res.json(rows);
});

// 先查询互联网信息（不入库），用于扫码后预览
router.get('/lookup/:isbn', async (req, res, next) => {
  try {
    res.json(await lookupBookInfo(req.params.isbn));
  } catch (e) {
    next(e);
  }
});

// 扫码加入：传 isbn，自动从互联网抓取信息入库
router.post('/books', async (req, res, next) => {
  try {
    const { isbn, title, copies = 1, location = '' } = req.body || {};
    const norm = normalizeIsbn(isbn);
    if (!norm) return res.status(400).json({ error: '无效的 ISBN' });

    const exists = db.prepare('SELECT id FROM books WHERE isbn = ?').get(norm);
    if (exists) return res.status(409).json({ error: '该书已在馆藏中', bookId: exists.id });

    let info;
    if (title) {
      // 手动录入：以客户端提供的信息为准
      info = { isbn: norm, title, author: req.body.author || '', publisher: req.body.publisher || '',
               pubdate: req.body.pubdate || '', cover_url: req.body.cover_url || '',
               description: req.body.description || '' };
    } else {
      info = await lookupBookInfo(norm); // 信息来自互联网
    }

    const n = Math.max(1, parseInt(copies, 10) || 1);
    const r = db
      .prepare(
        `INSERT INTO books (isbn, title, author, publisher, pubdate, cover_url, description, copies, available, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(norm, info.title, info.author || '', info.publisher || '', info.pubdate || '',
           info.cover_url || '', info.description || '', n, n, String(location));
    res.status(201).json(getBook(r.lastInsertRowid));
  } catch (e) {
    next(e);
  }
});

router.get('/books/:id', (req, res) => {
  res.json(getBook(req.params.id));
});

// 修改馆藏数 / 存放位置等
router.put('/books/:id', (req, res) => {
  const book = getBook(req.params.id);
  const b = req.body || {};
  const copies = b.copies != null ? Math.max(1, parseInt(b.copies, 10) || book.copies) : book.copies;
  const location = b.location != null ? String(b.location) : book.location;
  const borrowed = book.copies - book.available; // 当前借出数
  if (copies < borrowed) {
    return res.status(400).json({ error: `馆藏数不能小于当前借出数（${borrowed}）` });
  }
  db.prepare(
    `UPDATE books SET copies = ?, available = ?, location = ?,
     updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).run(copies, copies - borrowed, location, book.id);
  res.json(getBook(book.id));
});

router.delete('/books/:id', (req, res) => {
  getBook(req.params.id);
  db.prepare('DELETE FROM loans WHERE book_id = ? AND returned_at IS NULL').run(req.params.id);
  db.prepare('DELETE FROM books WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 借出
router.post('/books/:id/borrow', (req, res) => {
  const book = getBook(req.params.id);
  const borrower = String((req.body || {}).borrower || '').trim();
  if (!borrower) return res.status(400).json({ error: '请填写借阅人姓名' });
  if (book.available <= 0) return res.status(400).json({ error: '该书已全部借出' });

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO loans (book_id, borrower) VALUES (?, ?)'
    ).run(book.id, borrower);
    db.prepare(
      `UPDATE books SET available = available - 1,
       updated_at = datetime('now', 'localtime') WHERE id = ?`
    ).run(book.id);
  });
  tx();
  res.json(getBook(book.id));
});

// 归还
router.post('/books/:id/return', (req, res) => {
  const book = getBook(req.params.id);
  if (book.available >= book.copies) {
    return res.status(400).json({ error: '该书没有未归还的借阅记录' });
  }
  const loan = db
    .prepare('SELECT * FROM loans WHERE book_id = ? AND returned_at IS NULL ORDER BY id LIMIT 1')
    .get(book.id);
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE loans SET returned_at = datetime('now', 'localtime') WHERE id = ?`
    ).run(loan.id);
    db.prepare(
      `UPDATE books SET available = available + 1,
       updated_at = datetime('now', 'localtime') WHERE id = ?`
    ).run(book.id);
  });
  tx();
  res.json(getBook(book.id));
});

// 借阅记录
router.get('/books/:id/loans', (req, res) => {
  getBook(req.params.id);
  res.json(
    db.prepare('SELECT * FROM loans WHERE book_id = ? ORDER BY id DESC').all(req.params.id)
  );
});

// 统计
router.get('/stats', (_req, res) => {
  const s = db
    .prepare(
      `SELECT COUNT(*) AS titles, SUM(copies) AS copies, SUM(available) AS available
       FROM books`
    )
    .get();
  s.borrowed = (s.copies || 0) - (s.available || 0);
  res.json(s);
});

module.exports = router;
