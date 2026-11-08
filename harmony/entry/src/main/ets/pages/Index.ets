import { promptAction, router } from '@kit.ArkUI';
import { scanBarcode, scanCore } from '@kit.ScanKit';
import { Book, ApiClient } from '../common/Api';

@Entry
@Component
struct Index {
  @State books: Book[] = [];
  @State keyword: string = '';
  @State busy: boolean = false;
  @State showSettings: boolean = false;
  @State serverUrl: string = ApiClient.baseUrl;

  aboutToAppear(): void {
    this.loadBooks();
  }

  loadBooks(): void {
    this.busy = true;
    ApiClient.books(this.keyword.length > 0 ? this.keyword : undefined)
      .then((list: Book[]) => {
        this.books = list;
      })
      .catch((e: Error) => {
        promptAction.showToast({ message: `加载失败: ${e.message}` });
      })
      .finally(() => {
        this.busy = false;
      });
  }

  /** 启动扫码（华为 Scan Kit），支持书背 EAN-13 条形码与二维码 */
  startScan(): void {
    const options: scanBarcode.ScanOptions = {
      scanTypes: [scanCore.ScanType.EAN_13_CODE, scanCore.ScanType.QR_CODE],
      enableMultiMode: false,
      enableAlbum: true
    };
    scanBarcode.startScanForResult(getContext(this), options)
      .then((result: scanBarcode.ScanResult) => {
        if (result.originalValue && result.originalValue.length > 0) {
          this.addByCode(result.originalValue);
        }
      })
      .catch((e: Error) => {
        // 用户取消扫码时静默
        if (!e.message.includes('cancel')) {
          promptAction.showToast({ message: `扫码失败: ${e.message}` });
        }
      });
  }

  /** 扫码结果 -> 互联网查询 -> 加入馆藏 */
  addByCode(raw: string): void {
    this.busy = true;
    ApiClient.lookup(raw)
      .then((info: Book) => ApiClient.add(info.isbn))
      .then((book: Book) => {
        promptAction.showToast({ message: `已加入《${book.title}》` });
        this.loadBooks();
      })
      .catch((e: Error) => {
        promptAction.showToast({ message: e.message });
      })
      .finally(() => {
        this.busy = false;
      });
  }

  build() {
    Stack() {
      Column() {
        Text('图书馆管理')
          .fontSize(20)
          .fontWeight(FontWeight.Bold)
          .margin({ top: 12, bottom: 8 })

      Row({ space: 8 }) {
        TextInput({ placeholder: '搜索书名 / 作者 / ISBN', text: this.keyword })
          .layoutWeight(1)
          .onChange((v: string) => {
            this.keyword = v;
          })
          .onSubmit(() => this.loadBooks())

        Button(this.busy ? '...' : '搜索')
          .enabled(!this.busy)
          .onClick(() => this.loadBooks())
      }
      .padding({ left: 12, right: 12 })

      Row() {
        Text(`共 ${this.books.length} 种图书`).fontSize(12).opacity(0.7)
        Blank()
        Text('设置服务器')
          .fontSize(13)
          .fontColor(Color.Blue)
          .onClick(() => {
            this.serverUrl = ApiClient.baseUrl;
            this.showSettings = true;
          })
      }
      .width('100%')
      .padding({ left: 12, right: 12, top: 6, bottom: 6 })

      List({ space: 8 }) {
        ForEach(this.books, (book: Book) => {
          ListItem() {
            Row({ space: 12 }) {
              if (book.cover_url && book.cover_url.length > 0) {
                Image(book.cover_url)
                  .width(56).height(78)
                  .borderRadius(6)
                  .objectFit(ImageFit.Cover)
              } else {
                Column() {
                  Text('无封面').fontSize(10).fontColor(Color.White)
                }
                  .width(56).height(78)
                  .borderRadius(6)
                  .backgroundColor(Color.Gray)
                  .justifyContent(FlexAlign.Center)
              }

              Column({ space: 2 }) {
                Text(book.title).fontSize(15).fontWeight(FontWeight.Medium)
                  .maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
                Text(book.author ?? '').fontSize(12).opacity(0.7)
                  .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
                Text(`ISBN ${book.isbn}`).fontSize(11).opacity(0.6)
              }
              .layoutWeight(1)
              .alignItems(HorizontalAlign.Start)

              Text(book.available > 0 ? `在馆 ${book.available}/${book.copies}` :
                `已借出 ${book.copies}/${book.copies}`)
                .fontSize(11)
                .fontColor(book.available > 0 ? Color.Green : Color.Orange)
            }
            .width('100%')
            .padding(10)
            .backgroundColor(Color.White)
            .borderRadius(10)
            .onClick(() => {
              router.pushUrl({ url: 'pages/Detail', params: { id: book.id } });
            })
          }
        }, (book: Book) => book.id.toString())
      }
      .layoutWeight(1)
      .width('100%')
      .padding({ left: 12, right: 12, bottom: 12 })

      Button(this.busy ? '处理中...' : '＋ 扫码加入')
        .width('90%')
        .height(46)
        .margin({ bottom: 16 })
        .enabled(!this.busy)
        .onClick(() => this.startScan())
      }
      .width('100%')
      .height('100%')
      .backgroundColor('#F2F3F5')

      if (this.showSettings) {
        this.settingsDialog()
      }
    }
  }

  @Builder
  settingsDialog() {
    Column() {
      Column({ space: 10 }) {
        Text('服务器地址').fontSize(16).fontWeight(FontWeight.Bold)
        TextInput({ text: this.serverUrl, placeholder: 'http://192.168.x.x:3000' })
          .onChange((v: string) => {
            this.serverUrl = v;
          })
        Row({ space: 12 }) {
          Button('取消')
            .backgroundColor('#E5E5E5')
            .fontColor(Color.Black)
            .onClick(() => {
              this.showSettings = false;
            })
          Button('保存')
            .onClick(() => {
              if (ApiClient.setBaseUrl(this.serverUrl)) {
                this.showSettings = false;
                this.loadBooks();
              } else {
                promptAction.showToast({ message: '格式应为 http://IP:3000' });
              }
            })
        }
        .justifyContent(FlexAlign.End)
      }
      .padding(16)
      .backgroundColor(Color.White)
      .borderRadius(12)
      .width('86%')
    }
    .width('100%')
    .height('100%')
    .backgroundColor('rgba(0,0,0,0.4)')
    .justifyContent(FlexAlign.Center)
    .onClick(() => {
      // 点击遮罩不关闭
    })
  }
}
