/* =======================================================================
   TGU Confessions — Google Apps Script backend
   Chạy hoàn toàn trong Google Drive của admin. Không cần server, không tốn phí.

   NÓ LÀM GÌ
   - Nhận confession từ trang web tĩnh (người gửi KHÔNG cần đăng nhập)
   - Lưu ảnh vào một thư mục trong Drive của admin, đặt quyền "ai có link cũng xem"
   - Ghi cfs vào Sheet, mặc định trạng thái "pending" (chờ duyệt)
   - Trả về danh sách cfs ĐÃ DUYỆT cho trang web
   - Cộng dồn thống kê ẩn danh (lượt ghé / chủ đề được xem / chủ đề được gửi)

   NÓ KHÔNG LÀM GÌ
   - Không ghi IP, không ghi email, không ghi user-agent, không cookie.
     Apps Script không cấp IP người gửi cho script, nên kể cả muốn cũng không có.
   - Thống kê chỉ là những ô số cộng dồn. Không có dòng nào ứng với một người.

   CÁCH CÀI (5 phút) — xem README.md mục 3
   1. Tạo Google Sheet mới trong Drive của bạn.
   2. Extensions -> Apps Script. Xoá code mẫu, dán toàn bộ file này vào.
   3. Chạy hàm `setup` một lần (chọn setup trên thanh công cụ -> Run).
      Nó tạo các sheet, tạo thư mục ảnh, và tạo tài khoản quản trị mặc định.
   4. Deploy -> New deployment -> chọn type "Web app":
         Execute as        : Me
         Who has access    : Anyone
      -> Deploy -> copy "Web app URL" (dạng .../exec)
   5. Mở admin.html của trang, dán URL đó + đăng nhập bằng tài khoản quản trị.
      Mọi thiết lập khác (tên trang, giới hạn, bật/tắt ảnh...) làm ngay trong
      tab "Cài đặt" sau khi đăng nhập — không cần sửa code nữa.
   6. ⚠ ĐỔI MẬT KHẨU NGAY: chạy setAdminPassword("mật khẩu mới") trong Apps
      Script, hoặc đổi trong tab "Cài đặt". Lý do: file Code.gs này nằm trong
      repo public nên mật khẩu mặc định ai cũng đọc được.

   Mật khẩu KHÔNG được lưu dạng chữ ở bất cứ đâu — chỉ lưu SHA-256(salt|pass)
   trong Script Properties của Apps Script, nằm trong Drive của bạn.

   Mỗi lần sửa code này, phải Deploy -> Manage deployments -> Edit -> Version:
   New version -> Deploy, nếu không thì bản cũ vẫn đang chạy.
   ======================================================================= */

var CFG = {
  SHEET_INBOX: 'Inbox',
  SHEET_STATS: 'Stats',
  SHEET_COMMENTS: 'Comments',

  PROP_USER: 'ADMIN_USER',
  PROP_SALT: 'ADMIN_SALT',
  PROP_HASH: 'ADMIN_HASH',
  PROP_DEFAULT: 'ADMIN_PASS_IS_DEFAULT',
  PROP_SESSIONS: 'ADMIN_SESSIONS',
  PROP_SETTINGS: 'SITE_SETTINGS',
  PROP_FOLDER: 'DRIVE_FOLDER_ID',
  FOLDER_NAME: 'TGU Confessions - anh',

  /* Tài khoản quản trị mặc định, chỉ dùng cho lần setup() đầu tiên.
     Mật khẩu KHÔNG được lưu ở đâu dạng chữ thường — chỉ lưu hash + salt
     trong Script Properties (nằm trong Drive của bạn, không nằm trong repo).
     ⚠ File này nếu commit lên repo public thì mật khẩu mặc định là công khai.
     Hãy chạy setAdminPassword('mật khẩu mới của bạn') ngay sau khi deploy. */
  DEFAULT_USER: 'admin@datnguyen',
  DEFAULT_PASS: 'admin_262729@',

  SESSION_HOURS: 8,
  MAX_SESSIONS: 20,

  MIN_CHARS: 20,
  MAX_CHARS: 3000,
  MAX_IMAGES: 3,
  MAX_IMAGE_BYTES: 6 * 1024 * 1024,   // mỗi ảnh sau khi nén, tính trên bytes thật
  CATEGORIES: ['crush', 'tamsu', 'hoctap', 'gopy', 'vui', 'khac'],

  MIN_COMMENT_CHARS: 2,
  MAX_COMMENT_CHARS: 400,
  MAX_COMMENTS_PER_CFS: 500,          // chặn một cfs bị dội bình luận vô hạn

  // Cột của sheet Inbox (1-based)
  COL: {
    id: 1, submittedAt: 2, category: 3, content: 4, images: 5, status: 6, number: 7,
    fileIds: 8, displayDate: 9, likes: 10, dislikes: 11
  },

  // Cột của sheet Comments (1-based)
  CCOL: { id: 1, createdAt: 2, cfsNumber: 3, name: 4, content: 5, status: 6, displayDate: 7 }
};

/* Những thứ admin sửa được ngay trên trang quản trị, không cần mở code.
   Trang công khai đọc các giá trị này khi tải, ghi đè lên config.js. */
