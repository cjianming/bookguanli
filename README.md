# 图书馆管理系统

- **电脑端（服务）**：Node.js + Express + SQLite，负责数据存储，并提供互联网 ISBN 图书信息查询（信息来自 Google Books / Open Library，可配置国内数据源）
- **手机端**：
  - `android/` — Kotlin + Compose + CameraX + ML Kit（扫描书背 EAN-13 条形码与二维码）
  - `harmony/` — ArkTS + 华为 Scan Kit（同上）
- 手机与电脑需处于**同一局域网**，手机通过 `http://电脑IP:3000` 访问服务。

## 一、启动电脑端服务

```powershell
cd server
npm install
npm start
```

启动后控制台会打印局域网访问地址（例如 `http://192.168.1.5:3000`），手机端填这个地址即可。
若手机无法访问，需在 Windows 防火墙放行 3000 端口：

```powershell
netsh advfirewall firewall add rule name="LibraryServer3000" dir=in action=allow protocol=TCP localport=3000
```

### API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/books?keyword=` | 馆藏列表 / 搜索 |
| GET | `/api/books/:id` | 图书详情 |
| GET | `/api/lookup/:isbn` | 从互联网查询图书信息（不入库） |
| POST | `/api/books` | 扫码加入 `{isbn, copies?, location?}`，自动联网抓取信息 |
| PUT | `/api/books/:id` | 修改馆藏数 / 存放位置 |
| DELETE | `/api/books/:id` | 删除图书 |
| POST | `/api/books/:id/borrow` | 借出 `{borrower}` |
| POST | `/api/books/:id/return` | 归还 |
| GET | `/api/books/:id/loans` | 借阅记录 |
| GET | `/api/stats` | 统计 |

### 可选：配置国内图书数据源

国内书籍的中文信息在 Google Books / Open Library 覆盖不全，可设置环境变量接入任意返回 JSON 的 ISBN 接口：

```powershell
$env:BOOK_API_URL = "https://你的接口?isbn={isbn}"   # {isbn} 为占位符
npm start
```

要求接口返回：`{ "title", "author", "publisher", "pubdate", "cover_url", "description" }`（存在 title 即生效，且优先级最高）。

## 二、Android 端

1. 用 Android Studio 打开 `android/` 目录，等待 Gradle 同步。
2. 运行到真机（需要摄像头）。
3. 首页右上角 ⚙ 设置服务器地址为 `http://电脑IP:3000`。
4. 点「＋ 扫码加入」→ 对准书背面的 ISBN 条形码或书籍二维码 → 自动联网查书并加入馆藏。
5. 点书目卡片可查看详情、借出（填写借阅人）、归还、编辑馆藏数/位置、删除、查看借阅记录。

> 说明：Manifest 已开启 `usesCleartextTraffic` 以允许局域网 HTTP 访问。

## 三、HarmonyOS 端

1. 用 DevEco Studio（API 12+）打开 `harmony/` 目录。
2. 运行到真机。扫码使用华为 Scan Kit（真机含 HMS Core 即可，模拟器可能不支持）。
3. 首页点「设置服务器」填 `http://电脑IP:3000`。
4. 点「＋ 扫码加入」→ 扫码 → 自动联网查书并加入馆藏；点书目进入详情可借出/归还/删除。

> 图标为 1×1 占位图，可在 `AppScope/resources/base/media/app_icon.png` 与
> `entry/src/main/resources/base/media/icon.png` 替换为正式图标。

## 四、数据文件

数据库文件为 `server/library.db`（SQLite），删除即清空数据。

## 目录结构

```
bookguanli/
├── server/            # 电脑端服务（Node.js + SQLite）
│   └── src/
│       ├── index.js       # 入口：Express 服务，打印局域网地址
│       ├── db.js          # SQLite 建表
│       ├── routes/books.js# 图书 CRUD / 借还 / 统计
│       └── services/isbn.js# 互联网 ISBN 查询（自定义源→Google→OpenLibrary）
├── android/           # Android 客户端（Kotlin + Compose + CameraX + ML Kit）
└── harmony/           # HarmonyOS 客户端（ArkTS + Scan Kit）
```
