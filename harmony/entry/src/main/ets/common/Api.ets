import { http } from '@kit.NetworkKit';

export interface Book {
  id: number;
  isbn: string;
  title: string;
  author?: string;
  publisher?: string;
  pubdate?: string;
  cover_url?: string;
  description?: string;
  copies: number;
  available: number;
  location?: string;
}

export interface LoanRecord {
  id: number;
  borrower: string;
  borrowed_at: string;
  returned_at?: string;
}

export interface Stats {
  titles: number;
  copies: number;
  available: number;
  borrowed: number;
}

/** 电脑端服务访问封装（局域网 REST API） */
export class ApiClient {
  /** 修改为电脑在局域网中的 IP，例如 http://192.168.1.100:3000 */
  static baseUrl: string = 'http://192.168.1.100:3000';

  static setBaseUrl(url: string): boolean {
    const u = url.trim();
    if (u.startsWith('http://') || u.startsWith('https://')) {
      this.baseUrl = u.endsWith('/') ? u.substring(0, u.length - 1) : u;
      return true;
    }
    return false;
  }

  private static async request<T>(path: string, method: http.RequestMethod,
    body?: object): Promise<T> {
    const req = http.createHttp();
    try {
      const resp = await req.request(this.baseUrl + path, {
        method: method,
        header: { 'Content-Type': 'application/json' },
        extraData: body ? JSON.stringify(body) : undefined,
        expectDataType: http.HttpDataType.STRING,
        connectTimeout: 8000,
        readTimeout: 20000
      });
      const text = resp.result as string;
      if (resp.responseCode >= 400) {
        let msg = `HTTP ${resp.responseCode}`;
        try {
          msg = JSON.parse(text).error ?? msg;
        } catch (_e) {
        }
        throw new Error(msg);
      }
      return JSON.parse(text) as T;
    } finally {
      req.destroy();
    }
  }

  static books(keyword?: string): Promise<Book[]> {
    const q = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
    return this.request<Book[]>('/api/books' + q, http.RequestMethod.GET);
  }

  static book(id: number): Promise<Book> {
    return this.request<Book>(`/api/books/${id}`, http.RequestMethod.GET);
  }

  /** 从互联网查询图书信息（不入库） */
  static lookup(isbn: string): Promise<Book> {
    return this.request<Book>(`/api/lookup/${encodeURIComponent(isbn)}`, http.RequestMethod.GET);
  }

  /** 扫码加入馆藏 */
  static add(isbn: string): Promise<Book> {
    return this.request<Book>('/api/books', http.RequestMethod.POST, { isbn: isbn });
  }

  static update(id: number, copies: number, location: string): Promise<Book> {
    return this.request<Book>(`/api/books/${id}`, http.RequestMethod.PUT,
      { copies: copies, location: location });
  }

  static remove(id: number): Promise<object> {
    return this.request<object>(`/api/books/${id}`, http.RequestMethod.DELETE);
  }

  static borrow(id: number, borrower: string): Promise<Book> {
    return this.request<Book>(`/api/books/${id}/borrow`, http.RequestMethod.POST,
      { borrower: borrower });
  }

  static returnBook(id: number): Promise<Book> {
    return this.request<Book>(`/api/books/${id}/return`, http.RequestMethod.POST);
  }

  static loans(id: number): Promise<LoanRecord[]> {
    return this.request<LoanRecord[]>(`/api/books/${id}/loans`, http.RequestMethod.GET);
  }
}
