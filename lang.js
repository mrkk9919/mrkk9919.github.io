(function () {
  "use strict";
  window.__mbLangLoaded = true;

  var STORE_KEY = "mb_lang";
  var LANGS = ["en", "vi", "km"];

  // [en, vi, km, prefixMode]  prefixMode: 0 exact only, "p" label followed by ":"/"/(" / "·", "s" also allows a space (phrases inside titles)
  var DICT = [
    ["Home", "Trang chủ", "ទំព័រដើម"],
    ["Scanner", "Trình quét", "ម៉ាស៊ីនស្កេន"],
    ["Notifications", "Thông báo", "ការជូនដំណឹង"],
    ["Settings", "Cài đặt", "ការកំណត់"],
    ["Referral", "Giới thiệu", "ណែនាំមិត្តភក្តិ"],
    ["Good morning,", "Chào buổi sáng,", "អរុណសួស្តី,"],
    ["Transaction history", "Lịch sử giao dịch", "ប្រវត្តិប្រតិបត្តិការ"],
    ["ADD", "THÊM", "បន្ថែម"],
    ["Main features", "Tính năng chính", "មុខងារសំខាន់"],
    ["See all", "Xem tất cả", "មើលទាំងអស់"],
    ["Domestic transfer", "Chuyển tiền nội địa", "ផ្ទេរប្រាក់ក្នុងស្រុក"],
    ["International transfer", "Chuyển tiền quốc tế", "ផ្ទេរប្រាក់អន្តរជាតិ"],
    ["Savings & Investment", "Tiết kiệm & Đầu tư", "សន្សំ និងវិនិយោគ"],
    ["Loan", "Khoản vay", "កម្ចី"],
    ["Mobile top-up", "Nạp tiền điện thoại", "បញ្ចូលទូរស័ព្ទ"],
    ["ATM withdrawal", "Rút tiền ATM", "ដកប្រាក់តាម ATM"],
    ["Show balance", "Hiện số dư", "បង្ហាញសមតុល្យ"],
    ["Hide balance", "Ẩn số dư", "លាក់សមតុល្យ"],
    ["Payment account", "Tài khoản thanh toán", "គណនីទូទាត់", "p"],
    ["Savings account", "Tài khoản tiết kiệm", "គណនីសន្សំ", "p"],
    ["List of Accounts", "Danh sách tài khoản", "បញ្ជីគណនី", "p"],
    ["Balance", "Số dư", "សមតុល្យ"],
    ["Exchanged", "Đã quy đổi", "ប្តូរប្រាក់"],
    ["Default", "Mặc định", "លំនាំដើម"],
    ["Add", "Thêm", "បន្ថែម"],
    ["Detail Account", "Chi tiết tài khoản", "ព័ត៌មានគណនី"],
    ["Recent transaction", "Giao dịch gần đây", "ប្រតិបត្តិការថ្មីៗ"],
    ["See more", "Xem thêm", "មើលបន្ថែម"],
    ["Export Statement", "Xuất sao kê", "ទាញយករបាយការណ៍"],
    ["Sample transactions", "Giao dịch mẫu", "ប្រតិបត្តិការគំរូ", "s"],
    ["Transaction details", "Chi tiết giao dịch", "ព័ត៌មានប្រតិបត្តិការ"],
    ["AMOUNT", "SỐ TIỀN", "ចំនួនទឹកប្រាក់"],
    ["Amount", "Số tiền", "ចំនួនទឹកប្រាក់"],
    ["From", "Từ", "ពី"],
    ["To", "Đến", "ទៅ"],
    ["Status", "Trạng thái", "ស្ថានភាព"],
    ["Success", "Thành công", "ជោគជ័យ"],
    ["Pending", "Đang xử lý", "កំពុងរង់ចាំ"],
    ["Transfer amount", "Số tiền chuyển", "ចំនួនទឹកប្រាក់ផ្ទេរ"],
    ["Transaction time", "Thời gian giao dịch", "ពេលវេលាប្រតិបត្តិការ"],
    ["Transaction code", "Mã giao dịch", "លេខកូដប្រតិបត្តិការ", "p"],
    ["External Txn Ref", "Mã tham chiếu ngoài", "ឯកសារយោងខាងក្រៅ"],
    ["Description", "Nội dung", "ការពិពណ៌នា"],
    ["Share", "Chia sẻ", "ចែករំលែក"],
    ["Latest transactions", "Giao dịch mới nhất", "ប្រតិបត្តិការថ្មីៗ"],
    ["No transaction records yet.", "Chưa có bản ghi giao dịch.", "មិនទាន់មានកំណត់ត្រាប្រតិបត្តិការនៅឡើយទេ។"],
    ["Loading transactions...", "Đang tải giao dịch...", "កំពុងផ្ទុកប្រតិបត្តិការ..."],
    ["GENERAL", "CHUNG", "ទូទៅ"],
    ["TRANSACTION", "GIAO DỊCH", "ប្រតិបត្តិការ"],
    ["Checking account", "Tài khoản thanh toán", "គណនីទូទាត់"],
    ["Receiver bank", "Ngân hàng nhận", "ធនាគារទទួល"],
    ["Merchant ID", "Mã cửa hàng", "លេខកូដហាង"],
    ["Payment", "Thanh toán", "ការទូទាត់"],
    ["Recipient account", "Tài khoản người nhận", "គណនីអ្នកទទួល", "p"],
    ["Account", "Tài khoản", "គណនី", "s"],
    ["Cancel", "Hủy", "បោះបង់"],
    ["Confirm", "Xác nhận", "បញ្ជាក់"],
    ["Set amount", "Nhập số tiền", "កំណត់ចំនួនទឹកប្រាក់"],
    ["Generating…", "Đang tạo…", "កំពុងបង្កើត…"],
    ["Scan QR", "Quét mã QR", "ស្កេន QR"],
    ["SELECT RECEIVING ACCOUNT:", "CHỌN TÀI KHOẢN NHẬN:", "ជ្រើសរើសគណនីទទួល:"],
    ["Open Bakong to pay", "Mở Bakong để thanh toán", "បើក Bakong ដើម្បីទូទាត់"],
    ["Transaction ID", "Mã giao dịch", "លេខសម្គាល់ប្រតិបត្តិការ"],
    ["Try again", "Thử lại", "ព្យាយាមម្តងទៀត"],
    ["Identification Documents", "Giấy tờ tùy thân", "ឯកសារអត្តសញ្ញាណ"],
    ["Utilities", "Tiện ích", "ឧបករណ៍ប្រើប្រាស់"],
    ["FaceID Auto Login", "Đăng nhập tự động FaceID", "ចូលដោយស្វ័យប្រវត្តិ FaceID"],
    ["In-house Transfer Via Phone Number", "Chuyển nội bộ qua số điện thoại", "ផ្ទេរក្នុងធនាគារតាមលេខទូរស័ព្ទ"],
    ["Digital OTP", "OTP điện tử", "OTP ឌីជីថល"],
    ["Face Authentication Limit", "Giới hạn xác thực khuôn mặt", "ដែនកំណត់ផ្ទៀងផ្ទាត់ផ្ទៃមុខ"],
    ["Easy Payment", "Thanh toán nhanh", "ការទូទាត់ងាយស្រួល"],
    ["Unlink Devices", "Hủy liên kết thiết bị", "ផ្តាច់ឧបករណ៍"],
    ["Change Password", "Đổi mật khẩu", "ប្តូរពាក្យសម្ងាត់"],
    ["Change Language", "Đổi ngôn ngữ", "ប្តូរភាសា"],
    ["Push Notification", "Thông báo đẩy", "ការជូនដំណឹងផ្គូផ្គង"],
    ["Contact Us", "Liên hệ chúng tôi", "ទំនាក់ទំនងយើង"],
    ["Partial", "Một phần", "មួយផ្នែក"],
    ["Verify Online", "Xác minh trực tuyến", "ផ្ទៀងផ្ទាត់តាមអ៊ីនធឺណិត"],
    ["Choose language", "Chọn ngôn ngữ", "ជ្រើសរើសភាសា"],
    ["Select your preferred language", "Chọn ngôn ngữ bạn muốn", "ជ្រើសរើសភាសាដែលអ្នកចូលចិត្ត"],
    ["Done", "Xong", "រួចរាល់"],
    ["Security Alert: New Device Login", "Cảnh báo bảo mật: Đăng nhập thiết bị mới", "ការជូនដំណឹងសុវត្ថិភាព: ចូលឧបករណ៍ថ្មី"],
    ["New", "Mới", "ថ្មី"],
    ["✦ New", "✦ Mới", "✦ ថ្មី"],
    ["Send to", "Gửi đến", "ផ្ញើទៅ", "s"],
    ["Received from", "Nhận từ", "បានទទួលពី", "s"],
    ["KHQR payment to", "Thanh toán KHQR đến", "ទូទាត់ KHQR ទៅ", "s"],
    ["Payment to", "Thanh toán đến", "ទូទាត់ទៅ", "s"],
    ["Transfer to", "Chuyển đến", "ផ្ទេរទៅ", "s"],
    ["Top-up", "Nạp tiền", "បញ្ចូលទឹកប្រាក់", "s"],
    ["Add account", "Thêm tài khoản", "បន្ថែមគណនី"],
    ["Account added", "Đã thêm tài khoản", "បានបន្ថែមគណនី"],
    ["Transactions refreshed", "Đã làm mới giao dịch", "បានធ្វើឱ្យប្រតិបត្តិការថ្មី"],
    ["Copy account number", "Sao chép số tài khoản", "ចម្លងលេខគណនី"],
    ["Reference copied", "Đã sao chép mã tham chiếu", "បានចម្លងលេខយោង"],
    ["Referral link copied", "Đã sao chép liên kết giới thiệu", "បានចម្លងតំណណែនាំ"],
    ["Full statement is a demo feature", "Sao kê đầy đủ là tính năng demo", "របាយការណ៍ពេញលេញជាមុខងារសាកល្បង"],
    ["Statement export is a demo feature", "Xuất sao kê là tính năng demo", "ការទាញយករបាយការណ៍ជាមុខងារសាកល្បង"],
    ["Online verification is a demo feature", "Xác minh trực tuyến là tính năng demo", "ការផ្ទៀងផ្ទាត់តាមអ៊ីនធឺណិតជាមុខងារសាកល្បង"]
  ];

  var exact = {};
  var prefixes = [];

  function buildIndex() {
    DICT.forEach(function (entry) {
      LANGS.forEach(function (lang, i) {
        var value = entry[i];
        if (!value) return;
        if (!exact[value]) exact[value] = entry;
      });
      if (entry[3]) prefixes.push(entry);
    });
    prefixes.sort(function (a, b) {
      return Math.max(b[0].length, b[1].length, b[2].length) - Math.max(a[0].length, a[1].length, a[2].length);
    });
  }
  buildIndex();

  function targetOf(entry, lang) {
    if (lang === "en") return entry[0];
    if (lang === "vi") return entry[1];
    return entry[2];
  }

  function boundaryOk(rest, mode) {
    if (!rest) return false;
    var first = rest.charAt(0);
    if (first === ":" || first === "(" || first === "·") return true;
    if (mode !== "s" || first !== " ") return false;
    var trimmed = rest.trim();
    if (!trimmed) return false;
    return true;
  }

  function translateText(text, lang) {
    if (!text) return null;
    var lead = text.match(/^\s*/)[0];
    var trail = text.match(/\s*$/)[0];
    var core = text.slice(lead.length, text.length - trail.length);
    if (!core) return null;

    var entry = exact[core];
    if (entry) {
      var direct = targetOf(entry, lang);
      return direct && direct !== core ? lead + direct + trail : null;
    }

    for (var i = 0; i < prefixes.length; i++) {
      var item = prefixes[i];
      var mode = item[3];
      for (var j = 0; j < LANGS.length; j++) {
        var source = item[j];
        if (!source || core.indexOf(source) !== 0) continue;
        if (lang === LANGS[j]) continue;
        if (!boundaryOk(core.slice(source.length), mode)) continue;
        var target = targetOf(item, lang);
        if (!target) continue;
        return lead + target + core.slice(source.length) + trail;
      }
    }
    return null;
  }

  function translateNode(node, lang) {
    var value = node.nodeValue;
    var next = translateText(value, lang);
    if (next && next !== value) node.nodeValue = next;
  }

  function translateAttributes(el, lang) {
    ["placeholder", "aria-label", "title", "alt"].forEach(function (attr) {
      if (!el.hasAttribute || !el.hasAttribute(attr)) return;
      var value = el.getAttribute(attr);
      var next = translateText(value, lang);
      if (next && next !== value) el.setAttribute(attr, next);
    });
  }

  function walk(root, lang) {
    if (!root) return;
    if (root.nodeType === 3) {
      translateNode(root, lang);
      return;
    }
    if (root.nodeType === 1) {
      var tag = root.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;
      translateAttributes(root, lang);
      var children = root.childNodes;
      for (var i = 0; i < children.length; i++) walk(children[i], lang);
    }
  }

  var currentLang = "";
  var timer = 0;
  var applying = false;

  function apply(lang) {
    if (LANGS.indexOf(lang) === -1) return;
    currentLang = lang;
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) {}
    document.documentElement.setAttribute("lang", lang === "km" ? "km" : (lang === "vi" ? "vi" : "en"));
    if (timer) window.clearTimeout(timer);
    applying = true;
    walk(document.body, lang);
    window.setTimeout(function () { applying = false; }, 0);
    document.dispatchEvent(new CustomEvent("mb:language-changed", { detail: { lang: lang } }));
  }

  function schedule(lang) {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      timer = 0;
      if (!lang || !document.body) return;
      applying = true;
      walk(document.body, lang);
      window.setTimeout(function () { applying = false; }, 0);
    }, 80);
  }

  function init() {
    var stored = "";
    try { stored = localStorage.getItem(STORE_KEY) || ""; } catch (e) {}
    var lang = LANGS.indexOf(stored) !== -1 ? stored : "en";
    var observer = new MutationObserver(function (records) {
      if (applying) return;
      if (!stored && !currentLang) return;
      var langNow = currentLang || lang;
      records.forEach(function (record) {
        if (record.type === "characterData") translateNode(record.target, langNow);
        else if (record.type === "childList") {
          for (var i = 0; i < record.addedNodes.length; i++) walk(record.addedNodes[i], langNow);
        } else if (record.type === "attributes") translateAttributes(record.target, langNow);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "aria-label", "title", "alt"] });
    if (stored && LANGS.indexOf(stored) !== -1) {
      currentLang = stored;
      document.documentElement.setAttribute("lang", stored);
      walk(document.body, stored);
    }
  }

  window.mbI18n = {
    apply: apply,
    get: function () { return currentLang || "en"; },
    languages: LANGS
  };

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
