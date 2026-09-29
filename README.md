# TGU Confessions

Trang confession ẩn danh của sinh viên **Đại học Tiền Giang** — file tĩnh chạy miễn phí trên
GitHub Pages, dữ liệu nằm trong **Google Drive của bạn**. Không server, không thẻ tín dụng,
không đăng nhập với người gửi.

```
confession/
├─ index.html                 # trang confession (công khai)
├─ admin.html                 # trang quản trị (đăng nhập mới vào được)
├─ 404.html
├─ .nojekyll
├─ apps-script/
│  └─ Code.gs                 # ⭐ backend: dán vào Apps Script trong Drive của bạn
├─ assets/
│  ├─ css/style.css           # design system + dark/light + animation
│  ├─ css/admin.css           # giao diện trang quản trị
│  └─ js/
│     ├─ config.js            # chỉ cần điền 1 dòng webAppUrl
│     ├─ backend.js           # gửi/đọc cfs + upload ảnh + đếm thống kê
│     ├─ imagekit.js          # xoá EXIF + trình che mặt
│     ├─ app.js               # tương tác trang công khai
│     └─ admin.js             # tương tác trang quản trị
└─ .github/workflows/deploy.yml
```

Cách hoạt động:

```
Người gửi (không đăng nhập)          Admin (đăng nhập)
      │                                    │
      │  cfs + ảnh (đã xoá EXIF)           │  duyệt / sửa / gỡ / xoá / đổi cài đặt
      ▼                                    ▼
┌──────────────────────────────────────────────────┐
│  Apps Script  —  chạy trong Drive của admin      │
│  • ảnh  → thư mục Drive (quyền: ai có link xem)  │
│  • cfs  → Google Sheet                           │
│      – không kèm ảnh  → ĐĂNG NGAY                │
│      – có kèm ảnh     → chờ admin duyệt          │
│  • bình luận → Sheet Comments (tên do server đặt)│
│  • thương / không đồng tình → 2 ô số cộng dồn    │
│  • đếm  → Sheet Stats (chỉ những ô số cộng dồn)  │
└──────────────────────────────────────────────────┘
      │  chỉ cfs ĐÃ ĐĂNG
      ▼
  index.html trên GitHub Pages
```

---

## 1. Chạy thử trên máy

```bash
python -m http.server 5173      # hoặc: npx serve .
```

Vào `http://localhost:5173`. Chưa dán link Apps Script thì trang tự chạy **chế độ DEMO**:
cfs chỉ lưu trong `localStorage` của máy bạn, dùng để xem giao diện.

---

## 2. Dựng backend trong Google Drive (5 phút)

> Dùng một **account Google cá nhân**. Account trường (`@student…`, `@edu…`) thường bị
> chặn chia sẻ file ra ngoài, ảnh sẽ không hiện được.

1. Tạo **Google Sheet mới** trong Drive của bạn (đặt tên gì cũng được).
2. **Extensions → Apps Script**. Xoá code mẫu, dán toàn bộ `apps-script/Code.gs` vào.
3. Chọn hàm `setup` trên thanh công cụ → **Run**. Lần đầu Google hỏi quyền → **Review
   permissions → Allow** (bạn đang cấp quyền cho script của chính bạn).
   `setup` sẽ tạo:
   - sheet `Inbox` (chứa cfs) và `Stats` (chứa bộ đếm)
   - thư mục Drive `TGU Confessions - anh` (chứa ảnh)
   - tài khoản quản trị mặc định
4. **Deploy → New deployment → chọn type “Web app”**:

   | Thiết lập | Chọn |
   |---|---|
   | Execute as | **Me** |
   | Who has access | **Anyone** |

   → **Deploy** → copy **Web app URL** (dạng `https://script.google.com/macros/s/…/exec`).

   *“Anyone” nghĩa là ai cũng gửi được cfs mà không phải đăng nhập — đúng như mong muốn.
   Nó KHÔNG cho ai xem cfs chưa duyệt hay sửa gì: mọi thao tác quản trị đều phải qua mật khẩu.*

5. Mở `assets/js/config.js`, dán URL vào đúng một chỗ:

   ```js
   backend: {
     provider: "appsscript",
     appsScript: { webAppUrl: "https://script.google.com/macros/s/AKfycb..../exec" }
   }
   ```

   Xong. Không cần sửa gì khác trong file này nữa.

> **Mỗi lần sửa `Code.gs`** phải: Deploy → Manage deployments → ✏️ Edit →
> Version: **New version** → Deploy. Không làm bước này thì bản cũ vẫn đang chạy.

---

## 3. Trang quản trị `admin.html`

