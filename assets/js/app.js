/* =======================================================================
   APP — tương tác của trang.
   Chỉ dùng localStorage cho 2 việc: theme + bộ đếm chống spam.
   Không gửi telemetry, không nhúng script của bên thứ ba.
   ======================================================================= */
(function () {
  "use strict";

  var CFG = window.CFS_CONFIG || {};
  var API = window.CFS_BACKEND;
  var LIMITS = CFG.limits || {};
  var CATS = CFG.categories || [];
  var FEED_CFG = CFG.feed || {};
  var PAGE_SIZE = FEED_CFG.pageSize || 9;

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function catOf(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i];
    return { id: "khac", label: "Khác", emoji: "✨" };
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { return null; }
  }

  /* =========================== Toast =========================== */
  var toastWrap = $("#toastWrap");
  function toast(msg, kind) {
    if (!toastWrap) return;
    var el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    toastWrap.appendChild(el);
    setTimeout(function () {
      el.classList.add("is-out");
      setTimeout(function () { el.remove(); }, 320);
    }, 4200);
  }

  /* =========================== Text từ config =========================== */
  function applyConfigText() {
    $$("[data-cfs]").forEach(function (el) {
      var path = el.getAttribute("data-cfs").split(".");
      var v = CFG;
      for (var i = 0; i < path.length && v != null; i++) v = v[path[i]];
      if (typeof v === "string" && v) el.textContent = v;
    });

    var y = $("#year"); if (y) y.textContent = new Date().getFullYear();

    var fp = (CFG.site && CFG.site.fanpage) || "";
    var fpLink = $("#fanpageLink");
    if (fpLink && fp) { fpLink.href = fp; fpLink.target = "_blank"; fpLink.rel = "noopener noreferrer"; fpLink.hidden = false; }

    var ta = $("#cfsContent");
    if (ta && LIMITS.maxChars) ta.maxLength = LIMITS.maxChars;
  }

  /* =========================== Theme =========================== */
  function initTheme() {
    var btn = $("#themeToggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      store("cfs-theme", next);
      btn.setAttribute("aria-label", next === "dark" ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối");
    });

    // Người dùng chưa chọn thủ công -> đi theo hệ thống
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function (e) {
      if (store("cfs-theme")) return;
      document.documentElement.setAttribute("data-theme", e.matches ? "light" : "dark");
    });
  }

  /* =========================== Header / nav =========================== */
  function initHeader() {
    var header = $("#siteHeader"), bar = $("#scrollProgress");
    var nav = $("#siteNav"), navBtn = $("#navToggle");

    function onScroll() {
      var y = window.scrollY || 0;
      if (header) header.classList.toggle("is-stuck", y > 8);
      if (bar) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (navBtn && nav) {
      var close = function () { nav.classList.remove("is-open"); navBtn.setAttribute("aria-expanded", "false"); };
      navBtn.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        navBtn.setAttribute("aria-expanded", String(open));
        navBtn.setAttribute("aria-label", open ? "Đóng menu" : "Mở menu");
      });
      nav.addEventListener("click", function (e) { if (e.target.closest("a")) close(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    }

    // Đánh dấu mục đang xem
    var links = $$("#siteNav a[href^='#']");
    var sections = links.map(function (a) { return document.getElementById(a.hash.slice(1)); });
    if ("IntersectionObserver" in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (a, i) { a.classList.toggle("is-active", sections[i] === en.target); });
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      sections.forEach(function (s) { if (s) spy.observe(s); });
    }

    var top = $("#toTop");
    if (top) top.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* =========================== Reveal + đếm số =========================== */
  function initReveal() {
    var items = $$(".reveal");
    items.forEach(function (el) {
      var d = el.getAttribute("data-reveal-delay");
      if (d) el.style.setProperty("--d", d + "ms");
    });
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        obs.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });

    /* Lưới an toàn: nếu observer không kích hoạt (tab ẩn, trình duyệt lạ,
       công cụ chụp ảnh...) thì những gì đang nằm trong khung nhìn vẫn phải hiện. */
    var failsafe = function () {
      items.forEach(function (el) {
        if (el.classList.contains("is-in")) return;
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight + 80) el.classList.add("is-in");
      });
    };
    setTimeout(failsafe, 1200);
    window.addEventListener("load", function () { setTimeout(failsafe, 200); });
  }

  function countUp(el) {
    var to = parseInt(el.getAttribute("data-count-to") || el.textContent, 10) || 0;
    if (reduceMotion || to <= 0) { el.textContent = to; return; }
    var start = performance.now(), dur = 1100;
    (function step(now) {
      var p = Math.min((now - start) / dur, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  function initCounters() {
    var els = $$(".count");
    if (!("IntersectionObserver" in window)) { els.forEach(countUp); return; }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        countUp(en.target); obs.unobserve(en.target);
      });
    }, { threshold: 0.5 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* =========================== Typewriter =========================== */
  function initTypewriter() {
    var el = $("#typewriter");
    if (!el) return;
    var lines = [
      "xin info cờ-rút mà không phải ngại 💌",
      "kể chuyện không dám kể trước mặt thiên hạ 🌧️",
      "góp ý thầy cô mà không sợ bị... đì 😅",
      "tâm sự tuổi hường lúc 2 giờ sáng 🌙",
      "chỉ là một con số thứ tự, không hơn 🔢"
    ];
    if (reduceMotion) { el.textContent = lines[0]; return; }

    var li = 0, ci = 0, del = false;
    (function tick() {
      var full = lines[li];
      ci += del ? -1 : 1;
      el.textContent = full.slice(0, ci);
      var wait = del ? 28 : 52;
      if (!del && ci === full.length) { del = true; wait = 1900; }
      else if (del && ci === 0) { del = false; li = (li + 1) % lines.length; wait = 320; }
      setTimeout(tick, wait);
    })();
  }

  /* =========================== Floaties =========================== */
  function initFloaties() {
    var box = $("#floaties");
    if (!box || reduceMotion) return;
    var glyphs = ["💜", "💌", "✨", "🌸", "💭", "⭐", "🫧"];
    var n = window.innerWidth < 700 ? 8 : 16;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      s.className = "floatie";
      s.textContent = glyphs[i % glyphs.length];
      s.style.left = (Math.random() * 98).toFixed(2) + "vw";
      s.style.setProperty("--size", (12 + Math.random() * 16).toFixed(0) + "px");
      s.style.setProperty("--dur", (16 + Math.random() * 18).toFixed(1) + "s");
      s.style.setProperty("--delay", (-Math.random() * 24).toFixed(1) + "s");
      s.style.setProperty("--rot", (Math.random() * 480 - 240).toFixed(0) + "deg");
      frag.appendChild(s);
    }
    box.appendChild(frag);
  }

  /* =========================== Chọn chủ đề =========================== */
  var selectedCat = CATS.length ? CATS[0].id : "khac";

  function initCategories() {
    var box = $("#categoryChips"), sel = $("#cfsCategory");
    if (!box) return;

    CATS.forEach(function (c, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (i === 0 ? " is-active" : "");
      b.dataset.cat = c.id;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", i === 0 ? "true" : "false");
      b.innerHTML = '<span aria-hidden="true">' + c.emoji + "</span>" + escapeHTML(c.label);
      box.appendChild(b);

      if (sel) {
        var o = document.createElement("option");
        o.value = c.id; o.textContent = c.label;
        sel.appendChild(o);
      }
    });

    box.addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      selectedCat = b.dataset.cat;
      $$(".chip", box).forEach(function (x) {
        var on = x === b;
        x.classList.toggle("is-active", on);
        x.setAttribute("aria-checked", String(on));
      });
      if (sel) sel.value = selectedCat;
    });
  }

  /* =========================== Ảnh kèm cfs =========================== */
  var IMG_CFG = CFG.images || {};
  var IK = window.CFS_IMAGEKIT;
  var IMG_API = window.CFS_IMAGES;
  var picked = [];   // [{id, base, stickers}]

  function imgEnabled() {
    return IMG_CFG.enabled !== false && IK && IMG_API && IMG_API.enabled;
  }
  function maxImgs() { return IMG_CFG.maxCount || 3; }

  function imgError(msg) {
    var el = $("#imgError");
    if (!el) return;
    if (!msg) { el.hidden = true; return; }
    el.textContent = msg;
    el.hidden = false;
  }

  var shownThumbs = {};   // id ảnh đã hiển thị -> không chạy lại animation vào

  function renderThumbs() {
    var box = $("#thumbs"), counter = $("#imgCounter");
    if (!box) return;
    if (counter) counter.textContent = picked.length + " / " + maxImgs();

    box.innerHTML = picked.map(function (it) {
      var covered = IK.hasCover(it);
      var advise = IMG_CFG.adviseFaceCover !== false;
      var fresh = !shownThumbs[it.id];
      shownThumbs[it.id] = true;
      return '' +
        '<li class="thumb' + (fresh ? " is-new" : "") + (!covered && advise ? " needs-cover" : "") +
          '" data-id="' + it.id + '">' +
          '<img src="' + IK.thumbURL(it, 360) + '" alt="Ảnh đã chọn">' +
          (covered
            ? '<span class="thumb-tag ok">✓ Đã che ' + it.stickers.length + ' chỗ</span>'
            : (advise ? '<span class="thumb-tag warn">Nên che mặt</span>' : "")) +
          '<div class="thumb-acts">' +
            '<button type="button" class="thumb-btn" data-cover="' + it.id + '">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path d="M4 20 20 4"/></svg>' +
              (covered ? "Sửa che" : "Che mặt") +
            "</button>" +
            '<button type="button" class="thumb-btn danger" data-drop="' + it.id + '" aria-label="Bỏ ảnh này">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">' +
              '<path d="M6 6l12 12M18 6 6 18"/></svg>' +
            "</button>" +
          "</div>" +
        "</li>";
    }).join("");
  }

  function addFiles(files) {
    if (!imgEnabled() || !files || !files.length) return;
    imgError("");

    var room = maxImgs() - picked.length;
    if (room <= 0) { imgError("Tối đa " + maxImgs() + " ảnh mỗi confession."); return; }

    var list = Array.prototype.slice.call(files, 0, room);
    if (files.length > room) toast("Chỉ nhận thêm " + room + " ảnh nữa (tối đa " + maxImgs() + ").", "err");

    list.reduce(function (chain, f) {
      return chain.then(function () {
        return IK.load(f).then(function (item) {
          picked.push(item);
          renderThumbs();
        }).catch(function (e) { imgError(e.message || "Không đọc được ảnh."); });
      });
    }, Promise.resolve());
  }

  function initImages() {
    var row = $("#imageRow");
    if (!row) return;
    if (!imgEnabled()) { row.hidden = true; return; }

    var input = $("#cfsImages"), dz = $("#dropzone"), box = $("#thumbs");
    var counter = $("#imgCounter");
    if (counter) counter.textContent = "0 / " + maxImgs();

    input.addEventListener("change", function () {
      addFiles(this.files);
      this.value = "";   // cho phép chọn lại cùng file
    });

    ["dragenter", "dragover"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("is-over"); });
    });
    dz.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });

    // Dán ảnh trực tiếp từ clipboard
    document.addEventListener("paste", function (e) {
      if (!e.clipboardData || !e.clipboardData.files || !e.clipboardData.files.length) return;
      var active = document.activeElement;
      if (active !== $("#cfsContent") && !row.contains(active)) return;
      addFiles(e.clipboardData.files);
    });

    box.addEventListener("click", function (e) {
      var cover = e.target.closest("[data-cover]");
      if (cover) {
        var it = picked.filter(function (x) { return x.id === cover.dataset.cover; })[0];
        if (it) IK.openEditor(it, function () { renderThumbs(); });
        return;
      }
      var drop = e.target.closest("[data-drop]");
      if (drop) {
        picked = picked.filter(function (x) { return x.id !== drop.dataset.drop; });
        renderThumbs();
        imgError("");
      }
    });
  }

  /* Tải ảnh lên trước khi gửi cfs. Trả về mảng link (hoặc data URI). */
  function uploadPicked(onProgress) {
    if (!picked.length) return Promise.resolve([]);
    var urls = [];
    return picked.reduce(function (chain, it, i) {
      return chain.then(function () {
        if (onProgress) onProgress(i + 1, picked.length);
        if (IMG_API.isInline) {
          return Promise.resolve(IK.toDataURL(it, IMG_API.inlineMaxDim || 1200))
            .then(function (d) { urls.push(d); });
        }
        return IK.toBlob(it).then(function (blob) { return IMG_API.upload(blob); })
          .then(function (url) { urls.push(url); });
      });
    }, Promise.resolve()).then(function () { return urls; });
  }

  /* =========================== Lightbox =========================== */
  function initLightbox() {
    var lb = $("#lightbox"), img = $("#lightboxImg");
    if (!lb) return;
    var prevFocus = null;

    window.__cfsOpenLightbox = function (src, trigger) {
      prevFocus = trigger || document.activeElement;
      img.src = src;
      lb.hidden = false;
      document.body.style.overflow = "hidden";
      var c = $(".lb-close", lb); if (c) c.focus();
    };
    function close() {
      if (lb.hidden) return;
      lb.hidden = true;
      img.removeAttribute("src");
      document.body.style.overflow = "";
      if (prevFocus) prevFocus.focus();
    }
    lb.addEventListener("click", function (e) { if (e.target.closest("[data-lbclose]")) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  /* ============ Cài đặt do admin đặt trên trang quản trị ============
     Ghi đè lên config.js, để admin không phải sửa code nữa. */
  function applySettings(s) {
    if (!s) return;
    var site = CFG.site = CFG.site || {};
    if (s.siteName) site.name = s.siteName;
    if (s.siteShortName) site.shortName = s.siteShortName;
    if (s.school) site.school = s.school;
    if (s.tagline) site.tagline = s.tagline;
    site.fanpage = s.fanpage || "";

    var L = CFG.limits = CFG.limits || {};
    if (s.minChars) L.minChars = s.minChars;
    if (s.maxChars) L.maxChars = s.maxChars;
    if (s.maxSubmitsPerWindow) L.maxSubmitsPerWindow = s.maxSubmitsPerWindow;
    if (s.windowMinutes) L.windowMinutes = s.windowMinutes;
    LIMITS = L;

    var I = CFG.images = CFG.images || {};
    I.enabled = s.imagesEnabled !== false;
    if (s.maxImages) I.maxCount = s.maxImages;
    I.adviseFaceCover = s.adviseFaceCover !== false;
    IMG_CFG = I;

    (CFG.analytics = CFG.analytics || {}).enabled = s.analyticsEnabled !== false;

    if (s.feedPageSize) {
      (CFG.feed = CFG.feed || {}).pageSize = s.feedPageSize;
      PAGE_SIZE = s.feedPageSize;
    }

    CFG.paused = !!s.paused;
    CFG.pausedMessage = s.pausedMessage || "";
  }

  /* Admin bật "tạm nghỉ nhận cfs" -> khoá form, hiện lời nhắn */
  function applyPaused() {
    var form = $("#cfsForm");
    if (!form || !CFG.paused || $(".paused-note", form)) return;
    form.classList.add("is-paused");
    $$("input, textarea, select, button", form).forEach(function (el) { el.disabled = true; });

    var note = document.createElement("p");
    note.className = "paused-note";
    note.setAttribute("role", "status");
    note.textContent = CFG.pausedMessage || "Page đang tạm nghỉ nhận cfs, bạn quay lại sau nhé 🌷";
    form.insertBefore(note, form.firstChild);
  }

  /* =========================== Chống spam (nội quy #2) =========================== */
  var RL_KEY = "cfs-submit-log";

  function recentSubmits() {
    var winMs = (LIMITS.windowMinutes || 60) * 60000;
    var now = Date.now(), list = [];
    try { list = JSON.parse(store(RL_KEY) || "[]"); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    return list.filter(function (t) { return typeof t === "number" && now - t < winMs; });
  }
  function logSubmit() {
    var list = recentSubmits();
    list.push(Date.now());
    store(RL_KEY, JSON.stringify(list));
  }

  /* ===================== Số thứ tự của người gửi =====================
     Số được backend cấp ngay lúc gửi, nên người gửi biết luôn cfs của mình
     là số mấy và tìm lại được trên bảng tin sau khi admin duyệt. */
  var nextNum = null;

  function setNextNum(n) {
    n = parseInt(n, 10);
    if (!n || n < 1) return;
    nextNum = n;
    var box = $("#cfsNumBox"), val = $("#cfsNumNext");
    if (val) val.textContent = "#" + n;
    if (box) box.hidden = false;
  }

  /* Provider không cấp số (Google Form, Firebase...) -> đoán từ bảng tin */
  function guessNextNum() {
    if (nextNum) return;
    var max = 0;
    ALL.forEach(function (x) { if (x.number > max) max = x.number; });
    if (max) setNextNum(max + 1);
  }

  /* =========================== Form =========================== */
  function initForm() {
    var form = $("#cfsForm");
    if (!form) return;

    var ta = $("#cfsContent"), counter = $("#charCounter"),
        err = $("#contentError"), agree = $("#cfsAgree"),
        btn = $("#submitBtn"), honey = $("#cfsWebsite");
    var max = LIMITS.maxChars || 3000, min = LIMITS.minChars || 20;

    function refreshCounter() {
      var n = ta.value.length;
      counter.textContent = n + " / " + max;
      counter.classList.toggle("is-warn", n > max - 100);
    }
    ta.addEventListener("input", function () {
      refreshCounter();
      ta.classList.remove("is-invalid");
      err.hidden = true;
    });
    refreshCounter();

    function fail(msg) {
      err.textContent = msg;
      err.hidden = false;
      ta.classList.add("is-invalid");
      ta.focus();
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var content = ta.value.trim();

      if (honey && honey.value) return;                       // bot
      if (content.length < min) return fail("Viết thêm chút nữa nhé — tối thiểu " + min + " ký tự.");
      if (content.length > max) return fail("Dài quá rồi, tối đa " + max + " ký tự.");
      if (!agree.checked) { toast("Bạn cần tích vào ô đồng ý nội quy trước nha.", "err"); agree.focus(); return; }

      var maxN = LIMITS.maxSubmitsPerWindow || 3;
      if (recentSubmits().length >= maxN) {
        toast("Bạn đã gửi " + maxN + " cfs trong " + (LIMITS.windowMinutes || 60) +
              " phút qua. Nghỉ tay một lát nhé (nội quy #2).", "err");
        return;
      }

      btn.classList.add("is-loading");
      btn.disabled = true;
      var setLabel = function (t) { $(".btn-label", btn).textContent = t; };
      setLabel(picked.length ? "Đang xử lí ảnh..." : "Đang gửi...");

      // Nhắc nhẹ (không chặn) nếu ảnh chưa được che mặt
      if (IMG_CFG.adviseFaceCover !== false) {
        var bare = picked.filter(function (it) { return !IK.hasCover(it); }).length;
        if (bare) {
          toast("Nhắc nhẹ: " + bare + " ảnh chưa dán nhãn che mặt. Nếu trong hình có người, " +
                "lần sau nên che lại giúp họ nhé.", "err");
        }
      }

      uploadPicked(function (i, n) { setLabel("Đang tải ảnh " + i + "/" + n + "..."); })
        .then(function (urls) {
          setLabel("Đang gửi...");
          return API.submit({ content: content, category: selectedCat, images: urls });
        })
        .then(function (res) {
          logSubmit();
          var mine = (res && parseInt(res.number, 10)) || nextNum || 0;
          form.reset();
          picked = [];
          shownThumbs = {};
          renderThumbs();
          imgError("");
          selectedCat = CATS.length ? CATS[0].id : "khac";
          $$("#categoryChips .chip").forEach(function (x, i) {
            x.classList.toggle("is-active", i === 0);
            x.setAttribute("aria-checked", i === 0 ? "true" : "false");
          });
          refreshCounter();
          openModal(mine);
          // số của người kế tiếp
          var nx = (res && parseInt(res.nextNumber, 10)) || (mine ? mine + 1 : 0);
          if (nx) setNextNum(nx);
          if (API.isDemo) {
            toast("Đang ở chế độ DEMO: cfs chỉ lưu trong máy bạn. Xem README để nối backend thật.", "err");
            loadFeed(true);
          }
        })
        .catch(function (ex) {
          console.error(ex);
          toast("Gửi không thành công: " + (ex && ex.message ? ex.message : "lỗi mạng") + ". Thử lại nhé.", "err");
        })
        .then(function () {
          btn.classList.remove("is-loading");
          btn.disabled = false;
          setLabel("Gửi ẩn danh");
        });
    });
  }

  /* =========================== Modal =========================== */
  var lastFocus = null;
  function openModal(num) {
    var m = $("#thanksModal");
    if (!m) return;
    var box = $("#thanksNumBox", m), val = $("#thanksNum", m);
    num = parseInt(num, 10);
    if (box && val) {
      if (num > 0) { val.textContent = "#" + num; box.hidden = false; }
      else box.hidden = true;
    }
    lastFocus = document.activeElement;
    m.hidden = false;
    document.body.style.overflow = "hidden";
    var b = $("[data-close].btn", m); if (b) b.focus();
  }
  function closeModal() {
    var m = $("#thanksModal");
    if (!m || m.hidden) return;
    m.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }
  function initModal() {
    var m = $("#thanksModal");
    if (!m) return;
    m.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  }

  /* =========================== Feed =========================== */
  var ALL = [], filterCat = "all", keyword = "", shown = 0;

  var grid = $("#feedGrid"), emptyEl = $("#feedEmpty"), moreBtn = $("#loadMore");

  function likeKey() { return "cfs-liked"; }
  function likedSet() {
    try { return new Set(JSON.parse(store(likeKey()) || "[]")); } catch (e) { return new Set(); }
  }
  function toggleLike(n) {
    var s = likedSet();
    if (s.has(n)) s.delete(n); else s.add(n);
    store(likeKey(), JSON.stringify(Array.prototype.slice.call(s)));
    return s.has(n);
  }

  function fmtDate(iso) {
    var p = String(iso).split("-");
    if (p.length < 3) return iso;
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function highlight(text, kw) {
    var safe = escapeHTML(text);
    if (!kw || kw.charAt(0) === "#") return safe;
    var rx = new RegExp("(" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return safe.replace(rx, "<mark>$1</mark>");
  }

  function matches(item) {
    if (filterCat !== "all" && item.category !== filterCat) return false;
    if (!keyword) return true;
    if (keyword.charAt(0) === "#") {
      var n = keyword.slice(1).replace(/\D/g, "");
      return n ? String(item.number).indexOf(n) === 0 : true;
    }
    return item.content.toLowerCase().indexOf(keyword.toLowerCase()) > -1;
  }

  /* Link ảnh Drive đôi khi bị chặn ở dạng lh3.googleusercontent.com —
     tự đổi sang dạng thumbnail của Drive thay vì hiện ảnh vỡ. */
  function driveFallback(src) {
    var m = String(src).match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)/);
    if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1600";
    return "";
  }

  function initImageFallback(root) {
    if (!root || root.__fbBound) return;
    root.__fbBound = true;
    // event "error" của <img> không bubble -> phải bắt ở capture phase
    root.addEventListener("error", function (e) {
      var img = e.target;
      if (!img || img.tagName !== "IMG" || img.dataset.fb) return;
      var alt = driveFallback(img.getAttribute("src"));
      if (!alt) return;
      img.dataset.fb = "1";
      img.src = alt;
    }, true);
  }

  function imagesHTML(item) {
    var imgs = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
    if (!imgs.length) return "";
    var n = Math.min(imgs.length, 3);
    return '<div class="cfs-media cols-' + n + '">' +
      imgs.slice(0, 3).map(function (src, i) {
        return '<button type="button" class="cfs-shot" data-shot="' + escapeHTML(src) + '" ' +
               'aria-label="Xem ảnh ' + (i + 1) + ' của confession số ' + item.number + '">' +
               '<img src="' + escapeHTML(src) + '" alt="Ảnh kèm confession số ' + item.number +
               '" loading="lazy" decoding="async">' +
               "</button>";
      }).join("") +
      "</div>";
  }

  function cardHTML(item, liked, i) {
    var c = catOf(item.category);
    var long = item.content.length > 420;
    return '' +
      '<article class="cfs' + (long ? " is-clamped" : "") + '" id="cfs-' + item.number +
        '" style="animation-delay:' + Math.min(i * 45, 400) + 'ms">' +
        '<div class="cfs-top">' +
          '<span class="cfs-no">#' + item.number + "</span>" +
          '<span class="cfs-cat"><span aria-hidden="true">' + c.emoji + "</span> " + escapeHTML(c.label) + "</span>" +
          '<time class="cfs-date" datetime="' + escapeHTML(item.date) + '">' + fmtDate(item.date) + "</time>" +
        "</div>" +
        '<p class="cfs-body">' + highlight(item.content, keyword) + "</p>" +
        imagesHTML(item) +
        '<div class="cfs-foot">' +
          '<button class="cfs-act act-like' + (liked ? " is-on" : "") + '" type="button" data-like="' + item.number +
            '" aria-pressed="' + (liked ? "true" : "false") + '" aria-label="Thả tim confession số ' + item.number + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M12 20.4S3.6 15.3 3.6 9.4a4.6 4.6 0 0 1 8.4-2.6 4.6 4.6 0 0 1 8.4 2.6c0 5.9-8.4 11-8.4 11z"/></svg>' +
            "Thương" +
          "</button>" +
          '<button class="cfs-act" type="button" data-copy="' + item.number + '" aria-label="Copy link confession số ' + item.number + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M9.5 14.5 14.5 9.5"/><path d="M11.5 6.5l1.8-1.8a3.6 3.6 0 0 1 5.1 5.1L16.6 11.6"/>' +
            '<path d="M12.5 17.5l-1.8 1.8a3.6 3.6 0 0 1-5.1-5.1L7.4 12.4"/></svg>' +
            "Copy link" +
          "</button>" +
          (long ? '<button class="cfs-act cfs-more" type="button" data-expand="' + item.number + '">Đọc tiếp</button>' : "") +
        "</div>" +
      "</article>";
  }

  function render(reset) {
    if (!grid) return;
    var list = ALL.filter(matches);
    if (reset) shown = 0;
    shown = Math.min(Math.max(shown || 0, PAGE_SIZE), Math.max(list.length, PAGE_SIZE));

    var liked = likedSet();
    var slice = list.slice(0, shown);
    grid.innerHTML = slice.map(function (it, i) { return cardHTML(it, liked.has(it.number), i); }).join("");
    grid.setAttribute("aria-busy", "false");

    if (emptyEl) {
      var none = list.length === 0;
      emptyEl.hidden = !none;
      if (none && (keyword || filterCat !== "all")) {
        emptyEl.innerHTML = 'Không tìm thấy confession nào khớp. Thử từ khoá khác xem sao?';
      } else if (none) {
        emptyEl.innerHTML = 'Chưa có confession nào ở đây. Bạn mở màn nhé? <a href="#gui-cfs">Gửi ngay →</a>';
      }
    }
    if (moreBtn) moreBtn.hidden = list.length <= shown;
  }

  function initFeedTools() {
    var filters = $("#feedFilters");
    if (filters) {
      var mk = function (id, label, emoji, active) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip" + (active ? " is-active" : "");
        b.dataset.filter = id;
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", String(!!active));
        b.innerHTML = (emoji ? '<span aria-hidden="true">' + emoji + "</span>" : "") + escapeHTML(label);
        filters.appendChild(b);
      };
      mk("all", "Tất cả", "🗂️", true);
      CATS.forEach(function (c) { mk(c.id, c.label, c.emoji, false); });

      filters.addEventListener("click", function (e) {
        var b = e.target.closest(".chip");
        if (!b) return;
        filterCat = b.dataset.filter;
        $$(".chip", filters).forEach(function (x) {
          var on = x === b;
          x.classList.toggle("is-active", on);
          x.setAttribute("aria-selected", String(on));
        });
        render(true);
        if (window.CFS_STATS) window.CFS_STATS.categoryView(filterCat);
      });
    }

    var search = $("#feedSearch");
    if (search) {
      var t;
      search.addEventListener("input", function () {
        clearTimeout(t);
        t = setTimeout(function () { keyword = search.value.trim(); render(true); }, 180);
      });
    }

    if (moreBtn) moreBtn.addEventListener("click", function () {
      shown += PAGE_SIZE;
      render(false);
    });

    if (grid) grid.addEventListener("click", function (e) {
      var shot = e.target.closest("[data-shot]");
      if (shot) {
        if (window.__cfsOpenLightbox) window.__cfsOpenLightbox(shot.dataset.shot, shot);
        return;
      }
      var likeBtn = e.target.closest("[data-like]");
      if (likeBtn) {
        var n = parseInt(likeBtn.dataset.like, 10);
        var on = toggleLike(n);
        likeBtn.classList.toggle("is-on", on);
        likeBtn.setAttribute("aria-pressed", String(on));
        return;
      }
      var copyBtn = e.target.closest("[data-copy]");
      if (copyBtn) {
        var url = location.origin + location.pathname + "#cfs-" + copyBtn.dataset.copy;
        var done = function () { toast("Đã copy link confession #" + copyBtn.dataset.copy, "ok"); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function () { toast(url); });
        } else { toast(url); }
        return;
      }
      var exp = e.target.closest("[data-expand]");
      if (exp) {
        var card = exp.closest(".cfs");
        card.classList.remove("is-clamped");
        exp.remove();
      }
    });
  }

  function skeletons(n) {
    if (!grid) return;
    var html = "";
    for (var i = 0; i < n; i++) html += '<div class="skeleton"></div>';
    grid.innerHTML = html;
    grid.setAttribute("aria-busy", "true");
  }

  function loadFeed(silent) {
    if (!grid) return Promise.resolve();
    if (!silent) skeletons(6);
    return API.listSafe().then(function (items) {
      ALL = items || [];
      var total = $("#statTotal");
      if (total) { total.setAttribute("data-count-to", ALL.length); countUp(total); }
      render(true);
      jumpToHash();
      guessNextNum();
    });
  }

  function jumpToHash() {
    var m = (location.hash || "").match(/^#cfs-(\d+)$/);
    if (!m) return;
    var n = parseInt(m[1], 10);
    var idx = ALL.findIndex ? ALL.findIndex(function (x) { return x.number === n; }) : -1;
    if (idx > -1 && idx + 1 > shown) { shown = idx + 1 + PAGE_SIZE; render(false); }
    var el = document.getElementById("cfs-" + n);
    if (el) {
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      el.classList.remove("is-clamped");
      el.style.borderColor = "var(--violet)";
    }
  }

  /* =========================== Bootstrap =========================== */
  /* Áp cài đặt mới rồi cập nhật lại những chỗ đã render bằng giá trị cũ */
  function refreshAfterSettings() {
    applyConfigText();

    var ta = $("#cfsContent"), counter = $("#charCounter");
    if (ta && LIMITS.maxChars) {
      ta.maxLength = LIMITS.maxChars;
      if (counter) counter.textContent = ta.value.length + " / " + LIMITS.maxChars;
    }

    var row = $("#imageRow");
    if (row) {
      var on = imgEnabled();
      row.hidden = !on;
      var ic = $("#imgCounter");
      if (on && ic) ic.textContent = picked.length + " / " + maxImgs();
      if (!on) { picked = []; renderThumbs(); }
    }

    applyPaused();
  }

  function init() {
    applyConfigText();
    initTheme();
    initHeader();
    initCategories();
    initFeedTools();
    initImages();
    initLightbox();
    initForm();
    initModal();
    initTypewriter();
    initFloaties();
    initReveal();
    initCounters();
    initImageFallback(grid);

    /* Không chặn UI chờ mạng: vẽ trang ngay, cài đặt của admin về sau thì áp vào.
       bootstrap() lấy luôn danh sách cfs nên không tốn thêm một lượt gọi nào. */
    if (API.hasSettings) {
      skeletons(6);
      API.bootstrap().then(function (b) {
        if (b && b.settings) {
          applySettings(b.settings);
          refreshAfterSettings();
        }
        if (b && b.nextNumber) setNextNum(b.nextNumber);
        loadFeed(false);
        if (window.CFS_STATS) window.CFS_STATS.visit();
      });
    } else {
      API.nextNumber().then(function (n) { if (n) setNextNum(n); });
      loadFeed(false);
      if (window.CFS_STATS) window.CFS_STATS.visit();
    }

    window.addEventListener("hashchange", jumpToHash);

    if (API.isDemo) {
      console.info("%c[TGU CFS] Đang chạy ở chế độ DEMO (provider: local). " +
        "Confession chỉ lưu trong máy này. Mở assets/js/config.js để nối backend thật — xem README.md.",
        "color:#a78bfa;font-weight:bold");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