var DEFAULT_SETTINGS = {
  siteName: 'TGU Confessions',
  siteShortName: 'TGU CFS',
  school: 'Đại học Tiền Giang',
  tagline: 'Sân chơi ẩn danh của sinh viên',
  fanpage: '',
  minChars: 20,
  maxChars: 3000,
  maxSubmitsPerWindow: 3,
  windowMinutes: 60,
  imagesEnabled: true,
  maxImages: 3,
  adviseFaceCover: true,
  analyticsEnabled: true,
  feedPageSize: 9,
  commentsEnabled: true,
  maxCommentChars: 400,
  /* Cfs không kèm ảnh -> lên bảng tin ngay, không cần admin duyệt.
     Cfs có ảnh thì luôn phải qua admin (vì ảnh có thể lộ mặt người khác). */
  autoApproveNoImages: true,
  paused: false,
  pausedMessage: 'Page đang tạm nghỉ nhận cfs, bạn quay lại sau nhé 🌷'
};

var HEADERS = ['id', 'submittedAt', 'category', 'content', 'images', 'status', 'number',
               'fileIds', 'displayDate', 'likes', 'dislikes'];
var COMMENT_HEADERS = ['id', 'createdAt', 'cfsNumber', 'name', 'content', 'status', 'displayDate'];

/* ============================== SETUP ============================== */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Hãy tạo script này từ trong một Google Sheet (Extensions > Apps Script).');

  var inbox = ss.getSheetByName(CFG.SHEET_INBOX);
  if (!inbox) {
    inbox = ss.insertSheet(CFG.SHEET_INBOX);
    inbox.appendRow(HEADERS);
    inbox.setFrozenRows(1);
    inbox.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    inbox.setColumnWidth(CFG.COL.content, 460);
  }

  var stats = ss.getSheetByName(CFG.SHEET_STATS);
  if (!stats) {
    stats = ss.insertSheet(CFG.SHEET_STATS);
    stats.appendRow(['key', 'value']);
    stats.setFrozenRows(1);
    stats.getRange(1, 1, 1, 2).setFontWeight('bold');
  }

  commentsSheet();   // tạo sheet Comments nếu chưa có

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(CFG.PROP_HASH)) {
    saveAccount(CFG.DEFAULT_USER, CFG.DEFAULT_PASS, true);
  }
  getFolder();   // tạo thư mục ảnh ngay để chắc chắn có quyền

  Logger.log('==========================================================');
  Logger.log('Đăng nhập trang quản trị (admin.html):');
  Logger.log('  Tên đăng nhập : ' + props.getProperty(CFG.PROP_USER));
  Logger.log('  Mật khẩu      : ' + (props.getProperty(CFG.PROP_DEFAULT) === '1'
             ? 'đang dùng mật khẩu MẶC ĐỊNH trong Code.gs' : '(mật khẩu bạn đã tự đặt)'));
  if (props.getProperty(CFG.PROP_DEFAULT) === '1') {
    Logger.log('');
    Logger.log('⚠ CẢNH BÁO: Code.gs nằm trong repo public thì mật khẩu mặc định');
    Logger.log('  cũng công khai. Hãy chạy ngay:');
    Logger.log('     setAdminPassword("mật khẩu mới của bạn")');
  }
  Logger.log('Thư mục ảnh trong Drive: ' + getFolder().getName());
  Logger.log('==========================================================');
  return 'OK — xem log phía trên.';
}

/* ---------------------- tài khoản quản trị ---------------------- */
/* Đổi cả tên đăng nhập và mật khẩu */
function setAdminAccount(user, pass) {
  if (!user || String(user).trim().length < 3) throw new Error('Tên đăng nhập quá ngắn.');
  checkPasswordStrength(pass);
  saveAccount(String(user).trim(), String(pass), false);
  logoutAll();
  Logger.log('Đã đổi tài khoản quản trị thành: ' + String(user).trim());
  return 'OK';
}

/* Chỉ đổi mật khẩu, giữ nguyên tên đăng nhập */
function setAdminPassword(pass) {
  var props = PropertiesService.getScriptProperties();
  var user = props.getProperty(CFG.PROP_USER) || CFG.DEFAULT_USER;
  checkPasswordStrength(pass);
  saveAccount(user, String(pass), false);
  logoutAll();
  Logger.log('Đã đổi mật khẩu. Mọi phiên đăng nhập cũ đã bị thu hồi.');
  return 'OK';
}

function checkPasswordStrength(pass) {
  var p = String(pass || '');
  if (p.length < 10) throw new Error('Mật khẩu phải dài từ 10 ký tự.');
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) throw new Error('Mật khẩu cần có cả chữ và số.');
  if (p === CFG.DEFAULT_PASS) throw new Error('Đừng dùng lại mật khẩu mặc định trong Code.gs.');
}

function saveAccount(user, pass, isDefault) {
  var salt = Utilities.getUuid() + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_USER: user,
    ADMIN_SALT: salt,
    ADMIN_HASH: hashPass(pass, salt),
    ADMIN_PASS_IS_DEFAULT: isDefault ? '1' : '0'
  });
}