Mở `https://<tên-org>.github.io/admin.html` (có link “Quản trị” ở cuối trang chủ).

Đăng nhập chỉ cần **tên đăng nhập + mật khẩu**:

| | |
|---|---|
| Tên đăng nhập | `admin@datnguyen` |
| Mật khẩu | mật khẩu mặc định trong `apps-script/Code.gs` |

Không còn ô dán link Apps Script — trang tự lấy link từ `backend.appsScript.webAppUrl` trong
`assets/js/config.js` (dòng bạn đã điền ở bước 2.5). Chưa điền thì trang nói rõ phải điền vào đâu.

### ⚠ Đổi mật khẩu ngay lần đầu

`Code.gs` nằm trong repo **public** (GitHub Pages cần vậy), nên **mật khẩu mặc định là công khai**.
Trang quản trị sẽ hiện băng đỏ cho tới khi bạn đổi. Hai cách:

- Tab **Cài đặt → Tài khoản quản trị** → nhập mật khẩu hiện tại + mật khẩu mới, hoặc
- Trong Apps Script, chạy `setAdminPassword("mật khẩu mới của bạn")`

Đổi tên đăng nhập luôn: `setAdminAccount("tên mới", "mật khẩu mới")`.

Mật khẩu **không được lưu dạng chữ ở bất cứ đâu** — chỉ lưu `SHA-256(salt|mật khẩu)` trong
Script Properties của Apps Script. Trình duyệt chỉ giữ *session token* trong `sessionStorage`,
mất khi đóng tab, và tự hết hạn sau 8 giờ. Đổi mật khẩu sẽ thu hồi mọi phiên đang mở.

### Bốn tab làm việc

**Chờ duyệt** — ở đây **chỉ còn cfs có kèm ảnh**, vì cfs không ảnh đã tự lên bảng tin (xem mục 4).
Mỗi cfs là một thẻ: xem nội dung, xem ảnh (bấm để phóng to), **bỏ từng ảnh** nếu ảnh lộ mặt,
sửa nội dung để cắt thông tin nhận dạng, đổi chủ đề, đặt số thứ tự rồi **Duyệt & đăng**.
Hoặc **Từ chối** (giữ lại trong Sheet để đối chiếu), hoặc **Xoá hẳn** (xoá dòng + đưa ảnh
vào thùng rác Drive).

> **Số thứ tự được cấp ngay lúc người gửi bấm gửi**, không phải lúc duyệt — vì trang có
> hiện số đó cho người gửi ghi nhớ (xem mục dưới). Thẻ chờ duyệt vì vậy mang sẵn số đã cấp
> (badge nét đứt `#12`), và ô số trong thẻ điền sẵn đúng số ấy. Sửa số vẫn được, nhưng sửa
> thì người gửi tìm không ra cfs của mình — nên chỉ đổi khi thật cần. Cfs bị từ chối sẽ để
> lại một khoảng trống trong dãy số, chuyện bình thường.

**Đã đăng** — **toàn bộ** cfs đang hiển thị trên bảng tin, mỗi thẻ kèm `💗 thương · 👎 không
đồng tình · 💬 bình luận`. Tìm theo nội dung hoặc `#số`, sửa nội dung/chủ đề/số, **Gỡ khỏi
bảng tin** (cfs về mục chờ duyệt, trang công khai không còn thấy) hoặc **Xoá hẳn**.

**Bình luận** — danh sách bình luận mới nhất kèm `#số` của cfs và tên ngẫu nhiên mà hệ thống
đã đặt. Tìm theo nội dung/tên/`#số`, và **Xoá** cái nào lệch nội quy. Muốn tắt hẳn tính năng
bình luận: tab Cài đặt.

**Cài đặt** — sửa xong là trang công khai đổi theo ngay, **không cần mở code**:
tên trang, tên trường, câu giới thiệu, link fanpage, giới hạn ký tự, số cfs mỗi người
mỗi khoảng thời gian, số ảnh tối đa, số cfs mỗi trang, độ dài tối đa của bình luận,
**tự đăng cfs không kèm ảnh**, **cho bình luận**, bật/tắt tính năng ảnh, bật/tắt lời khuyên
che mặt, bật/tắt bộ đếm thống kê, và **tạm nghỉ nhận cfs** kèm lời nhắn.
Cuối tab có link trực tiếp tới Sheet và thư mục ảnh trong Drive.

Trang tự đăng xuất sau 30 phút không hoạt động (`admin.idleLogoutMinutes` trong `config.js`).

---

## 4. Cfs nào tự đăng, cfs nào phải chờ

