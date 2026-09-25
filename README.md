```
         /\_/\
        ( o.o )  ~
         > ^ <\___
        /|   |    \
  ___  / |___|  ___\
 / _ \/_______\/ _ \
| (_) |       | (_) |
 \___/         \___/
   貓米騎自行車
```

# fengbro — 鋒兄AI Appwrite CLI 版

把網頁版 [鋒兄AI Appwrite](https://fengbroaiappwrite.vercel.app/) 改造成終端機工具。
使用與網頁版相同的後端 API（`/api/<模組>`），所以資料、首頁「今日待處理」的計算方式、Appwrite 帳號切換都和網頁版一致。

- 零相依套件，只需要 Node.js 18.17 以上
- 支援中文別名（`fengbro 訂閱`、`fengbro 食品`）
- 有互動選單，也能搭配 `--json` / `--csv` 寫腳本

## 安裝

```bash
npm install
npm link        # 之後就能在任何地方執行 fengbro
```

不想全域安裝的話，也可以直接執行 `node bin/fengbro.js …`。

## 快速開始

```bash
fengbro                 # 互動模式（主選單：鋒兄首頁／鋒兄管理／鋒兄工具／搜尋／設定）
fengbro home            # 今日待處理
fengbro home --full     # 完整儀表（各模組筆數、訂閱費用、存款合計）
fengbro modules         # 列出全部模組
```

## 模組

| 網頁選單 | 指令 | 別名 |
| --- | --- | --- |
| 訂閱 | `subscription` | `sub` `訂閱` |
| 試用／首購 | `trial-purchase` | `trial` `試用` `首購` |
| 重灌 | `reinstall` | `re` `重灌` |
| 額度 | `quota` | `q` `額度` |
| 食品／商品 | `food` | `食品` `商品` |
| 購物清單 | `shopping-list` | `shop` `購物` |
| 常用 | `commonaccount` | `common` `常用` |
| 銀行 | `bank` | `銀行` |
| 筆記 | `article` | `note` `筆記` |
| 音樂／文件／播客 | `music` `commondocument` `podcast` | `音樂` `文件` `播客` |
| 圖片／影片 | `images` `videos` | 唯讀 |
| 例行 | `routine` | `r` `例行` |
| 金融標的／Tube／比價 | `financeinstrument2` `tubechannel` `manualprice` | `fi` `tube` `比價`（比價為唯讀） |

## 管理資料

```bash
fengbro sub                                   # 列表（預設依下次扣款日排序）
fengbro sub list netflix                      # 關鍵字搜尋
fengbro sub show 巴哈                         # 查看：可用 ID、#序號 或名稱（可部分比對）
fengbro sub add --name Netflix --price 390 --currency TWD --nextdate 2026-10-15 --continue yes
fengbro sub edit Netflix --nextdate +1m note=家庭方案
fengbro sub delete Netflix                    # 會要求確認；腳本裡用 --yes
fengbro routine done 理髮                     # 例行：記錄今天已執行（最近三次日期往後推）
fengbro trial fields                          # 查看模組欄位、型別與選項
```

- `add` / `edit` 不帶任何欄位時會逐欄互動詢問（Enter 保留原值，`-` 清空）
- 日期可用 `2026-10-15`、`2026/10/15`、`today`、`明天`、`+7`、`+2w`、`+1m`、`none`（清空）
- 選項欄位可以打值或中文名稱：`--trialStatus trialing` 等同 `--trialStatus 試用中`
- `--dry-run` 只印出將送出的 payload，不會寫入
- 要清空文字欄位用 `--note ""`
- 序號與檢視密碼預設遮住，加上 `--reveal` 才會顯示

### 篩選、排序與輸出

```bash
fengbro food --where "todate<2026-12-31" --sort todate
fengbro sub --where archived=no --where "price>300" --sort -price --columns name,price,nextdate
fengbro quota --where serviceType=ai -n 5
fengbro bank --json | jq 'map(.deposit) | add'
fengbro search 巴哈                            # 跨模組搜尋
```

`--where` 支援 `=`、`!=`、`>`、`<`、`>=`、`<=`、`~`（包含），可以重複使用。

### 備份／還原（對應「選單備份／還原」）

```bash
fengbro export all --out backup/          # 全部模組各存一個 CSV（--format json 改存 JSON）
fengbro food export --out food.csv
fengbro food import food.csv --dry-run    # 先看會新增幾筆、更新幾筆
fengbro food import food.csv --yes
```

匯入規則和網頁版相同：`$id` 或名稱相同就更新，其餘新增，不會刪除檔案裡沒有的資料。
CLI 不處理圖片、影片等媒體檔的 ZIP，請用網頁版。

## 設定（Appwrite 帳號切換）

網頁版把 Appwrite 連線資訊存在瀏覽器 localStorage；CLI 存在 `~/.config/fengbro/config.json`（權限 600）。
沒有設定時會使用網站預設的 Appwrite 帳號。

```bash
fengbro config                              # 查看設定（API Key 會遮住）
fengbro config add work                     # 新增設定檔（互動輸入 endpoint、project、database、key、bucket）
fengbro config import-env .env.local -p work  # 從 .env 匯入 NEXT_PUBLIC_APPWRITE_ENDPOINT 等鍵
fengbro config set key <API_KEY> -p work
fengbro config use work                     # 切換帳號
fengbro --profile work home                 # 只有這次使用某個設定檔
fengbro config set base-url https://…       # 改用其他部署的網址（例如本機 http://localhost:3000）
fengbro status                              # 檢查連線
```

也可以用環境變數覆寫：`FENGBRO_BASE_URL`、`FENGBRO_PROFILE`、`APPWRITE_ENDPOINT`、`APPWRITE_PROJECT_ID`、`APPWRITE_DATABASE_ID`、`APPWRITE_API_KEY`、`APPWRITE_BUCKET_ID`。

## 其他

```bash
fengbro finance     # 鋒兄金融報價
fengbro storage     # Appwrite Storage 使用量
fengbro help sub    # 模組說明
```

## 與網頁版的差異

- 不支援上傳圖片、影片、音樂、文件等檔案（可以編輯這些資料的名稱、分類等欄位）
- 不包含語音 CRUD、推播通知、Email 通知設定、Google 雲端硬碟串接、影片合併等瀏覽器專屬工具
- 額度的 accessToken 與四位數密碼相關功能請用網頁版

## 開發

```bash
npm test            # 單元測試 + 端對端測試（使用本機假後端，不會碰到正式資料）
FENGBRO_DEBUG=1 fengbro …   # 顯示完整錯誤堆疊
```