/* Mật khẩu không bao giờ được lưu dạng chữ. Chỉ lưu SHA-256 của salt+pass. */
function hashPass(pass, salt) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(salt) + '|' + String(pass), Utilities.Charset.UTF_8);
  return raw.map(function (b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

/* Thu hồi toàn bộ phiên đăng nhập */
function logoutAll() {
  PropertiesService.getScriptProperties().setProperty(CFG.PROP_SESSIONS, '{}');
  return 'OK';
}

/* ============================== ROUTER ============================== */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  if (!action) {
    return HtmlService.createHtmlOutput(
      '<div style="font:15px/1.6 system-ui;padding:24px;max-width:560px">' +
      '<h2 style="margin:0 0 10px">TGU Confessions — backend đang chạy ✅</h2>' +
      '<p>Đây là địa chỉ API, không phải trang web. Dán URL này vào ' +
      '<code>backend.appsScript.webAppUrl</code> trong <code>assets/js/config.js</code>.</p>' +
      '<p style="color:#666">Nếu bạn vừa sửa code: Deploy → Manage deployments → Edit → ' +
      'Version: New version → Deploy.</p></div>');
  }
  try {
    if (action === 'list') return json({ ok: true, items: listApproved() });
    if (action === 'bootstrap') return json({ ok: true, settings: getSettings(), items: listApproved() });
    if (action === 'ping') return json({ ok: true, counted: ping(e.parameter) });
    return json({ ok: false, error: 'Hành động không hợp lệ: ' + action });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json({ ok: false, error: 'Dữ liệu gửi lên không phải JSON hợp lệ.' });
  }

  var action = body.action || '';
  try {
    /* ---- công khai ---- */
    if (action === 'submit')    return json(submitConfession(body));
    if (action === 'ping')      return json({ ok: true, counted: ping(body) });
    if (action === 'list')      return json({ ok: true, items: listApproved(), nextNumber: nextNumber() });
    /* bình luận: ai cũng đọc/gửi được, tên do server tự random */
    if (action === 'comments')  return json({ ok: true, items: listComments(body.number) });
    if (action === 'comment')   return json(addComment(body));
    if (action === 'react')     return json(react(body));
    /* một lượt gọi lấy cả cài đặt + danh sách, để trang tải nhanh hơn */
    if (action === 'bootstrap') return json({ ok: true, settings: getSettings(), items: listApproved(), nextNumber: nextNumber() });

    /* ---- đăng nhập bằng tên + mật khẩu ---- */
    if (action === 'login') { ensureAdminAccount(); return json(login(body)); }

    /* ---- cần phiên đăng nhập hợp lệ ---- */
    if (['session', 'logout', 'pending', 'approved', 'approve', 'unapprove', 'reject',
         'update', 'remove', 'stats', 'saveSettings', 'changePassword',
         'adminComments', 'removeComment'].indexOf(action) > -1) {
      if (!checkSession(body.token)) {
        Utilities.sleep(400);
        return json({ ok: false, error: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại nhé.', auth: false });
      }
      if (action === 'session')        return json({ ok: true, info: adminInfo(), settings: getSettings() });
      if (action === 'logout')         return json(endSession(body.token));
      if (action === 'pending')        return json({ ok: true, items: listByStatus('pending') });
      if (action === 'approved')       return json({ ok: true, items: listByStatus('approved') });
      if (action === 'reject')         return json(setStatus(body.id, 'rejected'));
      if (action === 'unapprove')      return json(setStatus(body.id, 'pending'));
      if (action === 'approve')        return json(approve(body));
      if (action === 'update')         return json(updateRow(body));
      if (action === 'remove')         return json(removeRow(body.id));
      if (action === 'stats')          return json({ ok: true, stats: readStats(body.days || 14) });
      if (action === 'adminComments')  return json({ ok: true, items: listCommentsForAdmin(body.limit) });
      if (action === 'removeComment')  return json(removeComment(body.id));
      if (action === 'saveSettings')   return json(saveSettings(body));
      if (action === 'changePassword') return json(changePassword(body));
    }
    return json({ ok: false, error: 'Hành động không hợp lệ: ' + action });
  } catch (err) {
    var out = { ok: false, error: String(err && err.message || err) };
    if (err && err.auth) out.auth = true;
    return json(out);
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================== AUTH ============================== */
/* Đăng nhập bằng tên + mật khẩu, trả về một session token có thời hạn.
   Client chỉ giữ session token trong sessionStorage — mật khẩu không bao giờ
   được lưu ở phía trình duyệt. */
function login(body) {
  var props = PropertiesService.getScriptProperties();
  var user = props.getProperty(CFG.PROP_USER);
  var salt = props.getProperty(CFG.PROP_SALT);
  var hash = props.getProperty(CFG.PROP_HASH);
  if (!hash) throw new Error('Chưa cài đặt tài khoản. Hãy chạy hàm setup() trong Apps Script một lần.');

  var u = String(body.user || '').trim();
  var p = String(body.pass || '');

  Utilities.sleep(450);   // làm chậm dò mật khẩu bằng máy

  var okUser = u.toLowerCase() === String(user).toLowerCase();
  var okPass = constantEquals(hashPass(p, salt), hash);
  if (!okUser || !okPass) {
    var e = new Error('Tên đăng nhập hoặc mật khẩu không đúng.');
    e.auth = true;
    throw e;
  }

  var token = newSession();
  return { ok: true, token: token, info: adminInfo(), settings: getSettings() };
}

function constantEquals(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

function readSessions() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(CFG.PROP_SESSIONS);
    var o = raw ? JSON.parse(raw) : {};
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}

function writeSessions(o) {
  PropertiesService.getScriptProperties().setProperty(CFG.PROP_SESSIONS, JSON.stringify(o));
}

function newSession() {
  var all = readSessions();
  var now = Date.now();

  // dọn phiên đã hết hạn
  Object.keys(all).forEach(function (k) { if (!all[k] || all[k] < now) delete all[k]; });

  // giới hạn số phiên: bỏ phiên cũ nhất
  var keys = Object.keys(all);
  while (keys.length >= CFG.MAX_SESSIONS) {
    var oldest = keys.reduce(function (a, b) { return all[a] < all[b] ? a : b; });
    delete all[oldest];
    keys = Object.keys(all);
  }

  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  all[token] = now + CFG.SESSION_HOURS * 3600 * 1000;
  writeSessions(all);
  return token;
}

function checkSession(token) {
  var t = String(token || '');
  if (t.length < 32) return false;
  var all = readSessions();
  var exp = all[t];
  if (!exp || exp < Date.now()) {
    if (exp) { delete all[t]; writeSessions(all); }
    return false;
  }
  return true;
}

function endSession(token) {
  var all = readSessions();
  if (all[String(token)]) { delete all[String(token)]; writeSessions(all); }
  return { ok: true };
}

function adminInfo() {
  var sh = inboxSheet();
  var rows = sh.getLastRow() - 1;
  var counts = { pending: 0, approved: 0, rejected: 0 };
  if (rows > 0) {
    sh.getRange(2, CFG.COL.status, rows, 1).getValues().forEach(function (r) {
      var s = String(r[0] || 'pending');
      if (counts[s] != null) counts[s]++;
    });
  }
  var props = PropertiesService.getScriptProperties();
  var folder = getFolder();
  return {
    user: props.getProperty(CFG.PROP_USER) || '',
    usingDefaultPassword: props.getProperty(CFG.PROP_DEFAULT) === '1',
    counts: counts,
    total: rows,
    folder: folder.getName(),
    folderUrl: 'https://drive.google.com/drive/folders/' + folder.getId(),
    sheet: SpreadsheetApp.getActiveSpreadsheet().getName(),
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    nextNumber: nextNumber()
  };
}

/* ============================== CÀI ĐẶT ============================== */
function getSettings() {
  var raw = PropertiesService.getScriptProperties().getProperty(CFG.PROP_SETTINGS);
  var saved = {};
  try { saved = raw ? JSON.parse(raw) : {}; } catch (e) { saved = {}; }
  var out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    out[k] = (saved[k] === undefined || saved[k] === null) ? DEFAULT_SETTINGS[k] : saved[k];
  });
  return out;
}

function saveSettings(body) {
  var s = getSettings();
  var incoming = body.settings || {};
  var num = function (v, lo, hi, dflt) {
    var n = Number(v);
    if (isNaN(n)) return dflt;
    return Math.max(lo, Math.min(hi, Math.round(n)));
  };
  var str = function (v, max, dflt) {
    var t = String(v == null ? '' : v).trim();
    return t ? t.slice(0, max) : dflt;
  };

  s.siteName = str(incoming.siteName, 60, DEFAULT_SETTINGS.siteName);
  s.siteShortName = str(incoming.siteShortName, 24, DEFAULT_SETTINGS.siteShortName);
  s.school = str(incoming.school, 80, DEFAULT_SETTINGS.school);
  s.tagline = str(incoming.tagline, 120, DEFAULT_SETTINGS.tagline);

  var fp = String(incoming.fanpage == null ? '' : incoming.fanpage).trim();
  s.fanpage = /^https?:\/\//i.test(fp) ? fp.slice(0, 300) : '';

  s.minChars = num(incoming.minChars, 5, 500, DEFAULT_SETTINGS.minChars);
  s.maxChars = num(incoming.maxChars, Math.max(s.minChars + 10, 100), 10000, DEFAULT_SETTINGS.maxChars);
  s.maxSubmitsPerWindow = num(incoming.maxSubmitsPerWindow, 1, 50, DEFAULT_SETTINGS.maxSubmitsPerWindow);
  s.windowMinutes = num(incoming.windowMinutes, 1, 1440, DEFAULT_SETTINGS.windowMinutes);
  s.maxImages = num(incoming.maxImages, 1, CFG.MAX_IMAGES, DEFAULT_SETTINGS.maxImages);
  s.feedPageSize = num(incoming.feedPageSize, 3, 60, DEFAULT_SETTINGS.feedPageSize);
  s.maxCommentChars = num(incoming.maxCommentChars, 20, CFG.MAX_COMMENT_CHARS, DEFAULT_SETTINGS.maxCommentChars);

  s.imagesEnabled = !!incoming.imagesEnabled;
  s.adviseFaceCover = !!incoming.adviseFaceCover;
  s.analyticsEnabled = !!incoming.analyticsEnabled;
  s.commentsEnabled = !!incoming.commentsEnabled;
  s.autoApproveNoImages = !!incoming.autoApproveNoImages;
  s.paused = !!incoming.paused;
  s.pausedMessage = str(incoming.pausedMessage, 200, DEFAULT_SETTINGS.pausedMessage);

  // Giới hạn của server luôn thắng cấu hình của trang
  CFG.MIN_CHARS = s.minChars;
  CFG.MAX_CHARS = s.maxChars;

  PropertiesService.getScriptProperties().setProperty(CFG.PROP_SETTINGS, JSON.stringify(s));
  return { ok: true, settings: s };
}

/* Đổi mật khẩu ngay trên trang quản trị */
function changePassword(body) {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty(CFG.PROP_SALT);
  var hash = props.getProperty(CFG.PROP_HASH);
  if (!constantEquals(hashPass(String(body.oldPass || ''), salt), hash)) {
    throw new Error('Mật khẩu hiện tại không đúng.');
  }
  checkPasswordStrength(body.newPass);
  var user = String(body.user || props.getProperty(CFG.PROP_USER) || '').trim();
  if (user.length < 3) throw new Error('Tên đăng nhập quá ngắn.');
  saveAccount(user, String(body.newPass), false);
  logoutAll();
  return { ok: true, loggedOut: true };
}

/* ============================== SHEETS ============================== */
function inboxSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Script này phải được tạo từ trong một Google Sheet ' +
                    '(mở Sheet → Extensions → Apps Script).');
  }
  var sh = ss.getSheetByName(CFG.SHEET_INBOX);
  if (!sh) {
    /* Tự tạo thay vì bắt lỗi: quên chạy setup() thì trang vẫn hoạt động. */
    sh = ss.insertSheet(CFG.SHEET_INBOX);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setColumnWidth(CFG.COL.content, 460);
  }
  return ensureColumns(sh);
}