| Người gửi | Chuyện gì xảy ra |
|---|---|
| **Không kèm ảnh** | Lên bảng tin **ngay**, không cần admin. Hộp cảm ơn nói rõ “đã lên bảng tin luôn”. |
| **Có kèm ảnh** | Vào mục **Chờ duyệt** của admin. Ảnh là chỗ dễ lộ mặt người khác nhất nên luôn cần người xem trước. |

Muốn mọi cfs đều phải duyệt như trước: tab **Cài đặt → tắt “Tự đăng cfs không kèm ảnh”**.
Admin vẫn **gỡ được bất cứ bài nào** đã đăng ở tab *Đã đăng* — gỡ là trang công khai mất bài
ngay trong lượt tải kế tiếp.

---

## 5. Thương / Không đồng tình

Mỗi bài trên bảng tin có hai nút kèm số đếm: **Thương** và **Không đồng tình**. Bấm lần nữa là
bỏ chọn; chọn nút này thì nút kia tự nhả (một người chỉ giữ một lựa chọn cho mỗi cfs).

- Lựa chọn của người xem nằm trong `localStorage` (`cfs-react`) — **không gửi kèm bất cứ thứ
  gì nhận dạng**.
- Bên Sheet chỉ có **hai ô số cộng dồn** cho mỗi cfs (cột `likes`, `dislikes`), không có dòng
  nào ghi ai đã bấm.
- Mỗi lượt gọi đổi **nhiều nhất 1 đơn vị** mỗi loại và số không bao giờ xuống dưới 0, nên
  không ai bơm số bằng cách gửi `+999`.
- Sheet dựng từ bản cũ (9 cột) được **tự thêm 2 cột** này lúc chạy, không cần làm gì thêm.

---

## 6. Bình luận bằng tên ẩn danh

Bấm **Bình luận** trên một bài để mở phần bình luận. Gõ nội dung, bấm gửi (hoặc `Ctrl/⌘ + Enter`).

**Tên hiển thị do server tự random**, kiểu *“Mèo Ngái Ngủ 42”*, *“Cá Heo Bí Ẩn 17”* — người
bình luận không chọn được tên, và trang **không gửi tên nào lên server**. Trong cùng một cfs,
hệ thống tránh trùng tên để đọc không lẫn; hai bình luận của cùng một người ở hai lần khác nhau
sẽ mang tên khác nhau — cố ý như vậy để không ai bị nối lại thành một người.

Bình luận **hiện ngay** (không chờ duyệt), nhưng: tối đa 400 ký tự (admin sửa được), chặn mềm
10 lần / 10 phút mỗi trình duyệt, chỉ bình luận được cfs **đã đăng**, và admin xoá được bất cứ
bình luận nào ở tab **Bình luận**. Tắt hẳn: tab Cài đặt → *Cho bình luận trên bảng tin*.

Bình luận nằm ở sheet **Comments** trong cùng Google Sheet: `id`, `createdAt`, `cfsNumber`,
`name`, `content`, `status`, `displayDate`. Danh sách công khai chỉ trả về `name`, `content`,
`date` — không kèm id, không kèm giờ chính xác.

---

## 7. Số thứ tự người gửi nhìn thấy

Ngay đầu ô gửi cfs có dải *"Cfs của bạn sẽ mang số **#N**"*, và sau khi gửi xong hộp cảm ơn
hiện lại đúng số đó to rõ để người gửi ghi nhớ — đó là số cfs sẽ mang khi lên bảng tin, tìm
lại bằng ô tìm kiếm `#N` hoặc link `…/#cfs-N`.

Số do backend cấp trong một `LockService` lock ngay lúc nhận cfs, nên hai người bấm gửi cùng
lúc không bao giờ nhận cùng số. Trang lấy số dự kiến trong cùng lượt gọi `bootstrap` đang
dùng để tải cài đặt + bảng tin, không thêm lượt mạng nào.

Provider không cấp số (`googleform`, `firebase`) thì trang tự đoán bằng *số lớn nhất trên
bảng tin + 1*; nếu vẫn không đoán được thì dải số tự ẩn, không hiện số sai.

---

## 8. Thống kê người ghé trang

Tab **Thống kê** cho biết:

- **Lượt ghé theo ngày** — cột theo từng ngày, chọn khoảng 7/14/30/90 ngày
- **Chủ đề người xem quan tâm** — đếm số lần bấm lọc từng chủ đề trên bảng tin
  → trả lời trực tiếp câu “mọi người thường chọn danh mục nào”
- **Chủ đề được gửi nhiều nhất** — theo số cfs gửi lên, kể cả chưa duyệt
- **Đã đăng theo chủ đề** — số cfs thực tế đang hiển thị
- Thẻ tổng: lượt ghé, đã đăng, chờ duyệt, từ chối

