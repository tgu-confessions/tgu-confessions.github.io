/* =======================================================================
   CONFIG

   ⭐ CHỈ CẦN ĐIỀN 1 DÒNG: backend.appsScript.webAppUrl (ở dưới)
      — đó là link deploy của Apps Script trong Drive của bạn.

   Mọi thứ còn lại (tên trang, giới hạn ký tự, bật/tắt ảnh, bật/tắt thống kê,
   tạm nghỉ nhận cfs...) chỉnh trực tiếp trong tab "Cài đặt" của admin.html
   sau khi đăng nhập — không cần mở file này nữa.

   Chưa dán link thì trang tự chạy ở chế độ DEMO để bạn xem giao diện.
   ======================================================================= */
window.CFS_CONFIG = {
  /* ---------- Thông tin trang ---------- */
  site: {
    name: "TGU Confessions",
    shortName: "TGU CFS",
    school: "Đại học Tiền Giang",
    tagline: "Sân chơi ẩn danh của sinh viên",
    // Link fanpage / group (để trống "" nếu chưa có -> nút sẽ tự ẩn)
    fanpage: "",
    // Email liên hệ ban quản trị (để trống "" nếu không muốn hiện)
    contact: ""
  },

  /* ---------- Giới hạn gửi confession ---------- */
  limits: {
    minChars: 20,
    maxChars: 3000,
    // Nội quy #2: một cfs không gửi quá 3 lần -> chặn mềm 3 lần / khoảng thời gian
    maxSubmitsPerWindow: 3,
    windowMinutes: 60
  },

  /* ---------- Bình luận trên bảng tin ----------
     Tên người bình luận do BACKEND tự random (ví dụ "Mèo Ngái Ngủ 42"),
     trang không cho ai tự chọn tên. Admin bật/tắt được trong tab Cài đặt. */
  comments: {
    enabled: true,
    maxChars: 400,
    // chặn mềm phía trình duyệt, tránh một người dội bình luận
    maxPerWindow: 10,
    windowMinutes: 10
  },

  /* ---------- Chủ đề cfs ---------- */
  categories: [
    { id: "crush", label: "Xin info cờ-rút", emoji: "💌" },
    { id: "tamsu", label: "Tâm sự", emoji: "🌧️" },
    { id: "hoctap", label: "Học tập", emoji: "📚" },
    { id: "gopy", label: "Góp ý thầy cô", emoji: "🎓" },
    { id: "vui", label: "Vui là chính", emoji: "🎉" },
    { id: "khac", label: "Khác", emoji: "✨" }
  ],

  /* ---------- Nơi lưu confession ---------- */
  /* provider:
     "local"      -> Demo: lưu trong máy người xem (không gửi đi đâu cả).
                     Dùng để xem thử giao diện. KHÔNG dùng khi chạy thật.
     "appsscript" -> ⭐ KHUYÊN DÙNG. Một Google Apps Script chạy trong Drive của
                     admin: nhận cfs, lưu ảnh vào Drive, ghi Sheet, đếm thống kê.
                     Admin chỉ cần dán link deploy vào webAppUrl bên dưới.
     "googleform" -> Gửi vào Google Form, hiển thị từ Sheet đã publish.
     "firebase"   -> Firestore REST API.
     Xem README.md để biết cách lấy các ID bên dưới. */
  backend: {
    provider: "appsscript",

    appsScript: {
      /* Dán link deploy của Apps Script vào đây, dạng:
         https://script.google.com/macros/s/AKfycb..../exec
         Lấy từ: Apps Script -> Deploy -> New deployment -> Web app
                 (Execute as: Me | Who has access: Anyone) */
      webAppUrl: "https://script.google.com/macros/s/AKfycbzVqs37MWmJnUKUQVd_R8YDyOvCpoCdDMIGvhUC_ztZsAL0SqnhTUGr3lzejMirPdi6-g/exec"
      /* Không có mật khẩu nào nằm ở đây. Token quản trị do admin tự nhập
         trên trang admin.html và được kiểm tra bên trong Apps Script. */
    },

    googleForm: {
      // Lấy từ URL form: https://docs.google.com/forms/d/e/<formId>/viewform
      formId: "",
      // ID của các câu hỏi trong form (dạng entry.123456789)
      entries: {
        content: "",
        category: "",
        images: ""     // câu hỏi Short answer chứa link ảnh, để trống nếu không dùng ảnh
      },
      // Sheet phản hồi -> File > Share > Publish to web
      sheetId: "",
      // Tên sheet chứa các cfs ĐÃ DUYỆT để đăng lên web
      sheetName: "Approved",
      // (Tuỳ chọn, ưu tiên hơn sheetId) Link CSV lấy từ "Publish to web"
      // dạng: https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=0&single=true&output=csv
      csvUrl: "",
      // Thứ tự cột trong sheet Approved (bắt đầu từ 0)
      columns: { number: 0, date: 1, category: 2, content: 3, images: 4 }
    },

    firebase: {
      projectId: "",
      apiKey: "",
      collection: "confessions"
    }
  },

  /* ---------- Hiển thị feed ---------- */
  feed: {
    pageSize: 9,
    // true  -> chỉ hiện ngày (ít metadata hơn, ẩn danh hơn)
    // false -> hiện cả giờ phút
    dateOnly: true
  },

  /* ---------- Gửi kèm hình ảnh ---------- */
  /* Ảnh LUÔN được vẽ lại qua canvas trước khi gửi => mọi metadata EXIF
     (GPS, model máy, giờ chụp) bị loại bỏ hoàn toàn, không có cách nào
     lần ra người gửi từ file ảnh. */
  images: {
    enabled: true,
    maxCount: 3,            // số ảnh tối đa mỗi cfs
    maxFileMB: 10,          // dung lượng file gốc tối đa
    maxDimension: 1600,     // cạnh dài nhất sau khi resize (px)
    quality: 0.82,          // chất lượng JPEG sau khi nén
    // Khuyến nghị (KHÔNG bắt buộc) che mặt trước khi đăng:
    // hiện nhãn "nên che mặt" trên ảnh chưa che + nhắc nhẹ khi gửi.
    // Người gửi vẫn đăng được nếu họ chủ ý không che.
    adviseFaceCover: true,

    /* Nơi lưu ảnh:
       "drive"      -> ⭐ KHUYÊN DÙNG. Ảnh nằm trong Google Drive của admin,
                       upload qua chính Apps Script ở backend.appsScript.
                       Không cần thêm tài khoản hay API key nào.
       "datauri"    -> nhúng thẳng vào dữ liệu (CHỈ dùng cho demo local)
       "cloudinary" -> upload unsigned, không cần đăng nhập
       "imgbb"      -> đơn giản nhất, cần API key công khai
       "firebase"   -> Firebase Storage (đi cùng provider firebase)
       Xem README.md mục 4. */
    provider: "drive",

    // provider "drive": tên thư mục sẽ được tạo trong Drive của admin
    drive: { folderName: "TGU Confessions - anh" },

    cloudinary: { cloudName: "", uploadPreset: "", folder: "confessions" },
    imgbb: { apiKey: "" },
    firebaseStorage: { bucket: "", path: "confessions" }
  },

  /* ---------- Thống kê lượt ghé trang (ẩn danh, chỉ đếm tổng) ---------- */
  /* CHỈ hoạt động khi backend.provider = "appsscript".
     Gửi lên đúng 2 thông tin: loại sự kiện + id chủ đề. TUYỆT ĐỐI không gửi
     IP, không cookie, không id thiết bị, không đường dẫn, không referrer.
     Apps Script chỉ cộng dồn vào một ô số trong Sheet — không có dòng nào
     tương ứng với một người cụ thể, nên không thể lần ra ai đã ghé trang.
     Đặt enabled = false là tắt hoàn toàn. */
  analytics: {
    enabled: true,
    // Đếm lượt mở trang (1 lần mỗi phiên làm việc của tab)
    countVisits: true,
    // Đếm số lần người xem bấm lọc theo từng chủ đề -> biết chủ đề nào được quan tâm
    countCategoryViews: true,
    // Đếm số cfs gửi theo từng chủ đề
    countSubmits: true
  },

  /* ---------- Trang quản trị (admin.html) ---------- */
  admin: {
    // Số cfs chờ duyệt tải mỗi lần
    pageSize: 20,
    // Số ngày hiển thị trên biểu đồ lượt ghé
    statsDays: 14,
    // Tự đăng xuất sau bao nhiêu phút không dùng (token chỉ nằm trong sessionStorage)
    idleLogoutMinutes: 30
  }
};
