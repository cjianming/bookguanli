import { promptAction, router } from '@kit.ArkUI';
import { Book, LoanRecord, ApiClient } from '../common/Api';

@CustomDialog
struct BorrowDialog {
  controller?: CustomDialogController;
  onConfirm: (name: string) => void = () => {
  };
  @State name: string = '';

  build() {
    Column({ space: 12 }) {
      Text('借出给谁？').fontSize(16).fontWeight(FontWeight.Bold)
      TextInput({ placeholder: '借阅人姓名' })
        .onChange((v: string) => {
          this.name = v;
        })
      Row({ space: 12 }) {
        Button('取消')
          .backgroundColor('#E5E5E5')
          .fontColor(Color.Black)
          .onClick(() => {
            this.controller?.close();
          })
        Button('确定')
          .enabled(this.name.trim().length > 0)
          .onClick(() => {
            this.controller?.close();
            this.onConfirm(this.name.trim());
          })
      }
      .justifyContent(FlexAlign.End)
    }
    .padding(16)
  }
}

@Entry
@Component
struct Detail {
  @State book: Book | null = null;
  @State loans: LoanRecord[] = [];
  @State busy: boolean = false;
  @State borrowName: string = '';
  dialogController: CustomDialogController = new CustomDialogController({
    builder: BorrowDialog({
      onConfirm: (name: string) => this.doBorrow(name)
    })
  });
  private bookId: number = 0;

  aboutToAppear(): void {
    const params = router.getParams() as Record<string, number>;
    this.bookId = params !== undefined && params['id'] !== undefined ? params['id'] : 0;
    this.load();
  }

  load(): void {
    this.busy = true;
    Promise.all([ApiClient.book(this.bookId), ApiClient.loans(this.bookId)])
      .then((values) => {
        this.book = values[0] as Book;
        this.loans = values[1] as LoanRecord[];
      })
      .catch((e: Error) => {
        promptAction.showToast({ message: `加载失败: ${e.message}` });
      })
      .finally(() => {
        this.busy = false;
      });
  }

  doBorrow(name: string): void {
    this.busy = true;
    ApiClient.borrow(this.bookId, name)
      .then((_b: Book) => {
        promptAction.showToast({ message: '已借出' });
        this.load();
      })
      .catch((e: Error) => promptAction.showToast({ message: e.message }))
      .finally(() => {
        this.busy = false;
      });
  }

  doReturn(): void {
    this.busy = true;
    ApiClient.returnBook(this.bookId)
      .then((_b: Book) => {
        promptAction.showToast({ message: '已归还' });
        this.load();
      })
      .catch((e: Error) => promptAction.showToast({ message: e.message }))
      .finally(() => {
        this.busy = false;
      });
  }

  doDelete(): void {
    this.busy = true;
    ApiClient.remove(this.bookId)
      .then(() => {
        router.back();
      })
      .catch((e: Error) => promptAction.showToast({ message: e.message }))
      .finally(() => {
        this.busy = false;
      });
  }

  build() {
    Column() {
      Row() {
        Text('← 返回')
          .fontSize(15)
          .fontColor(Color.Blue)
          .onClick(() => {
            router.back();
          })
        Blank()
        Text('图书详情').fontSize(17).fontWeight(FontWeight.Bold)
        Blank()
        Text('').fontSize(15)
      }
      .width('100%')
      .padding(12)

      if (this.book !== null) {
        Scroll() {
          Column({ space: 14 }) {
            Row({ space: 14 }) {
              if (this.book.cover_url && this.book.cover_url.length > 0) {
                Image(this.book.cover_url)
                  .width(100).height(140)
                  .borderRadius(8)
                  .objectFit(ImageFit.Cover)
              }

              Column({ space: 4 }) {
                Text(this.book.title).fontSize(17).fontWeight(FontWeight.Bold)
                Text(`作者：${this.book.author ?? '-'}`).fontSize(13)
                Text(`出版社：${this.book.publisher ?? '-'}`).fontSize(13)
                Text(`出版日期：${this.book.pubdate ?? '-'}`).fontSize(13)
                Text(`ISBN：${this.book.isbn}`).fontSize(13)
                Text(`在馆 ${this.book.available} / 馆藏 ${this.book.copies}　位置：${this.book.location ?? '-'}`)
                  .fontSize(13)
                  .fontColor(Color.Blue)
              }
              .alignItems(HorizontalAlign.Start)
              .layoutWeight(1)
            }
            .alignItems(VerticalAlign.Top)

            if (this.book.description && this.book.description.length > 0) {
              Column({ space: 6 }) {
                Text('简介').fontSize(15).fontWeight(FontWeight.Bold)
                Text(this.book.description).fontSize(13)
              }
              .alignItems(HorizontalAlign.Start)
            }

            Row({ space: 8 }) {
              Button('借出')
                .enabled(!this.busy && this.book.available > 0)
                .onClick(() => {
                  this.dialogController.open();
                })
              Button('归还')
                .enabled(!this.busy && this.book.available < this.book.copies)
                .onClick(() => this.doReturn())
              Button('删除')
                .backgroundColor(Color.Orange)
                .enabled(!this.busy)
                .onClick(() => this.doDelete())
            }
            .justifyContent(FlexAlign.Start)

            Column({ space: 6 }) {
              Text('借阅记录').fontSize(15).fontWeight(FontWeight.Bold)
              if (this.loans.length === 0) {
                Text('暂无记录').fontSize(12).opacity(0.6)
              }
              ForEach(this.loans, (loan: LoanRecord) => {
                Text(`${loan.borrower}　借于 ${loan.borrowed_at}` +
                  (loan.returned_at !== undefined && loan.returned_at !== null ?
                  `　还于 ${loan.returned_at}` : '　(未归还)'))
                  .fontSize(12)
                  .opacity(0.8)
              }, (loan: LoanRecord) => loan.id.toString())
            }
            .alignItems(HorizontalAlign.Start)
          }
          .padding(12)
          .alignItems(HorizontalAlign.Start)
        }
        .layoutWeight(1)
      } else {
        Column() {
          Text(this.busy ? '加载中...' : '未找到该图书').opacity(0.6)
        }
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .width('100%')
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F2F3F5')
  }
}