### Nó ẩn danh tới mức nào

Trang gửi lên **đúng hai thứ**: loại sự kiện (`visit` / `catview`) và id chủ đề.
Không IP, không cookie, không id thiết bị, không đường dẫn, không referrer, không user-agent.
Apps Script **không cấp IP người gửi cho script**, nên kể cả muốn cũng không có để lưu.

Bên Sheet, mỗi chỉ số là **một ô số cộng dồn** (`visit:2026-09-29 = 68`), không phải một
dòng cho mỗi người. Vì vậy không có cách nào tách ra ai đã ghé trang.
Lượt ghé đếm **một lần mỗi phiên tab** bằng `sessionStorage` — thứ mất khi đóng tab và
không dùng để nhận dạng được ai.

Muốn tắt hẳn: tab Cài đặt → tắt *“Đếm lượt ghé & chủ đề được xem”*, hoặc
`analytics.enabled = false` trong `config.js`. Mục “Quyền riêng tư” trên trang công khai
đã nói rõ chuyện này với người gửi.

---

## 9. Hình ảnh

Người gửi kèm tối đa 3 ảnh mỗi cfs (chọn file, kéo thả, hoặc Ctrl+V dán trực tiếp).

### Ảnh được làm sạch trước khi rời khỏi máy người gửi

Mọi ảnh đều bị **vẽ lại vào `<canvas>` rồi xuất ra JPEG mới** ngay trong trình duyệt
(`assets/js/imagekit.js`). Hệ quả: toàn bộ **EXIF bị xoá** — toạ độ GPS nơi chụp, model điện
thoại, số serial máy ảnh, giờ chụp, tên chủ máy. File gốc **không bao giờ** được gửi đi.
Ảnh cũng được thu về cạnh dài tối đa 1600px cho nhẹ.

### Trình che mặt — khuyến nghị, không bắt buộc

Bấm **Che mặt** trên ảnh vừa chọn để mở trình sửa:

- **Nhãn dán** — dán emoji lên vùng mặt (mặc định)
- **Che đen** — khối đen bo góc
- **Làm nhoè** — pixel hoá vùng được quét
- **Tự tìm mặt** — chỉ hiện trên trình duyệt có `FaceDetector` (Chrome/Android)

Quét ngón tay hoặc kéo chuột lên vùng mặt để dán, chạm vào nhãn đã dán để xoá.
Nhãn được **nung thẳng vào pixel** của ảnh xuất ra — không phải lớp phủ CSS có thể bóc ra.

Ảnh chưa che mang nhãn đỏ *“Nên che mặt”*, và người gửi được nhắc một lần khi bấm gửi,
nhưng **vẫn gửi được** — quyết định cuối thuộc về người gửi. Chặn thật sự nằm ở bước duyệt:
trong trang quản trị bạn bỏ được từng ảnh trước khi đăng.

### Ảnh nằm ở đâu

Trong thư mục `TGU Confessions - anh` của **Drive của bạn**, quyền *ai có link cũng xem*
(bắt buộc, để `<img>` trên trang hiển thị được). Link nhúng dạng
`https://lh3.googleusercontent.com/d/<id>=w1600`; nếu Google chặn dạng này, trang tự đổi sang
`https://drive.google.com/thumbnail?id=<id>&sz=w1600`.

Xoá hẳn một cfs trên trang quản trị thì ảnh của nó cũng vào **thùng rác Drive**.

Free Drive có 15GB — ảnh 1600px nén khoảng 150–300KB, tức cỡ 50.000 ảnh.

> Muốn dùng nơi khác thay Drive: `images.provider` còn nhận `"cloudinary"`, `"imgbb"`,
> `"firebase"`, `"datauri"`. Xem phần cuối `assets/js/config.js`.

---

## 10. Deploy lên GitHub Pages — với tên miền ẩn danh

Địa chỉ GitHub Pages **luôn là `https://<chủ-repo>.github.io/…`**. Chủ repo là account cá
nhân thì tên thật/username của bạn nằm ngay trong URL. Muốn URL ẩn danh thì repo phải thuộc
một chủ có **tên ẩn danh** — dùng **Organization** (miễn phí, tạo trong 30 giây, không cần
email mới):

1. Tạo org: <https://github.com/account/organizations/new?plan=free>
   - *Organization name*: một tên tiếng Anh ẩn danh, ví dụ `tgu-confessions`
   - *Contact email*: email của bạn (GitHub **không hiển thị** email này công khai)
   - *This organization belongs to*: **My personal account**