/* Bảo đảm có tài khoản quản trị, kể cả khi chưa ai chạy setup() */
function ensureAdminAccount() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(CFG.PROP_HASH)) {
    saveAccount(CFG.DEFAULT_USER, CFG.DEFAULT_PASS, true);
  }
}

/* Sheet dựng từ bản cũ chỉ có 9 cột — thêm cột likes/dislikes cho đủ,
   để không phải chạy lại setup() hay tạo Sheet mới. */
function ensureColumns(sh) {
  var need = HEADERS.length;
  var have = sh.getMaxColumns();
  if (have < need) sh.insertColumnsAfter(have, need - have);
  var head = sh.getRange(1, 1, 1, need).getValues()[0];
  for (var i = 0; i < need; i++) {
    if (String(head[i] || '') !== HEADERS[i]) {
      sh.getRange(1, i + 1).setValue(HEADERS[i]).setFontWeight('bold');
    }
  }
  return sh;
}
function statsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SHEET_STATS);
  if (!sh) { sh = ss.insertSheet(CFG.SHEET_STATS); sh.appendRow(['key', 'value']); sh.setFrozenRows(1); }
  return sh;
}

/* Sheet bình luận — tự tạo nếu chưa có, để bản cũ không cần chạy lại setup() */
function commentsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SHEET_COMMENTS);
  if (!sh) {
    sh = ss.insertSheet(CFG.SHEET_COMMENTS);
    sh.appendRow(COMMENT_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, COMMENT_HEADERS.length).setFontWeight('bold');
    sh.setColumnWidth(CFG.CCOL.content, 420);
  }
  return sh;
}

