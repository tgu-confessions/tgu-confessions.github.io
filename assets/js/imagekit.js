/* =======================================================================
   IMAGEKIT — xử lý ảnh trước khi gửi.

   Hai việc quan trọng về quyền riêng tư:
   1. XOÁ METADATA: ảnh được vẽ lại vào <canvas> rồi xuất ra JPEG mới.
      Toàn bộ EXIF (toạ độ GPS, model điện thoại, giờ chụp, tên chủ máy)
      biến mất vì canvas chỉ giữ pixel. Không có bước nào gửi file gốc đi.
   2. CHE MẶT: trình sửa cho phép dán nhãn / che đen / làm nhoè vùng mặt.
      Nhãn được "nung" thẳng vào pixel ảnh xuất ra — không phải lớp phủ
      CSS có thể bóc ra được.
   ======================================================================= */
(function (window, document) {
  "use strict";

  var CFG = (window.CFS_CONFIG && window.CFS_CONFIG.images) || {};
  var MAX_DIM = CFG.maxDimension || 1600;
  var QUALITY = CFG.quality || 0.82;
  var MAX_BYTES = (CFG.maxFileMB || 10) * 1024 * 1024;

  var EMOJIS = ["😶‍🌫️", "🙈", "😎", "🐱", "🌸", "⭐", "💜", "🫥"];
  var uid = 0;

  /* ------------------------------ tiện ích ------------------------------ */
  function el(sel, root) { return (root || document).querySelector(sel); }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------------- đọc file -> canvas sạch ---------------------- */
  function load(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error("Không có file nào."));
      if (!/^image\//.test(file.type)) return reject(new Error("Chỉ nhận file ảnh (JPG, PNG, WEBP, GIF)."));
      if (file.size > MAX_BYTES) {
        return reject(new Error("Ảnh nặng quá — tối đa " + (CFG.maxFileMB || 10) + "MB."));
      }

      var url = URL.createObjectURL(file);
      var img = new Image();
      img.decoding = "sync";

      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return reject(new Error("Không đọc được ảnh này."));

        var s = Math.min(1, MAX_DIM / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));

        var base = document.createElement("canvas");
        base.width = cw; base.height = ch;
        var ctx = base.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        // Bước quyết định: chỉ pixel được copy sang, EXIF không đi theo.
        ctx.drawImage(img, 0, 0, cw, ch);

        resolve({ id: "img" + (++uid), base: base, stickers: [] });
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("File ảnh bị lỗi hoặc không hỗ trợ."));
      };
      img.src = url;
    });
  }

  /* ------------------- vẽ ảnh + nhãn che lên canvas ------------------- */
  function paint(item, canvas, scale) {
    var b = item.base;
    var w = Math.max(1, Math.round(b.width * scale));
    var h = Math.max(1, Math.round(b.height * scale));
    canvas.width = w; canvas.height = h;

    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(b, 0, 0, w, h);

    item.stickers.forEach(function (st) {
      var x = st.x * scale, y = st.y * scale, sw = st.w * scale, sh = st.h * scale;
      if (sw < 1 || sh < 1) return;

      if (st.type === "mosaic") {
        var px = Math.max(3, Math.round(Math.min(st.w, st.h) / 7));
        var tw = Math.max(1, Math.round(st.w / px)), th = Math.max(1, Math.round(st.h / px));
        var tmp = document.createElement("canvas");
        tmp.width = tw; tmp.height = th;
        tmp.getContext("2d").drawImage(b, st.x, st.y, st.w, st.h, 0, 0, tw, th);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, tw, th, x, y, sw, sh);
        ctx.restore();
      } else if (st.type === "emoji") {
        ctx.save();
        roundRect(ctx, x, y, sw, sh, Math.min(sw, sh) * 0.24);
        ctx.fillStyle = "rgba(20,16,34,.92)";
        ctx.fill();
        ctx.font = Math.floor(Math.min(sw, sh) * 0.78) + "px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(st.glyph || "🙈", x + sw / 2, y + sh / 2 + Math.min(sw, sh) * 0.04);
        ctx.restore();
      } else { // block
        ctx.save();
        roundRect(ctx, x, y, sw, sh, Math.min(sw, sh) * 0.18);
        ctx.fillStyle = "#0d0b16";
        ctx.fill();
        ctx.restore();
      }
    });

    return canvas;
  }

  function flatten(item) {
    var out = document.createElement("canvas");
    paint(item, out, 1);
    return out;
  }

  function toBlob(item) {
    var c = flatten(item);
    return new Promise(function (resolve, reject) {
      if (c.toBlob) {
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("Không xuất được ảnh.")); }, "image/jpeg", QUALITY);
      } else {
        try {
          var d = c.toDataURL("image/jpeg", QUALITY);
          var bin = atob(d.split(",")[1]);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: "image/jpeg" }));
        } catch (e) { reject(e); }
      }
    });
  }

  function toDataURL(item, maxDim) {
    var c = flatten(item);
    if (maxDim && Math.max(c.width, c.height) > maxDim) {
      var s = maxDim / Math.max(c.width, c.height);
      var small = document.createElement("canvas");
      small.width = Math.round(c.width * s); small.height = Math.round(c.height * s);
      small.getContext("2d").drawImage(c, 0, 0, small.width, small.height);
      c = small;
    }
    return c.toDataURL("image/jpeg", QUALITY);
  }

  function thumbURL(item, size) {
    var c = flatten(item);
    var s = (size || 320) / Math.max(c.width, c.height);
    var t = document.createElement("canvas");
    t.width = Math.max(1, Math.round(c.width * s));
    t.height = Math.max(1, Math.round(c.height * s));
    t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
    return t.toDataURL("image/jpeg", 0.8);
  }

  /* ============================== EDITOR ============================== */
  var ED = {
    item: null, onDone: null, tool: "emoji", glyph: EMOJIS[0],
    scale: 1, drag: null, moved: false
  };

  function stageScale(item) {
    var stage = el("#editorStage");
    var availW = stage.clientWidth || 320;
    var availH = stage.clientHeight || 360;
    return Math.min(availW / item.base.width, availH / item.base.height, 1);
  }

  function redraw() {
    if (!ED.item) return;
    var cv = el("#editorCanvas");
    ED.scale = stageScale(ED.item);
    paint(ED.item, cv, ED.scale);

    // Khung đang kéo
    if (ED.drag && ED.drag.live) {
      var d = ED.drag, ctx = cv.getContext("2d");
      var x = Math.min(d.x0, d.x1) * ED.scale, y = Math.min(d.y0, d.y1) * ED.scale;
      var w = Math.abs(d.x1 - d.x0) * ED.scale, h = Math.abs(d.y1 - d.y0) * ED.scale;
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#e879f9";
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    var n = ED.item.stickers.length;
    el("#editorCount").textContent = n ? n + " nhãn che" : "Chưa có nhãn che nào";
    el("#edDone").disabled = false;
  }

  function pointToBase(e) {
    var cv = el("#editorCanvas");
    var r = cv.getBoundingClientRect();
    var x = (e.clientX - r.left) * (cv.width / r.width) / ED.scale;
    var y = (e.clientY - r.top) * (cv.height / r.height) / ED.scale;
    return {
      x: Math.max(0, Math.min(ED.item.base.width, x)),
      y: Math.max(0, Math.min(ED.item.base.height, y))
    };
  }

  function hitSticker(p) {
    for (var i = ED.item.stickers.length - 1; i >= 0; i--) {
      var s = ED.item.stickers[i];
      if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) return i;
    }
    return -1;
  }

  function addSticker(x, y, w, h) {
    var minSide = Math.max(12, Math.min(ED.item.base.width, ED.item.base.height) * 0.04);
    if (w < minSide || h < minSide) return false;
    ED.item.stickers.push({
      type: ED.tool, glyph: ED.glyph,
      x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h)
    });
    return true;
  }

  function bindEditorOnce() {
    if (ED.bound) return;
    ED.bound = true;

    var cv = el("#editorCanvas");

    cv.addEventListener("pointerdown", function (e) {
      if (!ED.item) return;
      try { if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId); } catch (err) {}
      var p = pointToBase(e);
      ED.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, live: true };
      ED.moved = false;
      e.preventDefault();
    });

    cv.addEventListener("pointermove", function (e) {
      if (!ED.drag) return;
      var p = pointToBase(e);
      ED.drag.x1 = p.x; ED.drag.y1 = p.y;
      if (Math.abs(p.x - ED.drag.x0) > 4 || Math.abs(p.y - ED.drag.y0) > 4) ED.moved = true;
      redraw();
      e.preventDefault();
    });

    function endDrag(e) {
      if (!ED.drag) return;
      var d = ED.drag;
      ED.drag = null;

      if (ED.moved) {
        addSticker(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1),
                   Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      } else {
        // Chạm (không kéo) vào nhãn có sẵn -> xoá nhãn đó
        var i = hitSticker({ x: d.x0, y: d.y0 });
        if (i > -1) ED.item.stickers.splice(i, 1);
      }
      redraw();
      if (e) e.preventDefault();
    }
    cv.addEventListener("pointerup", endDrag);
    cv.addEventListener("pointercancel", endDrag);
    cv.addEventListener("pointerleave", function () { if (ED.drag) endDrag(); });

    el("#editorTools").addEventListener("click", function (e) {
      var b = e.target.closest("[data-tool]");
      if (!b) return;
      ED.tool = b.dataset.tool;
      Array.prototype.forEach.call(this.querySelectorAll("[data-tool]"), function (x) {
        var on = x === b;
        x.classList.toggle("is-active", on);
        x.setAttribute("aria-pressed", String(on));
      });
      el("#editorGlyphs").hidden = ED.tool !== "emoji";
    });

    el("#editorGlyphs").addEventListener("click", function (e) {
      var b = e.target.closest("[data-glyph]");
      if (!b) return;
      ED.glyph = b.dataset.glyph;
      Array.prototype.forEach.call(this.querySelectorAll("[data-glyph]"), function (x) {
        x.classList.toggle("is-active", x === b);
      });
    });

    el("#edUndo").addEventListener("click", function () { ED.item.stickers.pop(); redraw(); });
    el("#edClear").addEventListener("click", function () { ED.item.stickers = []; redraw(); });

    el("#edAuto").addEventListener("click", function () {
      var btn = this;
      btn.disabled = true;
      btn.textContent = "Đang tìm...";
      detectFaces(ED.item).then(function (boxes) {
        boxes.forEach(function (b) {
          var pad = Math.min(b.width, b.height) * 0.12;
          addSticker(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
        });
        redraw();
        btn.textContent = boxes.length ? "Đã che " + boxes.length + " mặt" : "Không thấy mặt nào";
        setTimeout(function () { btn.textContent = "Tự tìm mặt"; btn.disabled = false; }, 1800);
      });
    });

    el("#edDone").addEventListener("click", function () {
      var cb = ED.onDone; var it = ED.item;
      closeEditor();
      if (cb) cb(it);
    });

    el("#imgEditor").addEventListener("click", function (e) {
      if (e.target.closest("[data-eclose]")) closeEditor();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ED.item) closeEditor();
    });
    window.addEventListener("resize", function () { if (ED.item) redraw(); });
  }

  /* Tự tìm mặt: chỉ khả dụng trên trình duyệt có FaceDetector (Chrome/Android).
     Không có thì nút bị ẩn, người dùng che tay. */
  function detectFaces(item) {
    if (!("FaceDetector" in window)) return Promise.resolve([]);
    try {
      var fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 12 });
      return fd.detect(item.base).then(function (faces) {
        return (faces || []).map(function (f) { return f.boundingBox; });
      }).catch(function () { return []; });
    } catch (e) { return Promise.resolve([]); }
  }

  function openEditor(item, onDone) {
    var modal = el("#imgEditor");
    if (!modal) return;
    bindEditorOnce();

    ED.item = item;
    ED.onDone = onDone;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    el("#edAuto").hidden = !("FaceDetector" in window);

    // Chờ layout xong mới đo khung để scale đúng
    requestAnimationFrame(function () { requestAnimationFrame(redraw); });
  }

  function closeEditor() {
    var modal = el("#imgEditor");
    if (modal) modal.hidden = true;
    document.body.style.overflow = "";
    ED.item = null; ED.onDone = null; ED.drag = null;
  }

  /* ------------------------------ export ------------------------------ */
  window.CFS_IMAGEKIT = {
    EMOJIS: EMOJIS,
    load: load,
    paint: paint,
    flatten: flatten,
    toBlob: toBlob,
    toDataURL: toDataURL,
    thumbURL: thumbURL,
    openEditor: openEditor,
    closeEditor: closeEditor,
    hasCover: function (item) { return !!(item && item.stickers && item.stickers.length); }
  };
})(window, document);