2. Trong org, tạo repo **public** tên **đúng bằng** `<tên-org>.github.io`
   (ví dụ `tgu-confessions.github.io`) → site sẽ ở ngay gốc, không có thư mục con.
3. Push thư mục này lên nhánh `main`:

   ```bash
   git init
   git add .
   # danh tinh AN DANH, dat rieng cho repo nay
   git config user.name  "Kudo Shinichi"
   git config user.email "tgu-confessions@users.noreply.github.com"
   git commit -m "init TGU Confessions"
   git branch -M main
   git remote add origin https://github.com/tgu-confessions/tgu-confessions.github.io.git
   git push -u origin main
   ```

4. **Settings → Pages → Build and deployment → Source = GitHub Actions**.
5. Workflow `.github/workflows/deploy.yml` chạy ~1 phút, site lên tại
   `https://tgu-confessions.github.io/`.

Mọi đường dẫn đều **tương đối**, nên site chạy đúng cả khi nằm trong thư mục con.

### Còn chỗ nào lộ người quản trị

- **Tên tác giả commit** — đặt bằng hai dòng `git config` ở trên. Đã push rồi mới đổi thì
  phải ghi lại lịch sử (`git commit --amend --reset-author`) và force-push.
- **Thành viên org** — vào org → *People* → dòng của bạn → đổi *Visibility* thành
  **Private**. Khi đó trang org không liệt kê ai là chủ.
- **Repo cũ nằm dưới account cá nhân** — nếu từng push lên `<username>/…`, hãy **xoá** nó
  (repo → Settings → Danger Zone → Delete). Giữ lại thì URL cũ vẫn tự chuyển sang repo mới,
  tức là vẫn nối được tên bạn với trang.
- Tuyệt đối ẩn danh thì cần **GitHub account mới** bằng email dùng riêng (ProtonMail/Tuta).
  Lịch sử commit là công khai vĩnh viễn.

---

## 11. Ẩn danh tới mức nào?

**Trang không thu gì về người gửi:** không tài khoản, không email, không analytics của bên
thứ ba, không pixel, không cookie, không font tải từ server ngoài (dùng font hệ thống).
`localStorage` chỉ giữ 4 khoá vô hại: `cfs-theme`, `cfs-submit-log` (chống spam),
`cfs-react` (bạn đã bấm thương/không đồng tình bài nào) và `cfs-comment-log` (chống dội bình luận).
Không khoá nào được gửi lên server.

**Nhưng nói cho rõ:** GitHub và Google đều có log kỹ thuật riêng của họ. Chủ trang không xem
được và cũng không xoá hộ được. Vì vậy bảo vệ thật sự đến từ **nội dung bạn viết**:

- Đừng ghi tên thật, MSSV, số điện thoại, link Facebook, biệt danh chỉ mình bạn dùng.
- Đừng kể chi tiết mà chỉ 1–2 người trong lớp biết.
- Muốn kỹ hơn: dùng 4G thay Wi-Fi trường, hoặc trình duyệt Tor.

---

## 12. Nội quy đã cài sẵn trong trang

**Điều tiên quyết** (đặt trên cả 6 điều): không vi phạm quyền riêng tư của ai; ảnh có mặt
người thì nên dán nhãn che mặt trước khi đăng.

Sau đó là 6 điều: từ ngữ không thô tục · một cfs không gửi quá 3 lần · gửi qua link chứ
đừng inbox page · **cẩn trọng ngôn từ khi nói về thầy cô** · không bôi xấu/tung tin thất
thiệt · giữ gìn hình ảnh của trường.

Nội dung nội quy là HTML thuần trong `index.html` (mục `#noi-quy`), sửa trực tiếp được.

---

## 13. Tuỳ biến giao diện

Đổi màu: sửa `--violet`, `--pink`, `--grad-accent`, `--grad-text` ở đầu `assets/css/style.css`.
Hai theme nằm trong `[data-theme="dark"]` và `[data-theme="light"]`.
Danh sách chủ đề nằm ở `categories` trong `config.js` — nếu thêm chủ đề mới, nhớ thêm `id`
tương ứng vào `CFG.CATEGORIES` trong `apps-script/Code.gs`.

---

## 14. Trách nhiệm

Trang do sinh viên tự lập, **không thuộc sự quản lí của Trường Đại học Tiền Giang**.
Người quản trị nên duyệt cfs theo đúng điều tiên quyết và 6 điều nội quy — đặc biệt là cẩn
trọng ngôn từ khi nói về thầy cô, không để nội dung bôi nhọ hay ảnh lộ mặt người khác lên sóng.
