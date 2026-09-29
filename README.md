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
      │  cfs + ảnh (đã xoá EXIF)           │  duyệt / sửa / xoá / đổi cài đặt
      ▼                                    ▼
┌──────────────────────────────────────────────────┐
│  Apps Script  —  chạy trong Drive của admin      │
│  • ảnh  → thư mục Drive (quyền: ai có link xem)  │
│  • cfs  → Google Sheet (mặc định: chờ duyệt)     │
│  • đếm  → Sheet Stats (chỉ những ô số cộng dồn)  │
└──────────────────────────────────────────────────┘
      │  chỉ cfs ĐÃ DUYỆT
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

Đăng nhập bằng:

| | |
|---|---|
| Link Apps Script | URL ở bước 2.4 (được ghi nhớ trên máy bạn) |
| Tên đăng nhập | `admin@datnguyen` |
| Mật khẩu | mật khẩu mặc định trong `apps-script/Code.gs` |

### ⚠ Đổi mật khẩu ngay lần đầu

`Code.gs` nằm trong repo **public** (GitHub Pages cần vậy), nên **mật khẩu mặc định là công khai**.
Trang quản trị sẽ hiện băng đỏ cho tới khi bạn đổi. Hai cách:

- Tab **Cài đặt → Tài khoản quản trị** → nhập mật khẩu hiện tại + mật khẩu mới, hoặc
- Trong Apps Script, chạy `setAdminPassword("mật khẩu mới của bạn")`

Đổi tên đăng nhập luôn: `setAdminAccount("tên mới", "mật khẩu mới")`.

Mật khẩu **không được lưu dạng chữ ở bất cứ đâu** — chỉ lưu `SHA-256(salt|mật khẩu)` trong
Script Properties của Apps Script. Trình duyệt chỉ giữ *session token* trong `sessionStorage`,
mất khi đóng tab, và tự hết hạn sau 8 giờ. Đổi mật khẩu sẽ thu hồi mọi phiên đang mở.

### Ba tab làm việc

**Chờ duyệt** — mỗi cfs là một thẻ: xem nội dung, xem ảnh (bấm để phóng to), **bỏ từng ảnh**
nếu ảnh lộ mặt, sửa nội dung để cắt thông tin nhận dạng, đổi chủ đề, đặt số thứ tự
(đã gợi ý số tiếp theo) rồi **Duyệt & đăng**. Hoặc **Từ chối** (giữ lại trong Sheet để đối chiếu),
hoặc **Xoá hẳn** (xoá dòng + đưa ảnh vào thùng rác Drive).

**Đã đăng** — tìm theo nội dung hoặc `#số`, sửa lại, hạ xuống chờ duyệt, hoặc xoá hẳn.

**Cài đặt** — sửa xong là trang công khai đổi theo ngay, **không cần mở code**:
tên trang, tên trường, câu giới thiệu, link fanpage, giới hạn ký tự, số cfs mỗi người
mỗi khoảng thời gian, số ảnh tối đa, số cfs mỗi trang, bật/tắt tính năng ảnh,
bật/tắt lời khuyên che mặt, bật/tắt bộ đếm thống kê, và **tạm nghỉ nhận cfs** kèm lời nhắn.
Cuối tab có link trực tiếp tới Sheet và thư mục ảnh trong Drive.

Trang tự đăng xuất sau 30 phút không hoạt động (`admin.idleLogoutMinutes` trong `config.js`).

---

## 4. Thống kê người ghé trang

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

## 5. Hình ảnh

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

## 6. Deploy lên GitHub Pages — với tên miền ẩn danh

Địa chỉ GitHub Pages **luôn là `https://<chủ-repo>.github.io/…`**. Chủ repo là account cá
nhân thì tên thật/username của bạn nằm ngay trong URL. Muốn URL ẩn danh thì repo phải thuộc
một chủ có **tên ẩn danh** — dùng **Organization** (miễn phí, tạo trong 30 giây, không cần
email mới):

1. Tạo org: <https://github.com/account/organizations/new?plan=free>
   - *Organization name*: một tên tiếng Anh ẩn danh, ví dụ `kudoshinichi-1508`
   - *Contact email*: email của bạn (GitHub **không hiển thị** email này công khai)
   - *This organization belongs to*: **My personal account**
2. Trong org, tạo repo **public** tên **đúng bằng** `<tên-org>.github.io`
   (ví dụ `kudoshinichi-1508.github.io`) → site sẽ ở ngay gốc, không có thư mục con.
3. Push thư mục này lên nhánh `main`:

   ```bash
   git init
   git add .
   # danh tinh AN DANH, dat rieng cho repo nay
   git config user.name  "Kudo Shinichi"
   git config user.email "kudoshinichi-1508@users.noreply.github.com"
   git commit -m "init TGU Confessions"
   git branch -M main
   git remote add origin https://github.com/kudoshinichi-1508/kudoshinichi-1508.github.io.git
   git push -u origin main
   ```

4. **Settings → Pages → Build and deployment → Source = GitHub Actions**.
5. Workflow `.github/workflows/deploy.yml` chạy ~1 phút, site lên tại
   `https://kudoshinichi-1508.github.io/`.

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

## 7. Ẩn danh tới mức nào?

**Trang không thu gì về người gửi:** không tài khoản, không email, không analytics của bên
thứ ba, không pixel, không cookie, không font tải từ server ngoài (dùng font hệ thống).
`localStorage` chỉ giữ 3 khoá vô hại: `cfs-theme`, `cfs-submit-log` (chống spam), `cfs-liked`.

**Nhưng nói cho rõ:** GitHub và Google đều có log kỹ thuật riêng của họ. Chủ trang không xem
được và cũng không xoá hộ được. Vì vậy bảo vệ thật sự đến từ **nội dung bạn viết**:

- Đừng ghi tên thật, MSSV, số điện thoại, link Facebook, biệt danh chỉ mình bạn dùng.
- Đừng kể chi tiết mà chỉ 1–2 người trong lớp biết.
- Muốn kỹ hơn: dùng 4G thay Wi-Fi trường, hoặc trình duyệt Tor.

---

## 8. Nội quy đã cài sẵn trong trang

**Điều tiên quyết** (đặt trên cả 6 điều): không vi phạm quyền riêng tư của ai; ảnh có mặt
người thì nên dán nhãn che mặt trước khi đăng.

Sau đó là 6 điều: từ ngữ không thô tục · một cfs không gửi quá 3 lần · gửi qua link chứ
đừng inbox page · **cẩn trọng ngôn từ khi nói về thầy cô** · không bôi xấu/tung tin thất
thiệt · giữ gìn hình ảnh của trường.

Nội dung nội quy là HTML thuần trong `index.html` (mục `#noi-quy`), sửa trực tiếp được.

---

## 9. Tuỳ biến giao diện

Đổi màu: sửa `--violet`, `--pink`, `--grad-accent`, `--grad-text` ở đầu `assets/css/style.css`.
Hai theme nằm trong `[data-theme="dark"]` và `[data-theme="light"]`.
Danh sách chủ đề nằm ở `categories` trong `config.js` — nếu thêm chủ đề mới, nhớ thêm `id`
tương ứng vào `CFG.CATEGORIES` trong `apps-script/Code.gs`.

---

## 10. Trách nhiệm

Trang do sinh viên tự lập, **không thuộc sự quản lí của Trường Đại học Tiền Giang**.
Người quản trị nên duyệt cfs theo đúng điều tiên quyết và 6 điều nội quy — đặc biệt là cẩn
trọng ngôn từ khi nói về thầy cô, không để nội dung bôi nhọ hay ảnh lộ mặt người khác lên sóng.