function allComments() {
  var sh = commentsSheet();
  var n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  var vals = sh.getRange(2, 1, n, COMMENT_HEADERS.length).getValues();
  return vals.map(function (r, i) {
    return {
      row: i + 2,
      id: String(r[CFG.CCOL.id - 1] || ''),
      createdAt: r[CFG.CCOL.createdAt - 1],
      cfsNumber: Number(r[CFG.CCOL.cfsNumber - 1] || 0),
      name: String(r[CFG.CCOL.name - 1] || ''),
      content: String(r[CFG.CCOL.content - 1] || ''),
      status: String(r[CFG.CCOL.status - 1] || 'visible'),
      displayDate: fmtDate(r[CFG.CCOL.displayDate - 1] || r[CFG.CCOL.createdAt - 1])
    };
  });
}

/* Đếm bình luận của từng cfs, để thẻ trên bảng tin hiện sẵn con số */
function commentCounts() {
  var out = {};
  allComments().forEach(function (c) {
    if (c.status !== 'visible') return;
    out[c.cfsNumber] = (out[c.cfsNumber] || 0) + 1;
  });
  return out;
}

/* Danh sách công khai của một cfs: KHÔNG kèm id, không kèm giờ chính xác */
function listComments(number) {
  var n = Number(number || 0);
  if (!n) return [];
  return allComments()
    .filter(function (c) { return c.cfsNumber === n && c.status === 'visible'; })
    .map(function (c) { return { name: c.name, content: c.content, date: c.displayDate }; });
}

/* ------------------------- tên ẩn danh ngẫu nhiên -------------------------
   Do server sinh, người bình luận không chọn được — nên không ai tự nhận là
   ai. Không lưu bất cứ thứ gì nhận dạng người gửi. */
var NICK_ADJ = [
  'Vô Danh', 'Bí Ẩn', 'Lười Biếng', 'Ngái Ngủ', 'Thầm Lặng', 'Ẩn Mình', 'Hay Cười',
  'Mít Ướt', 'Tò Mò', 'Vui Tính', 'Đi Ngang', 'Lang Thang', 'Ngơ Ngác', 'Trầm Tính',
  'Mộng Mơ', 'Bối Rối', 'Giấu Mặt', 'Thức Khuya', 'Dễ Thương', 'Nhút Nhát'
];
var NICK_NOUN = [
  'Mèo', 'Cún', 'Cá Heo', 'Gấu', 'Cú', 'Sóc', 'Thỏ', 'Hươu', 'Panda', 'Cáo',
  'Chim Sẻ', 'Rùa', 'Sao Biển', 'Nhím', 'Vịt', 'Ong', 'Bướm', 'Hạc', 'Cừu', 'Hổ Con'
];

function randomNick() {
  var a = NICK_NOUN[Math.floor(Math.random() * NICK_NOUN.length)];
  var b = NICK_ADJ[Math.floor(Math.random() * NICK_ADJ.length)];
  var n = 10 + Math.floor(Math.random() * 90);
  return a + ' ' + b + ' ' + n;
}

/* Tránh hai người trong cùng một cfs trùng tên */
function uniqueNick(taken) {
  for (var i = 0; i < 12; i++) {
    var nick = randomNick();
    if (taken.indexOf(nick) < 0) return nick;
  }
  return randomNick() + '-' + Utilities.getUuid().slice(0, 4);
}

