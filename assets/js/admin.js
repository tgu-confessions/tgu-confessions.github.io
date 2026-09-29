/* =======================================================================
   ADMIN — bảng điều khiển duyệt confession + thống kê.

   Bảo mật: token quản trị CHỈ nằm trong sessionStorage (mất khi đóng tab),
   không bao giờ ghi vào localStorage, không nằm trong repo. Mọi lệnh đều
   được Apps Script kiểm tra token ở phía server trước khi thực hiện.
   ======================================================================= */
(function () {
  "use strict";

  var CFG = window.CFS_CONFIG || {};
  var ADM = CFG.admin || {};
  var CATS = CFG.categories || [];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var K_URL = "cfs-admin-url";        // localStorage: chỉ là địa chỉ API, không phải bí mật
  var K_USER = "cfs-admin-user";      // localStorage: tên đăng nhập, để khỏi gõ lại
  var K_TOKEN = "cfs-admin-session";  // sessionStorage: phiên đăng nhập, mất khi đóng tab

  var state = {
    url: "", token: "", pending: [], approved: [], comments: [],
    nextNumber: 1, keyword: "", cmtKeyword: "", tab: "pending",
    info: null, settings: null
  };

  /* ============================ tiện ích ============================ */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function catOf(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i];
    return { id: "khac", label: "Khác", emoji: "✨" };
  }
  function fmtDate(iso) {
    var p = String(iso || "").split("-");
    return p.length >= 3 ? p[2] + "/" + p[1] + "/" + p[0] : (iso || "");
  }
  function fmtWhen(s) {
    if (!s) return "";
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s).slice(0, 16).replace("T", " ");
    var p = function (n) { return String(n).padStart(2, "0"); };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function toast(msg, kind) {
    var wrap = $("#toastWrap");
    if (!wrap) return;
    var el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.classList.add("is-out");
      setTimeout(function () { el.remove(); }, 320);
    }, 4000);
  }

  /* ============================ gọi API ============================ */
  function api(action, payload) {
    if (!state.url) return Promise.reject(new Error("Chưa có link Apps Script."));
    var body = Object.assign({ action: action, token: state.token }, payload || {});

    /* Có mạng chặn script.google.com, hoặc tiện ích chặn request -> fetch treo
       vô hạn. Đặt hạn 15 giây để báo lỗi rõ ràng thay vì xoay mãi. */
    var ctrl = null, timer = null;
    try { ctrl = new AbortController(); } catch (e) {}
    var opts = {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "follow",
      body: JSON.stringify(body)
    };
    if (ctrl) {
      opts.signal = ctrl.signal;
      timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 15000);
    }
    var done = function () { if (timer) clearTimeout(timer); };

    return fetch(state.url, opts).then(function (r) {
      done();
      if (!r.ok) throw new Error("Apps Script trả về HTTP " + r.status);
      return r.text();
    }, function (err) {
      done();
      var msg = String((err && err.message) || err);
      if (err && err.name === "AbortError") {
        throw new Error("Gọi Apps Script quá 15 giây không phản hồi. Thường do mạng hoặc tiện ích " +
                        "trình duyệt chặn script.google.com — thử cửa sổ ẩn danh, hoặc đổi mạng (4G).");
      }
      throw new Error("Không kết nối được Apps Script (" + msg + "). Kiểm tra mạng, tiện ích chặn " +
                      "quảng cáo, và Deploy phải đặt Who has access = Anyone.");
    }).then(function (txt) {
      var j;
      try { j = JSON.parse(txt); }
      catch (e) {
        throw new Error("Phản hồi không phải JSON. Kiểm tra: Deploy → Who has access = Anyone, " +
                        "và đã Deploy phiên bản mới nhất.");
      }
      if (!j.ok) {
        var err = new Error(j.error || "Apps Script báo lỗi.");
        err.auth = j.auth === false;
        throw err;
      }
      return j;
    });
  }

  function guard(err) {
    if (err && err.auth) { logout("Token không đúng hoặc đã bị đổi. Đăng nhập lại nhé."); return; }
    toast(err && err.message ? err.message : "Có lỗi xảy ra.", "err");
  }

  /* Link Apps Script lấy thẳng từ assets/js/config.js — admin không phải gõ.
     Vẫn nhận link đã lưu trên máy để không làm hỏng cài đặt cũ. */
  function backendUrl() {
    var fromCfg = (CFG.backend && CFG.backend.appsScript && CFG.backend.appsScript.webAppUrl) || "";
    if (/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/.test(fromCfg)) return fromCfg;
    var saved = "";
    try { saved = localStorage.getItem(K_URL) || ""; } catch (e) {}
    return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/.test(saved) ? saved : "";
  }

  /* ============================ đăng nhập ============================ */
  function initGate() {
    var form = $("#gateForm"), user = $("#gUser"), pass = $("#gPass"),
        err = $("#gateError"), btn = $("#gateBtn");

    try { user.value = localStorage.getItem(K_USER) || ""; } catch (e) {}
    if (!user.value) user.focus(); else pass.focus();

    $("#gEye").addEventListener("click", function () {
      var show = pass.type === "password";
      pass.type = show ? "text" : "password";
      this.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
      this.classList.toggle("is-on", show);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      err.hidden = true;

      var u = backendUrl(), un = user.value.trim(), pw = pass.value;
      if (!u) {
        err.innerHTML = "Chưa nối backend: mở <code>assets/js/config.js</code> và dán link deploy của " +
                        "Apps Script vào <code>backend.appsScript.webAppUrl</code> (xem README mục 2).";
        err.hidden = false; return;
      }
      if (!un || !pw) {
        err.textContent = "Nhập đủ tên đăng nhập và mật khẩu nhé.";
        err.hidden = false; (un ? pass : user).focus(); return;
      }

      btn.classList.add("is-loading"); btn.disabled = true;
      $(".btn-label", btn).textContent = "Đang đăng nhập...";

      state.url = u;
      state.token = "";
      api("login", { user: un, pass: pw }).then(function (j) {
        state.token = j.token || "";
        try { localStorage.setItem(K_URL, u); localStorage.setItem(K_USER, un); } catch (e) {}
        try { sessionStorage.setItem(K_TOKEN, state.token); } catch (e) {}
        pass.value = "";     // không giữ mật khẩu trong DOM
        enterAdmin(j.info, j.settings);
      }).catch(function (ex) {
        state.token = "";
        err.textContent = ex.message;
        err.hidden = false;
        pass.select();
      }).then(function () {
        btn.classList.remove("is-loading"); btn.disabled = false;
        $(".btn-label", btn).textContent = "Vào trang quản trị";
      });
    });
  }

  function enterAdmin(info, settings) {
    $("#gate").hidden = true;
    $("#admin").hidden = false;
    applyInfo(info);
    if (settings) fillSettings(settings);
    resetIdle();
    loadAll();
  }

  function applyInfo(info) {
    if (!info) return;
    state.info = info;
    if (info.sheet) $("#adSheet").textContent = info.sheet;
    state.nextNumber = info.nextNumber || 1;

    // Nhắc đổi mật khẩu mặc định — nó nằm công khai trong Code.gs
    $("#pwWarn").hidden = !info.usingDefaultPassword;
    if (info.user) $("#pUser").value = info.user;

    var links = $("#setLinks");
    if (links) {
      links.innerHTML =
        (info.sheetUrl ? '<li><a href="' + esc(info.sheetUrl) + '" target="_blank" rel="noopener noreferrer">📄 ' +
          esc(info.sheet || "Google Sheet") + "</a><small>nơi lưu toàn bộ confession</small></li>" : "") +
        (info.folderUrl ? '<li><a href="' + esc(info.folderUrl) + '" target="_blank" rel="noopener noreferrer">🗂️ ' +
          esc(info.folder || "Thư mục ảnh") + "</a><small>ảnh của cfs trong Drive của bạn</small></li>" : "") +
        '<li><span>👤 ' + esc(info.user || "admin") + "</span><small>tài khoản đang đăng nhập</small></li>";
    }
  }

  function logout(msg) {
    if (state.token) api("logout").catch(function () {});
    try { sessionStorage.removeItem(K_TOKEN); } catch (e) {}
    state.token = ""; state.pending = []; state.approved = []; state.info = null;
    $("#admin").hidden = true;
    $("#gate").hidden = false;
    $("#gPass").value = "";
    if (msg) {
      var err = $("#gateError");
      err.textContent = msg; err.hidden = false;
    }
  }

  /* Tự đăng xuất khi để yên quá lâu */
  var idleTimer = null;
  function resetIdle() {
    clearTimeout(idleTimer);
    var mins = ADM.idleLogoutMinutes || 30;
    idleTimer = setTimeout(function () {
      logout("Đã tự đăng xuất sau " + mins + " phút không hoạt động.");
    }, mins * 60000);
  }

  /* ============================ tải dữ liệu ============================ */
  function loadAll() {
    return Promise.all([
      api("pending").then(function (j) { state.pending = j.items || []; }),
      api("approved").then(function (j) { state.approved = j.items || []; }),
      api("adminComments", { limit: 300 }).then(function (j) { state.comments = j.items || []; })
        .catch(function () { state.comments = []; }),
      api("session").then(function (j) { applyInfo(j.info); if (j.settings) fillSettings(j.settings); })
    ]).then(function () {
      renderCounts();
      renderPending();
      renderApproved();
      renderComments();
      if (state.tab === "stats") loadStats();
    }).catch(guard);
  }

  function renderCounts() {
    $("#cntPending").textContent = state.pending.length;
    $("#cntApproved").textContent = state.approved.length;
    var cc = $("#cntComments");
    if (cc) cc.textContent = state.comments.length;
    $("#nextNo").textContent = "#" + state.nextNumber;
  }

  /* ========================= bình luận ========================= */
  function commentRowHTML(c) {
    return '' +
      '<article class="ad-cmt" data-cmt-id="' + esc(c.id) + '">' +
        '<div class="ad-cmt-top">' +
          '<span class="ad-cmt-no">#' + (c.cfsNumber || "?") + "</span>" +
          '<span class="ad-cmt-name">' + esc(c.name) + "</span>" +
          '<span class="ad-when">' + esc(fmtWhen(c.createdAt) || fmtDate(c.date)) + "</span>" +
          '<button class="btn btn-ghost btn-sm danger" type="button" data-act="rmCmt">Xoá</button>' +
        "</div>" +
        '<p class="ad-cmt-text">' + esc(c.content) + "</p>" +
      "</article>";
  }

  function renderComments() {
    var box = $("#listComments");
    if (!box) return;
    var kw = (state.cmtKeyword || "").toLowerCase();
    var list = state.comments.filter(function (c) {
      if (!kw) return true;
      if (kw.charAt(0) === "#") return String(c.cfsNumber).indexOf(kw.slice(1).replace(/\D/g, "")) === 0;
      return (c.content || "").toLowerCase().indexOf(kw) > -1 ||
             (c.name || "").toLowerCase().indexOf(kw) > -1;
    });
    box.innerHTML = list.map(commentRowHTML).join("");
    var empty = $("#emptyComments");
    if (empty) {
      empty.hidden = list.length > 0;
      empty.textContent = (!list.length && kw) ? "Không tìm thấy bình luận nào khớp."
                                               : "Chưa có bình luận nào.";
    }
  }

  /* ============================ thẻ cfs ============================ */
  function catSelect(id, sel) {
    return '<select class="input sel" data-field="category" aria-label="Chủ đề">' +
      CATS.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" +
               c.emoji + " " + esc(c.label) + "</option>";
      }).join("") + "</select>";
  }

  function imagesHTML(it) {
    if (!it.images || !it.images.length) return "";
    return '<ul class="ad-imgs">' + it.images.map(function (src, i) {
      return '<li class="ad-img">' +
        '<img src="' + esc(src) + '" alt="Ảnh ' + (i + 1) + ' của cfs" loading="lazy" ' +
        'data-shot="' + esc(src) + '">' +
        '<button type="button" class="ad-img-x" data-dropimg="' + i + '" ' +
        'aria-label="Bỏ ảnh ' + (i + 1) + ' khỏi cfs này" title="Bỏ ảnh này">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
        '<path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
        "</li>";
    }).join("") + "</ul>";
  }

  function cardHTML(it, mode) {
    var c = catOf(it.category);
    var isPending = mode === "pending";
    return '' +
      '<article class="ad-card" data-id="' + esc(it.id) + '" data-mode="' + mode + '">' +
        '<header class="ad-top">' +
          (isPending
            ? '<span class="ad-no is-hold" title="Số đã cấp cho người gửi ngay lúc họ bấm gửi">#' +
                (it.number || "?") + "</span>" +
              '<span class="ad-when">' + esc(fmtWhen(it.submittedAt)) + "</span>"
            : '<span class="ad-no">#' + (it.number || "?") + "</span>") +
          '<span class="ad-cat"><span aria-hidden="true">' + c.emoji + "</span> " + esc(c.label) + "</span>" +
          (isPending ? "" : '<span class="ad-when">' + esc(fmtDate(it.date)) + "</span>") +
          (isPending ? "" :
            '<span class="ad-react" title="Thương · Không đồng tình · Bình luận">💗 ' +
              (it.likes || 0) + " · 👎 " + (it.dislikes || 0) + " · 💬 " + (it.comments || 0) + "</span>") +
          '<span class="ad-len" title="Số ký tự">' + it.content.length + " ký tự</span>" +
        "</header>" +

        '<textarea class="input ad-text" data-field="content" rows="5" ' +
          'aria-label="Nội dung confession">' + esc(it.content) + "</textarea>" +

        imagesHTML(it) +

        '<footer class="ad-foot">' +
          '<div class="ad-fields">' +
            catSelect(it.id, it.category) +
            '<label class="numbox">#<input class="input" type="number" min="1" step="1" ' +
              'data-field="number" value="' + (it.number || (isPending ? state.nextNumber : "")) + '" ' +
              'aria-label="Số thứ tự cfs"></label>' +
          "</div>" +
          '<div class="ad-btns">' +
            (isPending
              ? '<button class="btn btn-primary btn-sm" type="button" data-act="approve">Duyệt &amp; đăng</button>' +
                '<button class="btn btn-ghost btn-sm" type="button" data-act="reject">Từ chối</button>'
              : '<button class="btn btn-primary btn-sm" type="button" data-act="save">Lưu thay đổi</button>' +
                '<button class="btn btn-ghost btn-sm" type="button" data-act="unapprove">Gỡ khỏi bảng tin</button>') +
            '<button class="btn btn-ghost btn-sm danger" type="button" data-act="remove">Xoá hẳn</button>' +
          "</div>" +
        "</footer>" +
      "</article>";
  }

  function renderPending() {
    var box = $("#listPending");
    box.innerHTML = state.pending.map(function (it) { return cardHTML(it, "pending"); }).join("");
    $("#emptyPending").hidden = state.pending.length > 0;
  }

  function renderApproved() {
    var kw = state.keyword.toLowerCase();
    var list = state.approved.filter(function (it) {
      if (!kw) return true;
      if (kw.charAt(0) === "#") return String(it.number).indexOf(kw.slice(1).replace(/\D/g, "")) === 0;
      return it.content.toLowerCase().indexOf(kw) > -1;
    });
    var box = $("#listApproved");
    box.innerHTML = list.map(function (it) { return cardHTML(it, "approved"); }).join("");
    $("#emptyApproved").hidden = list.length > 0;
    if (!list.length && kw) $("#emptyApproved").textContent = "Không tìm thấy cfs nào khớp.";
  }

  /* ============================ hành động ============================ */
  function findItem(id) {
    var all = state.pending.concat(state.approved);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function cardPayload(card) {
    var it = findItem(card.dataset.id) || {};
    return {
      id: card.dataset.id,
      content: $("[data-field='content']", card).value,
      category: $("[data-field='category']", card).value,
      number: parseInt($("[data-field='number']", card).value, 10) || 0,
      images: (it.images || []).slice()
    };
  }

  function busy(card, on) {
    card.classList.toggle("is-busy", !!on);
    $$("button", card).forEach(function (b) { b.disabled = !!on; });
  }

  function bindList(box) {
    box.addEventListener("click", function (e) {
      var card = e.target.closest(".ad-card");
      if (!card) return;

      var shot = e.target.closest("[data-shot]");
      if (shot) { openLightbox(shot.dataset.shot); return; }

      var dropImg = e.target.closest("[data-dropimg]");
      if (dropImg) {
        var it = findItem(card.dataset.id);
        if (!it) return;
        it.images.splice(parseInt(dropImg.dataset.dropimg, 10), 1);
        var wrap = $(".ad-imgs", card);
        if (it.images.length) wrap.outerHTML = imagesHTML(it); else wrap.remove();
        toast("Đã bỏ ảnh khỏi cfs (bấm Duyệt/Lưu để áp dụng).");
        return;
      }

      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var act = btn.dataset.act;
      var data = cardPayload(card);

      if (act === "remove" && !confirm("Xoá hẳn cfs này? Ảnh kèm theo cũng vào thùng rác Drive. Không hoàn lại được.")) return;
      if (act === "reject" && !confirm("Từ chối cfs này? Nó sẽ không lên bảng tin nhưng vẫn lưu trong Sheet.")) return;

      busy(card, true);
      var call;
      if (act === "approve")        call = api("approve", data);
      else if (act === "save")      call = api("update", data);
      else if (act === "unapprove") call = api("unapprove", { id: data.id });
      else if (act === "reject")    call = api("reject", { id: data.id });
      else if (act === "remove")    call = api("remove", { id: data.id });
      else { busy(card, false); return; }

      call.then(function (j) {
        var msg = {
          approve: "Đã đăng cfs #" + (j.number || data.number),
          save: "Đã lưu thay đổi",
          unapprove: "Đã gỡ khỏi bảng tin (về mục chờ duyệt)",
          reject: "Đã từ chối cfs",
          remove: "Đã xoá hẳn cfs"
        }[act];
        toast(msg, "ok");
        card.classList.add("is-gone");
        setTimeout(loadAll, 260);
      }).catch(function (ex) {
        busy(card, false);
        guard(ex);
      });
    });

    // Cập nhật số ký tự khi sửa nội dung
    box.addEventListener("input", function (e) {
      if (!e.target.matches("[data-field='content']")) return;
      var card = e.target.closest(".ad-card");
      var len = $(".ad-len", card);
      if (len) len.textContent = e.target.value.length + " ký tự";
    });
  }

  /* ============================ cài đặt ============================ */
  var SET_FIELDS = {
    siteName: "#sName", siteShortName: "#sShort", school: "#sSchool", tagline: "#sTagline",
    fanpage: "#sFanpage", minChars: "#sMin", maxChars: "#sMax",
    maxSubmitsPerWindow: "#sRate", windowMinutes: "#sWindow",
    maxImages: "#sMaxImg", feedPageSize: "#sPage", maxCommentChars: "#sCmtChars",
    pausedMessage: "#sPausedMsg"
  };
  var SET_SWITCHES = {
    imagesEnabled: "#sImages", adviseFaceCover: "#sAdvise",
    analyticsEnabled: "#sAnalytics", commentsEnabled: "#sComments",
    autoApproveNoImages: "#sAutoApprove", paused: "#sPaused"
  };

  function fillSettings(s) {
    state.settings = s;
    Object.keys(SET_FIELDS).forEach(function (k) {
      var el = $(SET_FIELDS[k]);
      if (el) el.value = s[k] == null ? "" : s[k];
    });
    Object.keys(SET_SWITCHES).forEach(function (k) {
      var el = $(SET_SWITCHES[k]);
      if (el) el.checked = !!s[k];
    });
  }

  function readSettings() {
    var out = {};
    Object.keys(SET_FIELDS).forEach(function (k) {
      var el = $(SET_FIELDS[k]);
      if (!el) return;
      out[k] = el.type === "number" ? (parseInt(el.value, 10) || 0) : el.value.trim();
    });
    Object.keys(SET_SWITCHES).forEach(function (k) {
      var el = $(SET_SWITCHES[k]);
      if (el) out[k] = !!el.checked;
    });
    return out;
  }

  function initSettings() {
    var form = $("#formSettings"), err = $("#setError"), btn = $("#setBtn");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      err.hidden = true;
      var s = readSettings();

      if (s.minChars < 5) { err.textContent = "Số ký tự tối thiểu phải từ 5."; err.hidden = false; return; }
      if (s.maxChars <= s.minChars + 9) {
        err.textContent = "Số ký tự tối đa phải lớn hơn tối thiểu ít nhất 10.";
        err.hidden = false; return;
      }
      if (s.fanpage && !/^https?:\/\//i.test(s.fanpage)) {
        err.textContent = "Link fanpage phải bắt đầu bằng http:// hoặc https://";
        err.hidden = false; return;
      }

      btn.classList.add("is-loading"); btn.disabled = true;
      api("saveSettings", { settings: s }).then(function (j) {
        fillSettings(j.settings);
        toast("Đã lưu cài đặt — trang công khai cập nhật ngay", "ok");
      }).catch(function (ex) {
        err.textContent = ex.message; err.hidden = false;
        guard(ex);
      }).then(function () {
        btn.classList.remove("is-loading"); btn.disabled = false;
      });
    });

    var pwForm = $("#formPw"), pwErr = $("#pwError"), pwBtn = $("#pwBtn");
    pwForm.addEventListener("submit", function (e) {
      e.preventDefault();
      pwErr.hidden = true;
      var u = $("#pUser").value.trim(), oldP = $("#pOld").value, newP = $("#pNew").value;

      if (u.length < 3) { pwErr.textContent = "Tên đăng nhập quá ngắn."; pwErr.hidden = false; return; }
      if (!oldP) { pwErr.textContent = "Nhập mật khẩu hiện tại."; pwErr.hidden = false; $("#pOld").focus(); return; }
      if (newP.length < 10 || !/[A-Za-z]/.test(newP) || !/\d/.test(newP)) {
        pwErr.textContent = "Mật khẩu mới cần từ 10 ký tự, có cả chữ và số.";
        pwErr.hidden = false; $("#pNew").focus(); return;
      }

      pwBtn.classList.add("is-loading"); pwBtn.disabled = true;
      api("changePassword", { user: u, oldPass: oldP, newPass: newP }).then(function () {
        $("#pOld").value = ""; $("#pNew").value = "";
        try { localStorage.setItem(K_USER, u); } catch (e2) {}
        logout("Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới nhé.");
      }).catch(function (ex) {
        pwErr.textContent = ex.message; pwErr.hidden = false;
      }).then(function () {
        pwBtn.classList.remove("is-loading"); pwBtn.disabled = false;
      });
    });

    $("#goChangePw").addEventListener("click", function () {
      $('[data-tab="settings"]').click();
      setTimeout(function () {
        $("#formPw").scrollIntoView({ behavior: "smooth", block: "center" });
        $("#pOld").focus();
      }, 120);
    });
  }

  /* ============================ thống kê ============================ */
  function loadStats() {
    var days = parseInt($("#statDays").value, 10) || ADM.statsDays || 14;
    $("#chartVisits").innerHTML = '<p class="chart-load">Đang tải...</p>';
    return api("stats", { days: days }).then(function (j) {
      renderStats(j.stats || {});
    }).catch(guard);
  }

  function kpi(label, value, sub, tone) {
    return '<div class="kpi' + (tone ? " " + tone : "") + '">' +
      '<span class="kpi-v">' + esc(value) + "</span>" +
      '<span class="kpi-l">' + esc(label) + "</span>" +
      (sub ? '<span class="kpi-s">' + esc(sub) + "</span>" : "") +
      "</div>";
  }

  function topOf(obj) {
    var best = null;
    Object.keys(obj || {}).forEach(function (k) {
      if (!best || obj[k] > obj[best]) best = k;
    });
    return best;
  }

  function renderStats(s) {
    var counts = s.counts || {};
    var topView = topOf(s.catViews), topSend = topOf(s.submits);

    $("#kpis").innerHTML =
      kpi("Lượt ghé " + (s.days || 14) + " ngày", s.totalVisits || 0, "đếm tổng, không theo người") +
      kpi("Đã đăng", counts.approved || 0, "đang hiển thị trên bảng tin", "ok") +
      kpi("Chờ duyệt", counts.pending || 0, (counts.pending ? "cần bạn xử lí" : "sạch sẽ"), counts.pending ? "warn" : "") +
      kpi("Từ chối", counts.rejected || 0, "không lên bảng tin") +
      kpi("Chủ đề được xem nhiều nhất",
          topView ? catOf(topView).emoji + " " + catOf(topView).label : "—",
          topView ? (s.catViews[topView] + " lần bấm lọc") : "chưa có dữ liệu", "accent") +
      kpi("Chủ đề được gửi nhiều nhất",
          topSend ? catOf(topSend).emoji + " " + catOf(topSend).label : "—",
          topSend ? (s.submits[topSend] + " cfs") : "chưa có dữ liệu", "accent");

    drawVisits(s.series || []);
    drawBars("#barsCatViews", s.catViews, "lần");
    drawBars("#barsSubmits", s.submits, "cfs");
    drawBars("#barsPublished", s.publishedByCat, "cfs");
  }

  function drawVisits(series) {
    var box = $("#chartVisits");
    if (!series.length) { box.innerHTML = '<p class="chart-load">Chưa có dữ liệu.</p>'; return; }
    var max = Math.max.apply(null, series.map(function (d) { return d.visits; }).concat([1]));

    box.innerHTML =
      '<div class="vbars" style="--n:' + series.length + '">' +
      series.map(function (d) {
        var h = Math.round((d.visits / max) * 100);
        var dd = d.date.slice(8) + "/" + d.date.slice(5, 7);
        return '<div class="vbar" title="' + dd + ": " + d.visits + ' lượt">' +
          '<span class="vbar-fill" style="height:' + Math.max(h, d.visits ? 3 : 0) + '%"></span>' +
          '<span class="vbar-n">' + (d.visits || "") + "</span>" +
          '<span class="vbar-x">' + dd + "</span>" +
          "</div>";
      }).join("") + "</div>" +
      '<p class="chart-foot">Cao nhất: ' + max + ' lượt/ngày · Tổng ' +
      series.reduce(function (a, d) { return a + d.visits; }, 0) + " lượt</p>";
  }

  function drawBars(sel, obj, unit) {
    var box = $(sel);
    var rows = CATS.map(function (c) { return { c: c, v: (obj && obj[c.id]) || 0 }; })
                   .sort(function (a, b) { return b.v - a.v; });
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([1]));
    var total = rows.reduce(function (a, r) { return a + r.v; }, 0);

    if (!total) { box.innerHTML = '<p class="chart-load">Chưa có dữ liệu.</p>'; return; }

    box.innerHTML = rows.map(function (r, i) {
      var pct = Math.round((r.v / max) * 100);
      var share = total ? Math.round((r.v / total) * 100) : 0;
      return '<div class="bar' + (i === 0 && r.v ? " is-top" : "") + '">' +
        '<span class="bar-l"><span aria-hidden="true">' + r.c.emoji + "</span> " + esc(r.c.label) + "</span>" +
        '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="bar-v">' + r.v + " <small>" + unit + " · " + share + "%</small></span>" +
        "</div>";
    }).join("");
  }

  /* ============================ lightbox ============================ */
  function openLightbox(src) {
    var lb = $("#lightbox");
    $("#lightboxImg").src = src;
    lb.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function initLightbox() {
    var lb = $("#lightbox");
    lb.addEventListener("click", function (e) { if (e.target.closest("[data-lbclose]")) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    function close() {
      if (lb.hidden) return;
      lb.hidden = true;
      $("#lightboxImg").removeAttribute("src");
      document.body.style.overflow = "";
    }
  }

  /* ============================ khung ngoài ============================ */
  function initShell() {
    $("#themeToggle").addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("cfs-theme", next); } catch (e) {}
    });

    $("#tabs").addEventListener("click", function (e) {
      var b = e.target.closest(".tab");
      if (!b) return;
      state.tab = b.dataset.tab;
      $$(".tab", this).forEach(function (x) {
        var on = x === b;
        x.classList.toggle("is-active", on);
        x.setAttribute("aria-selected", String(on));
      });
      ["pending", "approved", "comments", "stats", "settings"].forEach(function (t) {
        var p = $("#panel-" + t);
        if (!p) return;
        p.hidden = t !== state.tab;
        p.classList.toggle("is-active", t === state.tab);
      });
      if (state.tab === "stats") loadStats();
    });

    $("#adRefresh").addEventListener("click", function () {
      this.classList.add("is-spin");
      var self = this;
      loadAll().then(function () {
        if (state.tab === "stats") return loadStats();
      }).then(function () {
        setTimeout(function () { self.classList.remove("is-spin"); }, 300);
        toast("Đã tải lại", "ok");
      });
    });

    $("#adLogout").addEventListener("click", function () { logout(); });
    $("#statDays").addEventListener("change", loadStats);

    var t;
    $("#adSearch").addEventListener("input", function () {
      var v = this.value.trim();
      clearTimeout(t);
      t = setTimeout(function () { state.keyword = v; renderApproved(); }, 160);
    });

    var tc;
    var cmtSearch = $("#adCmtSearch");
    if (cmtSearch) cmtSearch.addEventListener("input", function () {
      var v = this.value.trim();
      clearTimeout(tc);
      tc = setTimeout(function () { state.cmtKeyword = v; renderComments(); }, 160);
    });

    var cmtList = $("#listComments");
    if (cmtList) cmtList.addEventListener("click", function (e) {
      var btn = e.target.closest('[data-act="rmCmt"]');
      if (!btn) return;
      var card = btn.closest("[data-cmt-id]");
      if (!card) return;
      var id = card.dataset.cmtId;
      if (!confirm("Xoá hẳn bình luận này?")) return;
      btn.disabled = true;
      api("removeComment", { id: id }).then(function () {
        state.comments = state.comments.filter(function (c) { return c.id !== id; });
        renderComments();
        renderCounts();
        toast("Đã xoá bình luận", "ok");
      }).catch(function (err) { btn.disabled = false; guard(err); });
    });

    bindList($("#listPending"));
    bindList($("#listApproved"));
    initSettings();
    initLightbox();

    ["click", "keydown", "input"].forEach(function (ev) {
      document.addEventListener(ev, function () { if (state.token) resetIdle(); }, true);
    });
  }

  /* ============================ khởi động ============================ */
  function init() {
    initGate();
    initShell();

    // Vào lại trong cùng tab thì không cần nhập lại token
    var t = "";
    try { t = sessionStorage.getItem(K_TOKEN) || ""; } catch (e) {}
    var u = backendUrl();
    if (t && u) {
      state.url = u; state.token = t;
      api("session").then(function (j) { enterAdmin(j.info, j.settings); })
                    .catch(function () { logout(); });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
