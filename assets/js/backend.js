/* =======================================================================
   BACKEND — lớp trung gian lưu / đọc confession.
   Mọi adapter đều trả về cùng một hình dạng dữ liệu:
     { number: Number, date: "YYYY-MM-DD", category: "id", content: "..." }
   Không adapter nào gửi đi IP, user-agent, cookie hay bất kỳ ID thiết bị nào.
   ======================================================================= */
(function (window) {
  "use strict";

  var CFG = window.CFS_CONFIG || {};
  var B = (CFG.backend || {});

  /* ------------------------------ helpers ------------------------------ */
  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  /* Tách CSV chuẩn RFC-4180 (có hỗ trợ dấu " và xuống dòng trong ô) */
  function parseCSV(text) {
    var rows = [], row = [], cell = "", i = 0, q = false, c;
    while (i < text.length) {
      c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else { q = false; }
        } else { cell += c; }
      } else if (c === '"') { q = true; }
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") { cell += c; }
      i++;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); });
  }

  function normDate(v) {
    if (!v) return todayISO();
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    // dd/mm/yyyy hoặc d/m/yyyy [hh:mm:ss]
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return m[3] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0");
    var d = new Date(s);
    return isNaN(d) ? todayISO() : normDate(d.toISOString());
  }

  /* Tách danh sách link ảnh: cách nhau bằng xuống dòng, khoảng trắng hoặc " | ".
     Chỉ chấp nhận http(s) và data:image — chặn javascript:, blob:, file:... */
  var SAFE_IMG = /^(?:https?:\/\/|data:image\/)/i;

  function parseImages(v) {
    if (!v) return [];
    var list;
    if (Array.isArray(v)) list = v;
    else if (/^\s*data:image\//i.test(String(v))) list = [v];  // data URI có dấu phẩy/khoảng trắng, không được cắt
    else list = String(v).split(/[\s|,]+/);
    return list
      .map(function (s) { return String(s == null ? "" : s).trim(); })
      .filter(function (s) { return s && SAFE_IMG.test(s); });
  }

  function mapRows(rows, cols) {
    var out = [];
    rows.forEach(function (r, idx) {
      var content = String(r[cols.content] != null ? r[cols.content] : "").trim();
      var imgs = cols.images != null ? parseImages(r[cols.images]) : [];
      if (!content && !imgs.length) return;
      var num = parseInt(String(r[cols.number]).replace(/\D/g, ""), 10);
      out.push({
        number: isNaN(num) ? idx + 1 : num,
        date: normDate(r[cols.date]),
        category: String(r[cols.category] != null ? r[cols.category] : "khac").trim() || "khac",
        content: content,
        images: imgs
      });
    });
    return out;
  }

  /* =============================== LOCAL =============================== */
  /* Chế độ xem thử: dữ liệu chỉ nằm trong máy người xem, không gửi đi đâu. */
  /* Tên ẩn danh ngẫu nhiên — chỉ dùng cho chế độ DEMO. Với backend thật,
     tên do Apps Script sinh ra ở phía server (người gửi không chọn được). */
  var NICK_NOUN = ["Mèo", "Cún", "Cá Heo", "Gấu", "Cú", "Sóc", "Thỏ", "Hươu", "Panda", "Cáo",
                   "Chim Sẻ", "Rùa", "Sao Biển", "Nhím", "Vịt", "Ong", "Bướm", "Hạc", "Cừu", "Hổ Con"];
  var NICK_ADJ = ["Vô Danh", "Bí Ẩn", "Lười Biếng", "Ngái Ngủ", "Thầm Lặng", "Ẩn Mình", "Hay Cười",
                  "Mít Ướt", "Tò Mò", "Vui Tính", "Đi Ngang", "Lang Thang", "Ngơ Ngác", "Trầm Tính",
                  "Mộng Mơ", "Bối Rối", "Giấu Mặt", "Thức Khuya", "Dễ Thương", "Nhút Nhát"];

  function randomNick(taken) {
    taken = taken || [];
    for (var i = 0; i < 12; i++) {
      var nick = NICK_NOUN[Math.floor(Math.random() * NICK_NOUN.length)] + " " +
                 NICK_ADJ[Math.floor(Math.random() * NICK_ADJ.length)] + " " +
                 (10 + Math.floor(Math.random() * 90));
      if (taken.indexOf(nick) < 0) return nick;
    }
    return "Khách " + Date.now().toString().slice(-5);
  }

  var LocalAdapter = {
    id: "local",
    isDemo: true,
    KEY: "cfs-local-store",

    seed: [
      { number: 3, date: "2026-09-27", category: "crush",
        content: "Gửi bạn nữ áo vàng hay ngồi bàn cuối giảng đường B2 chiều thứ Tư: mình học kế bên suốt một học kỳ mà chưa dám bắt chuyện lần nào. Cho mình xin info nhé, hứa là người tử tế :>>",
        images: ["data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'><rect width='600' height='400' fill='%23241c3d'/><circle cx='300' cy='168' r='80' fill='%233c2c62'/><rect x='232' y='132' width='136' height='60' rx='16' fill='%230d0b16'/><text x='300' y='304' font-family='sans-serif' font-size='23' fill='%23b3adc9' text-anchor='middle'>Anh vi du - da dan nhan che mat</text></svg>"] },
      { number: 2, date: "2026-09-26", category: "hoctap", content: "Deadline chồng deadline, mình ngủ 4 tiếng một ngày và vẫn thấy mình chưa làm đủ. Có ai giống mình không, hay chỉ mình dở thôi?\n\nDù gì cũng còn 3 tuần nữa là hết kỳ. Cố lên nha mọi người." },
      { number: 1, date: "2026-09-25", category: "vui", content: "Confession đầu tiên của page! Chúc page sống lâu, đừng như mấy page cfs khác đăng được 20 bài rồi mất tích :))" }
    ],

    _read: function () {
      try {
        var raw = localStorage.getItem(this.KEY);
        if (!raw) return this.seed.slice();
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : this.seed.slice();
      } catch (e) { return this.seed.slice(); }
    },

    list: function () {
      var items = this._read().slice().sort(function (a, b) { return b.number - a.number; });
      items.forEach(function (x) {
        if (!Array.isArray(x.images)) x.images = [];
        x.likes = Math.max(0, Number(x.likes) || 0);
        x.dislikes = Math.max(0, Number(x.dislikes) || 0);
        x.comments = Math.max(0, Number(x.comments) || 0);
      });
      return Promise.resolve(items);
    },

    submit: function (data) {
      var self = this;
      return new Promise(function (resolve) {
        var items = self._read();
        var max = items.reduce(function (m, x) { return Math.max(m, x.number || 0); }, 0);
        var num = max + 1;
        var imgs = parseImages(data.images);
        items.push({
          number: num, date: todayISO(),
          category: data.category, content: data.content,
          images: imgs, likes: 0, dislikes: 0
        });
        try { localStorage.setItem(self.KEY, JSON.stringify(items)); } catch (e) {}
        // giả lập độ trễ mạng cho mượt
        setTimeout(function () {
          resolve({
            ok: true, number: num, nextNumber: num + 1,
            // không ảnh -> lên bảng tin luôn, có ảnh -> chờ duyệt
            status: imgs.length ? "pending" : "approved"
          });
        }, 700);
      });
    },

    /* ---- thương / không đồng tình (chỉ trong máy này) ---- */
    react: function (number, like, dislike) {
      var self = this;
      return new Promise(function (resolve, reject) {
        var items = self._read();
        var hit = null;
        items.forEach(function (x) { if (x.number === Number(number)) hit = x; });
        if (!hit) return reject(new Error("Không tìm thấy confession số " + number + "."));
        var d = function (v) { v = Number(v) || 0; return v > 0 ? 1 : (v < 0 ? -1 : 0); };
        hit.likes = Math.max(0, (Number(hit.likes) || 0) + d(like));
        hit.dislikes = Math.max(0, (Number(hit.dislikes) || 0) + d(dislike));
        try { localStorage.setItem(self.KEY, JSON.stringify(items)); } catch (e) {}
        resolve({ ok: true, number: Number(number), likes: hit.likes, dislikes: hit.dislikes });
      });
    },

    /* Số mà cfs gửi lúc này sẽ nhận — dùng để hiện trước trong ô gửi */
    nextNumber: function () {
      var max = this._read().reduce(function (m, x) { return Math.max(m, x.number || 0); }, 0);
      return Promise.resolve(max + 1);
    },

    /* ---- bình luận (chỉ nằm trong máy này, đúng tinh thần DEMO) ---- */
    CKEY: "cfs-local-comments",

    _readC: function () {
      try {
        var raw = localStorage.getItem(this.CKEY);
        var o = raw ? JSON.parse(raw) : {};
        return (o && typeof o === "object") ? o : {};
      } catch (e) { return {}; }
    },

    comments: function (number) {
      var all = this._readC()[String(number)] || [];
      return Promise.resolve(all.slice());
    },

    comment: function (number, content) {
      var self = this;
      return new Promise(function (resolve, reject) {
        var items = self._read();
        var exists = items.some(function (x) { return x.number === Number(number); });
        if (!exists) return reject(new Error("Không tìm thấy confession số " + number + "."));
        var store = self._readC();
        var key = String(number);
        var list = store[key] || [];
        var c = {
          name: randomNick(list.map(function (x) { return x.name; })),
          content: String(content),
          date: todayISO()
        };
        list.push(c);
        store[key] = list;
        try { localStorage.setItem(self.CKEY, JSON.stringify(store)); } catch (e) {}
        setTimeout(function () { resolve({ ok: true, comment: c, count: list.length }); }, 320);
      });
    }
  };

  /* ============================ GOOGLE FORM ============================ */
  /* Gửi: POST vào Google Form (không đăng nhập, không thu email).
     Đọc: Google Sheet đã "Publish to web". Không key bí mật nào nằm trong repo. */
  var GoogleFormAdapter = {
    id: "googleform",
    isDemo: false,

    get cfg() { return B.googleForm || {}; },

    _readUrl: function () {
      var c = this.cfg;
      if (c.csvUrl) return c.csvUrl;
      if (!c.sheetId) return null;
      return "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(c.sheetId) +
             "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(c.sheetName || "Approved");
    },

    list: function () {
      var url = this._readUrl();
      var cols = this.cfg.columns || { number: 0, date: 1, category: 2, content: 3 };
      if (!url) return Promise.resolve([]);

      return fetch(url + (url.indexOf("?") > -1 ? "&" : "?") + "_=" + Date.now(), {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store"
      })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        })
        .then(function (txt) {
          var rows = parseCSV(txt);
          // Bỏ hàng tiêu đề nếu ô "number" không phải số
          if (rows.length && isNaN(parseInt(String(rows[0][cols.number]).replace(/\D/g, ""), 10))) rows.shift();
          return mapRows(rows, cols).sort(function (a, b) { return b.number - a.number; });
        });
    },

    submit: function (data) {
      var c = this.cfg;
      if (!c.formId || !c.entries || !c.entries.content) {
        return Promise.reject(new Error("Chưa cấu hình Google Form trong assets/js/config.js"));
      }
      var body = new FormData();
      body.append(c.entries.content, data.content);
      if (c.entries.category) body.append(c.entries.category, data.category);
      if (c.entries.images && data.images && data.images.length) {
        body.append(c.entries.images, data.images.join("\n"));
      }

      // no-cors: trình duyệt không đọc được phản hồi nhưng Google vẫn nhận.
      // Không gửi cookie, không gửi referrer.
      return fetch("https://docs.google.com/forms/d/e/" + encodeURIComponent(c.formId) + "/formResponse", {
        method: "POST",
        mode: "no-cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        body: body
      });
    }
  };

  /* ============================== FIREBASE ============================== */
  /* Firestore REST. Rule nên đặt: cho create, chỉ cho read khi approved == true. */
  var FirebaseAdapter = {
    id: "firebase",
    isDemo: false,

    get cfg() { return B.firebase || {}; },

    _base: function () {
      var c = this.cfg;
      return "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(c.projectId) +
             "/databases/(default)/documents";
    },

    list: function () {
      var c = this.cfg;
      if (!c.projectId || !c.apiKey) return Promise.resolve([]);

      var query = {
        structuredQuery: {
          from: [{ collectionId: c.collection || "confessions" }],
          where: {
            fieldFilter: { field: { fieldPath: "approved" }, op: "EQUAL", value: { booleanValue: true } }
          },
          orderBy: [{ field: { fieldPath: "number" }, direction: "DESCENDING" }],
          limit: 500
        }
      };

      return fetch(this._base() + ":runQuery?key=" + encodeURIComponent(c.apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        body: JSON.stringify(query)
      })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (rows) {
          return (rows || [])
            .filter(function (r) { return r && r.document && r.document.fields; })
            .map(function (r) {
              var f = r.document.fields;
              function s(k, dflt) { return f[k] && f[k].stringValue != null ? f[k].stringValue : dflt; }
              var imgs = [];
              if (f.images && f.images.arrayValue && f.images.arrayValue.values) {
                imgs = f.images.arrayValue.values.map(function (v) { return v.stringValue; }).filter(Boolean);
              }
              return {
                number: f.number ? parseInt(f.number.integerValue || f.number.doubleValue || 0, 10) : 0,
                date: normDate(s("date", "")),
                category: s("category", "khac"),
                content: s("content", ""),
                images: parseImages(imgs)
              };
            })
            .filter(function (x) { return x.content || x.images.length; });
        });
    },

    submit: function (data) {
      var c = this.cfg;
      if (!c.projectId || !c.apiKey) {
        return Promise.reject(new Error("Chưa cấu hình Firebase trong assets/js/config.js"));
      }
      var payload = {
        fields: {
          content:  { stringValue: data.content },
          category: { stringValue: data.category },
          date:     { stringValue: todayISO() },
          approved: { booleanValue: false },
          number:   { integerValue: "0" },
          images:   { arrayValue: { values: parseImages(data.images).map(function (u) { return { stringValue: u }; }) } }
        }
      };
      return fetch(this._base() + "/" + encodeURIComponent(c.collection || "confessions") +
                   "?key=" + encodeURIComponent(c.apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }
  };

  /* ============================ ẢNH: UPLOAD ============================ */
  /* Nhận Blob JPEG đã được canvas vẽ lại (không còn EXIF) và trả về link.
     Không provider nào cần người gửi đăng nhập. */
  var IMG_CFG = CFG.images || {};

  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error("Không đọc được ảnh.")); };
      fr.readAsDataURL(blob);
    });
  }

  var IMAGE_UPLOADERS = {
    /* Nhúng thẳng vào dữ liệu — chỉ hợp với demo local (không tốn hạ tầng). */
    datauri: function (blob) { return blobToDataURL(blob); },

    /* Google Drive: ảnh đi kèm ngay trong lời gọi submit dưới dạng data URL,
       Apps Script (apps-script/Code.gs) lưu vào thư mục Drive của admin, đặt
       quyền "ai có link cũng xem" rồi trả về link thật. Không cần API key. */
    drive: function (blob) { return blobToDataURL(blob); },

    /* Cloudinary unsigned upload: an toàn nhất cho trang tĩnh.
       upload_preset do admin tạo, có thể bật kiểm duyệt + giới hạn dung lượng. */
    cloudinary: function (blob) {
      var c = IMG_CFG.cloudinary || {};
      if (!c.cloudName || !c.uploadPreset) {
        return Promise.reject(new Error("Chưa cấu hình Cloudinary trong assets/js/config.js"));
      }
      var fd = new FormData();
      fd.append("file", blob, "cfs.jpg");
      fd.append("upload_preset", c.uploadPreset);
      if (c.folder) fd.append("folder", c.folder);

      return fetch("https://api.cloudinary.com/v1_1/" + encodeURIComponent(c.cloudName) + "/image/upload", {
        method: "POST", credentials: "omit", referrerPolicy: "no-referrer", body: fd
      }).then(function (r) {
        if (!r.ok) throw new Error("Cloudinary trả về HTTP " + r.status);
        return r.json();
      }).then(function (j) {
        if (!j.secure_url) throw new Error("Cloudinary không trả về link ảnh.");
        return j.secure_url;
      });
    },

    /* ImgBB: nhanh gọn, cần API key (công khai trong repo, nên bật giới hạn). */
    imgbb: function (blob) {
      var key = (IMG_CFG.imgbb || {}).apiKey;
      if (!key) return Promise.reject(new Error("Chưa cấu hình ImgBB apiKey trong assets/js/config.js"));
      return blobToDataURL(blob).then(function (d) {
        var fd = new FormData();
        fd.append("image", String(d).split(",")[1]);
        return fetch("https://api.imgbb.com/1/upload?key=" + encodeURIComponent(key), {
          method: "POST", credentials: "omit", referrerPolicy: "no-referrer", body: fd
        });
      }).then(function (r) {
        if (!r.ok) throw new Error("ImgBB trả về HTTP " + r.status);
        return r.json();
      }).then(function (j) {
        if (!j.data || !j.data.url) throw new Error("ImgBB không trả về link ảnh.");
        return j.data.url;
      });
    },

    /* Firebase Storage REST — dùng chung project với provider firebase. */
    firebase: function (blob) {
      var c = IMG_CFG.firebaseStorage || {};
      if (!c.bucket) return Promise.reject(new Error("Chưa cấu hình firebaseStorage.bucket trong assets/js/config.js"));
      var name = (c.path || "confessions") + "/" +
                 Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + ".jpg";

      return fetch("https://firebasestorage.googleapis.com/v0/b/" + encodeURIComponent(c.bucket) +
                   "/o?uploadType=media&name=" + encodeURIComponent(name), {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        credentials: "omit", referrerPolicy: "no-referrer",
        body: blob
      }).then(function (r) {
        if (!r.ok) throw new Error("Firebase Storage trả về HTTP " + r.status);
        return r.json();
      }).then(function (j) {
        var token = j.downloadTokens || (j.metadata && j.metadata.downloadTokens);
        return "https://firebasestorage.googleapis.com/v0/b/" + c.bucket +
               "/o/" + encodeURIComponent(j.name || name) + "?alt=media" +
               (token ? "&token=" + token : "");
      });
    }
  };

  var imgProvider = IMAGE_UPLOADERS[IMG_CFG.provider] || IMAGE_UPLOADERS.datauri;

  /* Provider nào gửi ảnh kèm luôn trong lời gọi submit (dạng data URL)
     thay vì upload trước rồi gửi link:
       - "datauri" : nhúng thẳng vào dữ liệu (demo local)
       - "drive"   : Apps Script nhận data URL rồi tự lưu vào Drive của admin */
  var INLINE_PROVIDERS = { datauri: 1200, drive: IMG_CFG.maxDimension || 1600 };
  var imgProviderName = IMG_CFG.provider || "datauri";

  window.CFS_IMAGES = {
    enabled: IMG_CFG.enabled !== false,
    provider: imgProviderName,
    /* true khi ảnh được nhúng trực tiếp vào dữ liệu gửi đi */
    isInline: !!INLINE_PROVIDERS[imgProviderName],
    /* cạnh dài tối đa khi nhúng inline (demo local phải nhỏ vì localStorage ~5MB) */
    inlineMaxDim: INLINE_PROVIDERS[imgProviderName] || 1200,
    upload: function (blob) { return imgProvider(blob); }
  };

  /* ============================= APPS SCRIPT ============================= */
  /* Backend chạy trong Google Drive của admin (apps-script/Code.gs).
     Gửi POST với Content-Type text/plain để tránh preflight OPTIONS —
     Apps Script không trả lời OPTIONS, nên đây là cách duy nhất chạy được
     cross-origin mà không cần proxy. */
  /* Chuẩn hoá danh sách cfs trả về từ Apps Script */
  function mapItems(j) {
    return (j.items || []).map(function (x) {
      return {
        number: parseInt(x.number, 10) || 0,
        date: normDate(x.date),
        category: String(x.category || "khac"),
        content: String(x.content || ""),
        images: parseImages(x.images),
        comments: parseInt(x.comments, 10) || 0,
        likes: Math.max(0, parseInt(x.likes, 10) || 0),
        dislikes: Math.max(0, parseInt(x.dislikes, 10) || 0)
      };
    }).filter(function (x) { return x.content || x.images.length; })
      .sort(function (a, b) { return b.number - a.number; });
  }

  var AppsScriptAdapter = {
    id: "appsscript",
    isDemo: false,
    _cache: null,

    get url() { return (B.appsScript || {}).webAppUrl || ""; },

    _call: function (payload) {
      var url = this.url;
      if (!url) {
        return Promise.reject(new Error(
          "Chưa cấu hình backend.appsScript.webAppUrl trong assets/js/config.js"));
      }
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "follow",
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error("Apps Script trả về HTTP " + r.status);
        return r.text();
      }).then(function (txt) {
        var j;
        try { j = JSON.parse(txt); }
        catch (e) {
          throw new Error("Apps Script không trả về JSON. Kiểm tra lại: Deploy phải đặt " +
                          "'Who has access' = Anyone, và đã Deploy phiên bản mới nhất.");
        }
        if (!j.ok) throw new Error(j.error || "Apps Script báo lỗi không rõ.");
        return j;
      });
    },

    list: function () {
      // bootstrap() đã lấy sẵn danh sách -> dùng luôn, khỏi gọi mạng lần hai
      if (this._cache) {
        var c = this._cache;
        this._cache = null;
        return Promise.resolve(c);
      }
      return this._call({ action: "list" }).then(mapItems);
    },

    /* Một lượt gọi lấy cả cài đặt của admin lẫn danh sách cfs */
    bootstrap: function () {
      var self = this;
      return this._call({ action: "bootstrap" }).then(function (j) {
        self._cache = mapItems(j);
        return {
          settings: j.settings || null,
          items: self._cache,
          nextNumber: parseInt(j.nextNumber, 10) || null
        };
      });
    },

    /* Số mà cfs gửi lúc này sẽ nhận (tính cả cfs đang chờ duyệt) */
    nextNumber: function () {
      return this._call({ action: "list" }).then(function (j) {
        return parseInt(j.nextNumber, 10) || null;
      });
    },

    /* ---- bình luận: tên ẩn danh do server random ---- */
    comments: function (number) {
      return this._call({ action: "comments", number: number }).then(function (j) {
        return (j.items || []).map(function (c) {
          return {
            name: String(c.name || "Ẩn danh"),
            content: String(c.content || ""),
            date: normDate(c.date)
          };
        });
      });
    },

    comment: function (number, content) {
      return this._call({ action: "comment", number: number, content: content });
    },

    /* Thương / không đồng tình: mỗi lượt gọi đổi tối đa 1 đơn vị mỗi loại */
    react: function (number, like, dislike) {
      return this._call({ action: "react", number: number, like: like || 0, dislike: dislike || 0 });
    },

    /* images là mảng data URL — Apps Script sẽ lưu vào Drive và trả link thật */
    submit: function (data) {
      return this._call({
        action: "submit",
        content: data.content,
        category: data.category,
        images: Array.isArray(data.images) ? data.images : []
      });
    },

    ping: function (payload) {
      payload.action = "ping";
      return this._call(payload);
    }
  };

  /* ============================== FACADE ============================== */
  var ADAPTERS = {
    local: LocalAdapter,
    appsscript: AppsScriptAdapter,
    googleform: GoogleFormAdapter,
    firebase: FirebaseAdapter
  };

  var active = ADAPTERS[B.provider] || LocalAdapter;

  /* Chọn appsscript nhưng chưa dán link -> về chế độ demo kèm nhắc nhở,
     để trang vẫn xem được thay vì trắng trơn. */
  if (active === AppsScriptAdapter && !AppsScriptAdapter.url) {
    active = LocalAdapter;
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[CFS] backend.provider = \"appsscript\" nhưng chưa có webAppUrl. " +
        "Đang chạy tạm chế độ DEMO. Dán link deploy của Apps Script vào " +
        "backend.appsScript.webAppUrl trong assets/js/config.js.");
    }
  }

  window.CFS_BACKEND = {
    name: active.id,
    isDemo: !!active.isDemo,
    /* true nếu provider có thể trả về cài đặt do admin đặt trên trang quản trị */
    hasSettings: !!active.bootstrap,
    /* true nếu provider lưu được bình luận */
    hasComments: !!(active.comments && active.comment),
    /* true nếu provider đếm được thương / không đồng tình */
    hasReactions: !!active.react,
    list: function () { return active.list(); },
    submit: function (data) { return active.submit(data); },
    /* ---- bình luận ---- */
    comments: function (number) {
      if (!active.comments) return Promise.resolve([]);
      return active.comments(number);
    },
    comment: function (number, content) {
      if (!active.comment) {
        return Promise.reject(new Error("Provider hiện tại không lưu được bình luận."));
      }
      return active.comment(number, content);
    },
    /* ---- thương / không đồng tình ---- */
    react: function (number, like, dislike) {
      if (!active.react) {
        return Promise.reject(new Error("Provider hiện tại không đếm được lượt thương."));
      }
      return active.react(number, like, dislike);
    },
    /* Số thứ tự mà cfs gửi lúc này sẽ nhận. Provider không hỗ trợ -> null,
       lúc đó trang tự đoán bằng số lớn nhất trên bảng tin + 1. */
    nextNumber: function () {
      if (!active.nextNumber) return Promise.resolve(null);
      return active.nextNumber().catch(function () { return null; });
    },
    /* Lấy cài đặt + danh sách trong một lượt. Lỗi thì trả về rỗng, không chặn trang. */
    bootstrap: function () {
      if (!active.bootstrap) return Promise.resolve({ settings: null, items: null, nextNumber: null });
      return active.bootstrap().catch(function (err) {
        console.warn("[CFS] Không lấy được cài đặt:", err && err.message);
        return { settings: null, items: null, nextNumber: null };
      });
    },
    /* Dự phòng: nếu provider thật lỗi, vẫn hiển thị được gì đó thay vì trang trắng */
    listSafe: function () {
      return active.list().catch(function (err) {
        console.warn("[CFS] Không tải được confession:", err && err.message);
        return [];
      });
    }
  };

  /* ======================== THỐNG KÊ ẨN DANH ========================
     Gửi đúng 2 thứ: loại sự kiện + id chủ đề. Không gửi IP (Apps Script
     không cấp IP cho script), không cookie, không id thiết bị, không
     đường dẫn, không referrer. Bên Apps Script chỉ cộng dồn vào một ô số,
     nên không tồn tại dòng dữ liệu nào ứng với một người cụ thể.
     Gọi kiểu "bắn rồi quên": lỗi thì bỏ qua, không bao giờ chặn UI. */
  function anCfg() { return CFG.analytics || {}; }

  /* Đọc cờ mỗi lần gọi, vì admin có thể tắt/bật từ trang quản trị */
  function statsOn() {
    return anCfg().enabled !== false && active.id === "appsscript" && !!AppsScriptAdapter.url;
  }

  function beacon(payload) {
    if (!statsOn()) return;
    payload.action = "ping";
    var url = AppsScriptAdapter.url;
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        // text/plain: là "simple request", không kích hoạt preflight
        if (navigator.sendBeacon(url, new Blob([body], { type: "text/plain;charset=UTF-8" }))) return;
      }
    } catch (e) {}
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        credentials: "omit", referrerPolicy: "no-referrer",
        keepalive: true, body: body
      }).catch(function () {});
    } catch (e) {}
  }

  window.CFS_STATS = {
    get enabled() { return statsOn(); },

    /* Đếm 1 lượt mở trang cho mỗi phiên của tab.
       sessionStorage mất khi đóng tab và không dùng được để nhận dạng ai. */
    visit: function () {
      if (!statsOn() || anCfg().countVisits === false) return;
      try {
        if (sessionStorage.getItem("cfs-visit-counted")) return;
        sessionStorage.setItem("cfs-visit-counted", "1");
      } catch (e) { /* chặn storage thì vẫn đếm, chỉ là có thể đếm trùng */ }
      beacon({ type: "visit" });
    },

    /* Người xem bấm lọc theo chủ đề -> biết chủ đề nào được quan tâm */
    categoryView: function (cat) {
      if (!statsOn() || anCfg().countCategoryViews === false) return;
      if (!cat || cat === "all") return;
      beacon({ type: "catview", category: cat });
    }
  };
})(window);