/* ============================ BÌNH LUẬN ============================ */
function addComment(body) {
  var S = getSettings();
  if (!S.commentsEnabled) throw new Error('Bình luận đang tắt.');

  var number = Number(body.number || 0);
  var content = String(body.content || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  var maxC = Math.min(S.maxCommentChars || CFG.MAX_COMMENT_CHARS, CFG.MAX_COMMENT_CHARS);

  if (content.length < CFG.MIN_COMMENT_CHARS) throw new Error('Bình luận quá ngắn.');
  if (content.length > maxC) throw new Error('Bình luận quá dài (tối đa ' + maxC + ' ký tự).');

  /* Chỉ cho bình luận cfs đã đăng */
  var okCfs = false;
  allRows().forEach(function (r) { if (r.status === 'approved' && r.number === number) okCfs = true; });
  if (!okCfs) throw new Error('Không tìm thấy confession số ' + number + ' trên bảng tin.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var saved;
  try {
    var mine = allComments().filter(function (c) { return c.cfsNumber === number; });
    if (mine.length >= CFG.MAX_COMMENTS_PER_CFS) {
      throw new Error('Cfs này đã quá nhiều bình luận.');
    }
    var nick = uniqueNick(mine.map(function (c) { return c.name; }));
    var now = new Date();
    var row = [];
    row[CFG.CCOL.id - 1] = Utilities.getUuid();
    row[CFG.CCOL.createdAt - 1] = now;
    row[CFG.CCOL.cfsNumber - 1] = number;
    row[CFG.CCOL.name - 1] = nick;
    row[CFG.CCOL.content - 1] = content;
    row[CFG.CCOL.status - 1] = 'visible';
    row[CFG.CCOL.displayDate - 1] = fmtDate(now);
    commentsSheet().appendRow(row);
    saved = { name: nick, content: content, date: fmtDate(now) };
  } finally {
    lock.releaseLock();
  }

  bump('comment');
  return { ok: true, comment: saved, count: listComments(number).length };
}

/* ---- dành cho trang quản trị ---- */
function listCommentsForAdmin(limit) {
  var max = Math.max(1, Math.min(Number(limit || 200), 1000));
  return allComments()
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })
    .slice(0, max)
    .map(function (c) {
      return {
        id: c.id, cfsNumber: c.cfsNumber, name: c.name, content: c.content,
        status: c.status, createdAt: c.createdAt ? String(c.createdAt) : '', date: c.displayDate
      };
    });
}

function removeComment(id) {
  var rows = allComments();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === String(id)) {
      commentsSheet().deleteRow(rows[i].row);
      return { ok: true, removed: 1 };
    }
  }
  throw new Error('Không tìm thấy bình luận cần xoá.');
}

function allRows() {
  var sh = inboxSheet();
  var n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  var vals = sh.getRange(2, 1, n, HEADERS.length).getValues();
  return vals.map(function (r, i) {
    return {
      row: i + 2,
      id: String(r[CFG.COL.id - 1] || ''),
      submittedAt: r[CFG.COL.submittedAt - 1],
      category: String(r[CFG.COL.category - 1] || 'khac'),
      content: String(r[CFG.COL.content - 1] || ''),
      images: splitImages(r[CFG.COL.images - 1]),
      status: String(r[CFG.COL.status - 1] || 'pending'),
      number: Number(r[CFG.COL.number - 1] || 0),
      fileIds: String(r[CFG.COL.fileIds - 1] || ''),
      displayDate: fmtDate(r[CFG.COL.displayDate - 1] || r[CFG.COL.submittedAt - 1]),
      likes: Math.max(0, Number(r[CFG.COL.likes - 1] || 0)),
      dislikes: Math.max(0, Number(r[CFG.COL.dislikes - 1] || 0))
    };
  });
}

function splitImages(v) {
  if (!v) return [];
  return String(v).split(/[\s,]+/).filter(function (s) { return /^https?:\/\//.test(s); });
}

function fmtDate(v) {
  if (!v) return '';
  var d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v).slice(0, 10);
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
}

function findRow(id) {
  var rows = allRows();
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  throw new Error('Không tìm thấy confession với id: ' + id);
}

/* ---- danh sách công khai: chỉ cfs đã duyệt, KHÔNG kèm id/thời điểm gửi ---- */
function listApproved() {
  var counts = commentCounts();
  return allRows()
    .filter(function (r) { return r.status === 'approved'; })
    .map(function (r) {
      return {
        number: r.number, date: r.displayDate, category: r.category,
        content: r.content, images: r.images, comments: counts[r.number] || 0,
        likes: r.likes, dislikes: r.dislikes
      };
    })
    .sort(function (a, b) { return b.number - a.number; });
}

function listByStatus(status) {
  var counts = commentCounts();
  return allRows()
    .filter(function (r) { return r.status === status; })
    .map(function (r) {
      return {
        id: r.id, number: r.number, date: r.displayDate, category: r.category,
        content: r.content, images: r.images, status: r.status,
        likes: r.likes, dislikes: r.dislikes, comments: counts[r.number] || 0,
        submittedAt: r.submittedAt ? String(r.submittedAt) : ''
      };
    })
    .sort(function (a, b) {
      if (status === 'approved') return b.number - a.number;
      return String(b.submittedAt).localeCompare(String(a.submittedAt));
    });
}

function nextNumber() {
  var max = 0;
  allRows().forEach(function (r) { if (r.number > max) max = r.number; });
  return max + 1;
}

/* ============================== GỬI CFS ============================== */
function submitConfession(body) {
  var S = getSettings();
  if (S.paused) throw new Error(S.pausedMessage || 'Page đang tạm nghỉ nhận cfs.');

  var content = String(body.content || '').trim();
  var category = String(body.category || 'khac').trim();
  var images = body.images || [];

  var minC = S.minChars || CFG.MIN_CHARS, maxC = S.maxChars || CFG.MAX_CHARS;
  var maxImg = Math.min(S.maxImages || CFG.MAX_IMAGES, CFG.MAX_IMAGES);

  if (content.length < minC) throw new Error('Nội dung quá ngắn (tối thiểu ' + minC + ' ký tự).');
  if (content.length > maxC) throw new Error('Nội dung quá dài (tối đa ' + maxC + ' ký tự).');
  if (CFG.CATEGORIES.indexOf(category) < 0) category = 'khac';
  if (!Array.isArray(images)) images = [];
  if (!S.imagesEnabled) images = [];
  if (images.length > maxImg) throw new Error('Tối đa ' + maxImg + ' ảnh mỗi confession.');

  var urls = [], ids = [];
  for (var i = 0; i < images.length; i++) {
    var saved = saveImage(images[i], i);
    if (saved) { urls.push(saved.url); ids.push(saved.id); }
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var num = 0;
  /* Không kèm ảnh -> lên bảng tin ngay. Có ảnh -> chờ admin xem đã,
     vì ảnh là chỗ dễ lộ mặt người khác nhất. */
  var status = (urls.length === 0 && S.autoApproveNoImages !== false) ? 'approved' : 'pending';
  try {
    var sh = inboxSheet();
    var id = Utilities.getUuid();
    var now = new Date();
    /* Cấp số ngay lúc gửi, để người gửi biết cfs của mình là số mấy.
       Admin vẫn sửa được số này ở bước duyệt. */
    num = nextNumber();
    var row = [];
    row[CFG.COL.id - 1] = id;
    row[CFG.COL.submittedAt - 1] = now;
    row[CFG.COL.category - 1] = category;
    row[CFG.COL.content - 1] = content;
    row[CFG.COL.images - 1] = urls.join('\n');
    row[CFG.COL.status - 1] = status;
    row[CFG.COL.number - 1] = num;
    row[CFG.COL.fileIds - 1] = ids.join(',');
    row[CFG.COL.displayDate - 1] = fmtDate(now);
    row[CFG.COL.likes - 1] = 0;
    row[CFG.COL.dislikes - 1] = 0;
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }

  bump('submit:' + category);
  if (status === 'approved') bump('autoapprove');
  return { ok: true, images: urls, number: num, nextNumber: num + 1, status: status };
}

/* ============================ THƯƠNG / KHÔNG ĐỒNG TÌNH ============================
   Không tài khoản, nên chống gian lận chỉ ở mức vừa đủ: mỗi lượt gọi đổi
   nhiều nhất 1 đơn vị mỗi loại, và số không bao giờ xuống dưới 0. */
function react(body) {
  var number = Number(body.number || 0);
  var dLike = clampDelta(body.like);
  var dDislike = clampDelta(body.dislike);
  if (!dLike && !dDislike) throw new Error('Không có gì để cập nhật.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var target = null;
    allRows().forEach(function (r) {
      if (r.status === 'approved' && r.number === number) target = r;
    });
    if (!target) throw new Error('Không tìm thấy confession số ' + number + ' trên bảng tin.');

    var sh = inboxSheet();
    var likes = Math.max(0, target.likes + dLike);
    var dislikes = Math.max(0, target.dislikes + dDislike);
    if (dLike) sh.getRange(target.row, CFG.COL.likes).setValue(likes);
    if (dDislike) sh.getRange(target.row, CFG.COL.dislikes).setValue(dislikes);
    return { ok: true, number: number, likes: likes, dislikes: dislikes };
  } finally {
    lock.releaseLock();
  }
}

function clampDelta(v) {
  var n = Number(v);
  if (isNaN(n) || !n) return 0;
  return n > 0 ? 1 : -1;
}

/* Lưu 1 ảnh data URL vào Drive, trả về link xem được công khai */
function saveImage(dataUrl, idx) {
  var s = String(dataUrl || '');
  var m = s.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;

  var bytes = Utilities.base64Decode(m[2].replace(/\s+/g, ''));
  if (bytes.length > CFG.MAX_IMAGE_BYTES) throw new Error('Ảnh quá nặng (tối đa 6MB sau khi nén).');

  var ext = m[1] === 'image/png' ? 'png' : (m[1] === 'image/webp' ? 'webp' : 'jpg');
  var name = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyyMMdd-HHmmss') +
             '-' + Utilities.getUuid().slice(0, 8) + '-' + idx + '.' + ext;

  var blob = Utilities.newBlob(bytes, m[1], name);
  var file = getFolder().createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // Một số tài khoản trường học chặn chia sẻ công khai -> báo rõ cho admin
    throw new Error('Không đặt được quyền xem công khai cho ảnh. ' +
      'Tài khoản Drive của bạn (thường là account @student/@edu) có thể đang bị hạn chế chia sẻ ra ngoài. ' +
      'Hãy dùng một account Google cá nhân cho script này.');
  }
  return { id: file.getId(), url: 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w1600' };
}

function getFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CFG.PROP_FOLDER);
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (f && !f.isTrashed()) return f;
    } catch (e) { /* thư mục bị xoá -> tạo lại */ }
  }
  var it = DriveApp.getFoldersByName(CFG.FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(CFG.FOLDER_NAME);
  props.setProperty(CFG.PROP_FOLDER, folder.getId());
  return folder;
}

/* ============================== DUYỆT CFS ============================== */
function approve(body) {
  var r = findRow(body.id);
  var sh = inboxSheet();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var num = Number(body.number || 0) || (r.number || nextNumber());
    if (body.content != null) {
      var c = String(body.content).trim();
      if (c.length < CFG.MIN_CHARS) throw new Error('Nội dung quá ngắn.');
      if (c.length > CFG.MAX_CHARS) throw new Error('Nội dung quá dài.');
      sh.getRange(r.row, CFG.COL.content).setValue(c);
    }
    if (body.category && CFG.CATEGORIES.indexOf(body.category) > -1) {
      sh.getRange(r.row, CFG.COL.category).setValue(body.category);
    }
    if (body.images != null && Array.isArray(body.images)) {
      // admin có thể bỏ bớt ảnh trước khi đăng
      sh.getRange(r.row, CFG.COL.images).setValue(body.images.join('\n'));
    }
    sh.getRange(r.row, CFG.COL.number).setValue(num);
    sh.getRange(r.row, CFG.COL.status).setValue('approved');
    if (!r.displayDate) sh.getRange(r.row, CFG.COL.displayDate).setValue(fmtDate(new Date()));
    return { ok: true, number: num, nextNumber: nextNumber() };
  } finally {
    lock.releaseLock();
  }
}

function setStatus(id, status) {
  var r = findRow(id);
  inboxSheet().getRange(r.row, CFG.COL.status).setValue(status);
  return { ok: true, status: status };
}

function updateRow(body) {
  var r = findRow(body.id);
  var sh = inboxSheet();
  if (body.content != null) {
    var c = String(body.content).trim();
    if (c.length < CFG.MIN_CHARS) throw new Error('Nội dung quá ngắn.');
    if (c.length > CFG.MAX_CHARS) throw new Error('Nội dung quá dài.');
    sh.getRange(r.row, CFG.COL.content).setValue(c);
  }
  if (body.category && CFG.CATEGORIES.indexOf(body.category) > -1) {
    sh.getRange(r.row, CFG.COL.category).setValue(body.category);
  }
  if (body.number != null && Number(body.number) > 0) {
    sh.getRange(r.row, CFG.COL.number).setValue(Number(body.number));
  }
  if (Array.isArray(body.images)) {
    sh.getRange(r.row, CFG.COL.images).setValue(body.images.join('\n'));
  }
  return { ok: true };
}

/* Xoá hẳn: bỏ dòng khỏi Sheet và chuyển ảnh vào thùng rác Drive */
function removeRow(id) {
  var r = findRow(id);
  if (r.fileIds) {
    r.fileIds.split(',').forEach(function (fid) {
      if (!fid) return;
      try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) {}
    });
  }
  inboxSheet().deleteRow(r.row);
  return { ok: true };
}

/* ============================== THỐNG KÊ ============================== */
/* Chỉ cộng dồn số. Một key = một ô số. Không có gì nhận dạng người ghé. */
function ping(p) {
  var type = String((p && p.type) || '').trim();
  var cat = String((p && p.category) || '').trim();
  if (type === 'visit') { bump('visit:' + fmtDate(new Date())); return 'visit'; }
  if (type === 'catview' && CFG.CATEGORIES.indexOf(cat) > -1) { bump('catview:' + cat); return 'catview'; }
  return '';
}

function bump(key, by) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return;   // thống kê không quan trọng bằng cfs, mất 1 lượt cũng được
  try {
    var sh = statsSheet();
    var n = sh.getLastRow() - 1;
    var keys = n > 0 ? sh.getRange(2, 1, n, 1).getValues() : [];
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === key) {
        var cell = sh.getRange(i + 2, 2);
        cell.setValue(Number(cell.getValue() || 0) + (by || 1));
        return;
      }
    }
    sh.appendRow([key, by || 1]);
  } finally {
    lock.releaseLock();
  }
}

function readStats(days) {
  days = Math.max(1, Math.min(90, Number(days) || 14));
  var sh = statsSheet();
  var n = sh.getLastRow() - 1;
  var raw = n > 0 ? sh.getRange(2, 1, n, 2).getValues() : [];

  var visitsByDay = {}, catViews = {}, submits = {}, totalVisits = 0;
  raw.forEach(function (r) {
    var k = String(r[0] || ''), v = Number(r[1] || 0);
    if (k.indexOf('visit:') === 0) { visitsByDay[k.slice(6)] = v; totalVisits += v; }
    else if (k.indexOf('catview:') === 0) catViews[k.slice(8)] = v;
    else if (k.indexOf('submit:') === 0) submits[k.slice(7)] = v;
  });

  // Chuỗi ngày liên tục để biểu đồ không bị hổng
  var series = [], tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
  for (var i = days - 1; i >= 0; i--) {
    var d = new Date(Date.now() - i * 86400000);
    var key = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    series.push({ date: key, visits: visitsByDay[key] || 0 });
  }

  // Số cfs đã đăng theo chủ đề (từ dữ liệu thật, không phải bộ đếm)
  var publishedByCat = {}, pendingByCat = {};
  allRows().forEach(function (r) {
    if (r.status === 'approved') publishedByCat[r.category] = (publishedByCat[r.category] || 0) + 1;
    if (r.status === 'pending') pendingByCat[r.category] = (pendingByCat[r.category] || 0) + 1;
  });

  return {
    days: days,
    totalVisits: totalVisits,
    series: series,
    catViews: catViews,
    submits: submits,
    publishedByCat: publishedByCat,
    pendingByCat: pendingByCat,
    counts: adminInfo().counts
  };
}
