/* ============================================================
   Scan QR + payment flow
   - live camera capture (getUserMedia) decoded with jsQR
   - upload a QR image and decode it the same way
   - KHQR / EMVCo payload parsing, then a payment sheet
   ============================================================ */
(function () {
  "use strict";

  var overlay = document.getElementById("qr-scan");
  if (!overlay || overlay.dataset.ready) return;
  overlay.dataset.ready = "1";

  var backBtn = overlay.querySelector(".back-button");
  var flashBtn = document.getElementById("qr-flash");
  var flashState = document.getElementById("qr-flash-state");
  var uploadBtn = document.getElementById("qr-upload");
  var fileInput = document.getElementById("qr-file");
  var instruction = document.getElementById("qr-instruction");
  var cameraHint = document.getElementById("qr-camera-hint");
  var video = document.getElementById("qr-camera");
  var selectedBox = document.getElementById("qr-selected");
  var selectedImg = document.getElementById("qr-selected-img");
  var selectedFile = document.getElementById("qr-selected-file");
  var selectedName = document.getElementById("qr-selected-name");
  var toast = document.getElementById("qr-toast");

  /* --- 收付款流程：金额 -> 确认 -> Digital OTP -> 成功 --- */
  var flow = document.getElementById("pay-flow");
  var stepAmount = document.getElementById("pf-step-amount");
  var stepConfirm = document.getElementById("pf-step-confirm");
  var stepSuccess = document.getElementById("pf-step-success");
  var otpOverlay = document.getElementById("pf-otp");
  var otpDots = document.getElementById("pf-otp-dots");
  var otpError = document.getElementById("pf-otp-error");
  var otpDone = document.getElementById("pf-otp-done");
  var otpForgot = document.getElementById("pf-otp-forgot");
  var pfMerchant = document.getElementById("pf-merchant");
  var pfBillBank = document.getElementById("pf-bill-bank");
  var billAvatar = document.getElementById("bill-avatar");
  var pfCur = document.getElementById("pf-cur");
  var pfAmount = document.getElementById("pf-amount");
  var pfAmountHint = document.getElementById("pf-amount-hint");
  var pfNote = document.getElementById("pf-note");
  var pfFromName = document.getElementById("pf-from-name");
  var pfFromAccount = document.getElementById("pf-from-account");
  var pfFromBalance = document.getElementById("pf-from-balance");
  var changeAccountBtn = document.getElementById("pf-change-account");
  var accountPicker = document.getElementById("pf-account-picker");
  var accountPickerList = document.getElementById("pf-account-picker-list");
  var pfNext = document.getElementById("pf-next");
  var pfConfirmAmount = document.getElementById("pf-confirm-amount");
  var pfConfirmCur = document.getElementById("pf-confirm-cur");
  var pfConfirmUsd = document.getElementById("pf-confirm-usd");
  var pfConfirmFromName = document.getElementById("pf-confirm-from-name");
  var pfConfirmMerchant = document.getElementById("pf-confirm-merchant");
  var pfConfirmBank = document.getElementById("pf-confirm-bank");
  var pfConfirmToMark = document.getElementById("pf-confirm-to-mark");
  var pfSumFrom = document.getElementById("pf-sum-from");
  var pfRate = document.getElementById("pf-rate");
  var pfSumTotal = document.getElementById("pf-sum-total");
  var pfFeeCur = document.getElementById("pf-fee-cur");
  var pfConfirmNote = document.getElementById("pf-confirm-note");
  var pfStatus = document.getElementById("pf-status");
  var pfConfirmBtn = document.getElementById("pf-confirm");
  var pfSuccessAmount = document.getElementById("pf-success-amount");
  var pfSuccessTime = document.getElementById("pf-success-time");
  var pfSuccessFromName = document.getElementById("pf-success-from-name");
  var pfSuccessFrom = document.getElementById("pf-success-from");
  var pfSuccessMerchant = document.getElementById("pf-success-merchant");
  var pfSuccessBank = document.getElementById("pf-success-bank");
  var pfSuccessBankMark = document.getElementById("pf-success-bank-mark");
  var pfSuccessBankShort = document.getElementById("pf-success-bank-short");
  var pfSuccessRef = document.getElementById("pf-success-ref");
  var pfSuccessTx = document.getElementById("pf-success-tx");
  var pfSuccessNote = document.getElementById("pf-success-note");
  var pfCopyRef = document.getElementById("pf-copy-ref");
  var pfActionNew = document.getElementById("pf-action-new");
  var pfActionShot = document.getElementById("pf-action-shot");
  var pfShare = document.getElementById("pf-share");
  var pfDone = document.getElementById("pf-done");

  var envMode = null;

  var state = {
    stream: null,
    track: null,
    raf: 0,
    running: false,
    lastTick: 0,
    objectUrl: null,
    torch: false,
    paying: false,
    payment: null,
    pollTimer: 0,
    flow: null,
    current: null,
    otp: "",
    otpCompleted: false
  };

  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d", { willReadFrequently: true });
  var toastTimer = 0;

  /* ---------- helpers ---------- */

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2400);
  }

  function money(amount, currency) {
    if (amount === null || amount === undefined || amount === "") return "";
    var n = Number(amount);
    if (isNaN(n)) return "";
    var digits = currency === "KHR" ? 0 : 2;
    return n.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function symbol(currency) { return currency === "KHR" ? "\u17DB" : "$"; }

  function makeRef() {
    var t = Date.now().toString(36).toUpperCase().slice(-6);
    var r = Math.random().toString(36).toUpperCase().slice(2, 5);
    return "MB" + t + r;
  }

  var USD_KHR_RATE = 4083;

  function nowLabel() {
    var d = new Date();
    function p(n) { return n < 10 ? "0" + n : "" + n; }
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) +
      ", " + p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function otherCurrency(currency) { return currency === "KHR" ? "USD" : "KHR"; }

  function convertAmount(amount, currency) {
    return currency === "KHR" ? amount / USD_KHR_RATE : amount * USD_KHR_RATE;
  }

  function currencyAmount(amount, currency) {
    return money(amount, currency) + " " + currency;
  }

  // stable 8-digit reference number derived from the transaction ref
  function refNumber(ref) {
    var h = 0;
    String(ref || "").split("").forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) % 100000000; });
    return ("00000000" + h).slice(-8);
  }

  // 静态演示（GitHub Pages，无后端）时把成功的支付记在本地，账户明细里可查
  var LOCAL_TX_KEY = "mb_local_tx";

  function saveLocalTx(record) {
    try {
      var list = JSON.parse(localStorage.getItem(LOCAL_TX_KEY) || "[]");
      if (!(list instanceof Array)) list = [];
      if (list.some(function (item) { return item.ref === record.ref; })) return;
      list.unshift(record);
      localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(list.slice(0, 100)));
    } catch (e) { /* 忽略本地存储不可用 */ }
  }

  // brand tile assets bundled in ./assets/banks (fallback: letter mark)
  var BANK_LOGOS = {
    acleda: "acleda.png", aclb: "acleda.png", acledabank: "acleda.png",
    aba: "aba-user-logo.jpg", ababank: "aba-user-logo.jpg", abaa: "aba-user-logo.jpg",
    wing: "wing.png", wingbank: "wing.png", pipay: "pipay.png",
    truemoney: "truemoney.png",
    maybank: "maybank.png"
  };
  var RECEIVER_DEFAULT_LOGO = "./assets/banks/aba-user-logo.jpg";

  function bankLogoPath(file) {
    if (!file) return "";
    return file.charAt(0) === "." || file.indexOf("/") > -1 ? file : "./assets/banks/" + file;
  }

  function bankLogoSrc(info) {
    var accountId = String((info && info.accountId) || "");
    var suffix = accountId.indexOf("@") > -1 ? accountId.split("@").pop().toLowerCase() : "";
    if (!suffix && info && info.bank && info.bank.code) suffix = String(info.bank.code).toLowerCase();
    var file = BANK_LOGOS[suffix] || BANK_LOGOS[suffix.replace(/[^a-z0-9]/g, "")];
    return bankLogoPath(file);
  }

  function paintMark(el, logoSrc, label) {
    if (!el) return;
    el.classList.remove("has-logo");
    el.innerHTML = "";
    if (logoSrc) {
      var img = document.createElement("img");
      img.src = logoSrc;
      img.alt = label || "";
      el.appendChild(img);
      el.classList.add("has-logo");
      return;
    }
    el.textContent = bankMark(label);
  }

  function bankLabel(bank) {
    var name = String(bank || "").replace(/\(.*?\)/g, "")
      .replace(/\b(Bank|Plc\.?|PLC|Ltd\.?|Cambodia)\b/gi, "").trim();
    var first = name.split(/\s+/)[0] || "";
    return first;
  }

  function recipientBankInfo(info, payment) {
    var accountId = info && (info.accountId || info.account || info.bakongAccountId);
    var memberBank = localBank(accountId);
    if (memberBank.name !== "Bakong member bank" && memberBank.name !== "Bakong") return memberBank;
    var paymentBank = payment && payment.recipientBank;
    var stateBank = info && info.bank;
    var candidates = [paymentBank, stateBank];
    var bank = candidates.find(function (candidate) {
      var name = String(candidate && candidate.name || "").toLowerCase();
      return name && name !== "bakong" && name !== "bakong member bank";
    }) || paymentBank || stateBank || {};
    var name = bank.name || memberBank.name || "Bakong member bank";
    return {
      name: name,
      short: bankLabel(name),
      code: bank.code || "",
      logo: bankLogoSrc({ accountId: accountId, bank: bank })
    };
  }

  function displayTransactionCode(ref) {
    return String(ref || "").replace(/^(?:DEMO-|demo_)/i, "").replace(/^M(?=B)/i, "");
  }

  function bankMark(bank) {
    var name = String(bank || "").replace(/\b(Bank|Plc\.?|Ltd\.?)\b/gi, "").trim();
    if (!name) return "B";
    return name.charAt(0).toUpperCase();
  }

  function sizeAmountInput() {
    var len = String(pfAmount.value || pfAmount.placeholder || "0.00").length;
    pfAmount.style.width = Math.max(3.4, len + 0.6).toFixed(1) + "ch";
  }

  /* ---------- payload parsing ---------- */

  function tlv(text) {
    var out = {};
    var i = 0;
    while (i + 4 <= text.length) {
      var id = text.substr(i, 2);
      var len = parseInt(text.substr(i + 2, 2), 10);
      if (isNaN(len)) break;
      out[id] = text.substr(i + 4, len);
      i += 4 + len;
    }
    return out;
  }

  function bakongAccountFromQr(raw) {
    var fields = tlv(String(raw || "").trim());
    var keys = Object.keys(fields).filter(function (key) {
      var tag = Number(key);
      return tag >= 26 && tag <= 51;
    });

    for (var i = 0; i < keys.length; i++) {
      var template = fields[keys[i]];
      var nested = tlv(template);
      var candidates = [nested["00"], nested["01"], template];
      for (var j = 0; j < candidates.length; j++) {
        var match = String(candidates[j] || "").match(/[A-Z0-9._+-]+@[A-Z0-9.-]+/i);
        if (match) return match[0];
      }
    }

    // 回退：账号为纯数字（无 @bank 后缀）时也返回，保证收款账号能展示
    for (var k = 0; k < keys.length; k++) {
      var numeric = String(tlv(fields[keys[k]])["00"] || "").trim();
      if (/^[0-9]{4,}$/.test(numeric)) return numeric;
    }

    return "";
  }

  function parsePayload(raw) {
    var text = (raw || "").trim();
    if (!text) return null;

    if (/^000201/.test(text)) {
      var f = tlv(text);
      var currency = f["53"] === "116" ? "KHR" : "USD";
      var amount = f["54"] ? Number(f["54"]) : null;
      if (isNaN(amount)) amount = null;
      return {
        kind: "khqr",
        merchant: f["59"] || "KHQR merchant",
        city: f["60"] || "",
        amount: amount,
        currency: currency,
        accountId: bakongAccountFromQr(text),
        raw: text
      };
    }

    if (/^https?:\/\//i.test(text)) {
      var host = text.replace(/^https?:\/\//i, "").split("/")[0];
      return { kind: "url", merchant: host, city: "", amount: null, currency: "USD", raw: text };
    }

    return null;
  }

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "QR";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ---------- KHQR payment flow: amount -> confirm -> success ---------- */

  var API_BASE = window.MB_API_BASE || "/api";
  var fromAccount = { id: "", name: "SOKHA CHAN", currency: "USD", balance: null };
  var paymentAccounts = [];
  var lastReceipt = null;

  // Never parse the body of a failed response: on static hosting (GitHub Pages)
  // a 404/405 with an empty body can leave res.json() pending forever, which used
  // to make the scan flow look "stuck" right after the QR decoded.
  function apiFetch(path, options) {
    var opts = Object.assign({}, options || {});
    var timeoutMs = Number(opts.timeoutMs) || 30000;
    delete opts.timeoutMs;
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = 0;
    var timedOut = false;
    if (ctrl) {
      opts.signal = ctrl.signal;
      timeoutId = setTimeout(function () {
        timedOut = true;
        try { ctrl.abort(); } catch (e) {}
      }, timeoutMs);
    }
    return fetch(API_BASE + path, opts).then(function (res) {
      if (!res.ok) {
        var err = new Error("HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json().catch(function () { return {}; });
    }).then(function (data) {
      if (timeoutId) clearTimeout(timeoutId);
      return data;
    }, function (err) {
      if (timeoutId) clearTimeout(timeoutId);
      if (timedOut) {
        var timeoutError = new Error("Payment service timed out. Please try again.");
        timeoutError.code = "REQUEST_TIMEOUT";
        throw timeoutError;
      }
      throw err;
    });
  }

  function setStatus(text, tone) {
    if (!pfStatus) return;
    pfStatus.textContent = text || "";
    pfStatus.hidden = !text;
    pfStatus.dataset.tone = tone || "";
  }

  function stopPolling() {
    if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = 0; }
  }

  function showStep(name) {
    stepAmount.hidden = name !== "amount";
    stepConfirm.hidden = name !== "confirm";
    stepSuccess.hidden = name !== "success";
    flow.dataset.step = name;
  }

  function updateOtpDots() {
    if (!otpDots) return;
    var dots = otpDots.querySelectorAll("[data-otp-dot]");
    Array.prototype.forEach.call(dots, function (dot, index) {
      dot.classList.toggle("filled", index < state.otp.length);
    });
    otpDots.setAttribute("aria-label", state.otp.length + " of 6 PIN digits entered");
  }

  function openOtp() {
    state.otp = "";
    state.otpCompleted = false;
    updateOtpDots();
    if (otpError) { otpError.textContent = ""; otpError.hidden = true; }
    otpOverlay.classList.add("open");
    otpOverlay.setAttribute("aria-hidden", "false");
  }

  function closeOtp() {
    if (!otpOverlay) return;
    otpOverlay.classList.remove("open");
    otpOverlay.setAttribute("aria-hidden", "true");
    state.otp = "";
    updateOtpDots();
  }

  function enterOtpDigit(digit) {
    if (state.otp.length >= 6) return;
    state.otp += digit;
    updateOtpDots();
    if (otpError) { otpError.textContent = ""; otpError.hidden = true; }
    // 6 位输满即自动提交，不用再点 Done
    if (state.otp.length === 6) {
      window.setTimeout(function () {
        if (state.otp.length === 6 && !state.otpCompleted) submitOtp();
      }, 200);
    }
  }

  function submitOtp() {
    var filledCount = otpDots ? otpDots.querySelectorAll(".filled").length : 0;
    if (state.otp.length !== 6 || filledCount !== 6) {
      if (otpError) {
        otpError.textContent = "Enter all 6 digits to continue.";
        otpError.hidden = false;
      }
      return;
    }
    state.otpCompleted = true;
    closeOtp();
    startPayment();
  }

  function applyFromAccount() {
    pfFromName.textContent = fromAccount.name || "SOKHA CHAN";
    pfConfirmFromName.textContent = fromAccount.name || "SOKHA CHAN";
    pfFromAccount.textContent = fromAccount.id;
    pfFromBalance.textContent = fromAccount.balance === null || fromAccount.balance === undefined
      ? "" : currencyAmount(fromAccount.balance, fromAccount.currency);
    pfSumFrom.textContent = fromAccount.id ? fromAccount.id + " | " + fromAccount.currency : fromAccount.currency;
    pfSuccessFrom.textContent = pfSumFrom.textContent;
  }

  var STATIC_FALLBACK_ACCOUNT = { id: "2118997861", name: "SOKHA CHAN", currency: "USD", balance: 18265.5 };

  function normalizePaymentAccounts(list) {
    return (list || []).filter(function (account) {
      return account && account.id !== undefined && account.id !== null && String(account.id).trim();
    }).map(function (account) {
      var currency = String(account.currency || "USD").toUpperCase();
      return {
        id: String(account.id),
        name: account.name || "SOKHA CHAN",
        label: account.label || account.type || (currency + " account"),
        currency: currency,
        balance: account.balance === null || account.balance === undefined || account.balance === ""
          ? null : Number(account.balance)
      };
    });
  }

  function renderPaymentAccounts() {
    if (!accountPickerList) return;
    accountPickerList.textContent = "";
    paymentAccounts.forEach(function (account) {
      var option = document.createElement("button");
      option.type = "button";
      option.className = "account-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", account.id === fromAccount.id ? "true" : "false");

      var details = document.createElement("span");
      details.className = "account-option-details";
      var label = document.createElement("span");
      label.className = "account-option-label";
      label.textContent = account.label;
      var name = document.createElement("span");
      name.className = "account-option-name";
      name.textContent = account.name;
      var number = document.createElement("span");
      number.className = "account-option-number";
      number.textContent = account.id;
      details.appendChild(label);
      details.appendChild(name);
      details.appendChild(number);

      var balance = document.createElement("span");
      balance.className = "account-option-balance";
      balance.textContent = account.balance === null || isNaN(account.balance)
        ? account.currency
        : currencyAmount(account.balance, account.currency);
      var check = document.createElement("span");
      check.className = "account-option-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";

      option.appendChild(details);
      option.appendChild(balance);
      option.appendChild(check);
      option.addEventListener("click", function () {
        fromAccount = account;
        applyFromAccount();
        refreshAmountState();
        renderPaymentAccounts();
        closeAccountPicker();
      });
      accountPickerList.appendChild(option);
    });
  }

  function setPaymentAccounts(list, preferredId) {
    paymentAccounts = normalizePaymentAccounts(list);
    if (!paymentAccounts.length && window.mbDemoAccounts) {
      paymentAccounts = normalizePaymentAccounts(window.mbDemoAccounts);
    }
    if (!paymentAccounts.length) paymentAccounts = [STATIC_FALLBACK_ACCOUNT];

    var selected = paymentAccounts.find(function (account) {
      return preferredId && account.id === String(preferredId);
    }) || paymentAccounts.find(function (account) {
      return fromAccount.id && account.id === fromAccount.id;
    }) || paymentAccounts.find(function (account) {
      return account.currency === "USD";
    }) || paymentAccounts[0];
    fromAccount = selected;
    applyFromAccount();
    refreshAmountState();
    renderPaymentAccounts();
  }

  function openAccountPicker() {
    if (!accountPicker) return;
    renderPaymentAccounts();
    accountPicker.classList.add("open");
    accountPicker.setAttribute("aria-hidden", "false");
    if (changeAccountBtn) changeAccountBtn.setAttribute("aria-expanded", "true");
    var selected = accountPickerList && accountPickerList.querySelector('[aria-selected="true"]');
    if (selected) selected.focus();
  }

  function closeAccountPicker() {
    if (!accountPicker) return;
    accountPicker.classList.remove("open");
    accountPicker.setAttribute("aria-hidden", "true");
    if (changeAccountBtn) changeAccountBtn.setAttribute("aria-expanded", "false");
    if (changeAccountBtn) changeAccountBtn.focus();
  }

  // 演示用的 Bakong 别名 → 收款人真实账号（页面上只展示账号，不展示 @wing 这类别名）
  var RECIPIENT_ACCOUNTS = {
    "wing_khqr@wing": "000030101150606",
    "angkor.travel@acleda": "000889900112"
  };

  function displayRecipientAccount(account) {
    var raw = String(account || "");
    if (!raw) return "";
    return RECIPIENT_ACCOUNTS[raw.toLowerCase()] || raw;
  }

  function recipientAccountText(info) {
    var account = info && (
      info.merchantAccount || info.accountId || info.account || info.bakongAccountId || info.merchantId
    );
    if (account && typeof account === "object") account = account.id || account.accountId || "";
    if (!account && info && info.raw) account = bakongAccountFromQr(info.raw);
    return account ? "Recipient account: " + displayRecipientAccount(account) : "Recipient account unavailable";
  }

  // 默认沿用第一个 USD 账户，同时保留所有账户供用户切换。
  function loadFromAccount() {
    apiFetch("/internal/accounts").then(function (data) {
      setPaymentAccounts(data && data.accounts);
    }).catch(function () {
      setPaymentAccounts(window.mbDemoAccounts || [STATIC_FALLBACK_ACCOUNT]);
    });
  }

  window.addEventListener("mb:accounts-updated", function (event) {
    if (event.detail && event.detail.length) setPaymentAccounts(event.detail);
  });

  function openFlow(info) {
    state.current = info;
    state.payment = null;
    state.paying = false;
    lastReceipt = null;
    stopPolling();
    setStatus("");

    var currency = info.currency || "USD";
    var bank = (info.bank && info.bank.name) || "Bakong member bank";
    var bankShort = (info.bank && info.bank.short) || "";

    // 付款金额页顶部名称显示收款人名字
    var recipientName = (info.recipient && info.recipient.fullName) || info.merchant || "";
    pfMerchant.textContent = recipientName;
    var verified = info.recipient && info.recipient.exists
      ? " · Bakong verified" + (info.recipient.kycStatus ? " · " + info.recipient.kycStatus : "")
      : "";
    pfConfirmMerchant.textContent = recipientName;
    pfSuccessMerchant.textContent = recipientName;
    var accountId = String(info.accountId || info.account || info.bakongAccountId || "");
    pfConfirmBank.textContent = recipientAccountText(info);
    var billAccount = String(info.merchantId || accountId || "");
    if (pfBillBank) {
      pfBillBank.textContent = billAccount
        ? "Account: " + displayRecipientAccount(billAccount)
        : bank;
    }
    var markLogo = bankLogoSrc(info);
    paintMark(pfConfirmToMark, markLogo, bank);
    paintMark(billAvatar, markLogo, bank);
    pfSuccessBankMark.textContent = bankMark(bankShort || bank);
    pfSuccessBankShort.textContent = bankShort || bank;

    pfCur.textContent = currency;
    pfCur.setAttribute("data-cur", currency);
    var prefill = info.amount === null || info.amount === undefined || info.amount === "" ? "" : String(info.amount);
    if (prefill && currency === "KHR") prefill = String(Math.round(Number(prefill)));
    pfAmount.value = prefill;
    pfNote.value = ((fromAccount && fromAccount.name) || "SOKHA CHAN") + " transfer";
    sizeAmountInput();
    refreshAmountState();
    pfConfirmBtn.disabled = false;
    pfConfirmBtn.textContent = "Confirm";
    if (pfRate) pfRate.textContent = "1 USD = 4,083.00 KHR";
    pfSumFrom.textContent = fromAccount.id ? fromAccount.id + " | " + fromAccount.currency : "";
    pfSuccessFrom.textContent = pfSumFrom.textContent;

    showStep("amount");
    flow.classList.add("open");
    flow.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    stopCamera();
    loadFromAccount();
    setTimeout(function () { if (!info.amount) pfAmount.focus(); }, 260);
  }

  function closeFlow() {
    stopPolling();
    closeOtp();
    if (accountPicker) {
      accountPicker.classList.remove("open");
      accountPicker.setAttribute("aria-hidden", "true");
    }
    if (changeAccountBtn) changeAccountBtn.setAttribute("aria-expanded", "false");
    flow.classList.remove("open");
    flow.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    state.payment = null;
    state.paying = false;
    state.current = null;
    setStatus("");
  }

  function readAmount() {
    return Number(String(pfAmount.value).replace(/,/g, ""));
  }

  // 小数位：KHR 不允许小数，USD 最多 2 位
  function amountDecimals(currency) { return currency === "KHR" ? 0 : 2; }

  function amountMax(currency) { return currency === "KHR" ? 99999999999 : 99999999.99; }

  // 清洗输入：只保留数字与一个小数点，限制小数位并去掉多余前导零
  function sanitizeAmount(raw, currency) {
    var cleaned = String(raw == null ? "" : raw).replace(/[^0-9.]/g, "");
    var dot = cleaned.indexOf(".");
    if (dot > -1) {
      cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
    }
    var decimals = amountDecimals(currency);
    if (decimals === 0) {
      cleaned = cleaned.split(".")[0];
    } else if (cleaned.indexOf(".") > -1) {
      var parts = cleaned.split(".");
      cleaned = parts[0] + "." + parts[1].slice(0, decimals);
    }
    cleaned = cleaned.replace(/^0+(?=\d)/, "");
    if (cleaned.charAt(0) === ".") cleaned = "0" + cleaned;
    return cleaned;
  }

  // 校验金额：上限与可用余额
  function amountError() {
    var currency = (state.current && state.current.currency) || "USD";
    var value = readAmount();
    if (!(value > 0)) return "";
    var max = amountMax(currency);
    if (value > max) {
      return "Amount exceeds the maximum of " + currencyAmount(max, currency);
    }
    if (typeof fromAccount.balance === "number" && fromAccount.currency) {
      var inAccount = currency === fromAccount.currency ? value : convertAmount(value, currency);
      if (inAccount > fromAccount.balance) {
        return "Amount exceeds your available balance " + currencyAmount(fromAccount.balance, fromAccount.currency);
      }
    }
    return "";
  }

  function refreshAmountState() {
    var error = amountError();
    if (pfAmountHint) {
      pfAmountHint.textContent = error;
      pfAmountHint.hidden = !error;
    }
    pfNext.disabled = !!error || !(readAmount() > 0);
  }

  function openBakong() {
    if (!state.payment || !state.payment.deeplink) return;
    window.open(state.payment.deeplink, "_blank", "noopener");
    setStatus("Approve it in Bakong, then come back \u2014 this screen updates automatically.");
  }

  function goConfirm() {
    var value = readAmount();
    if (!(value > 0) || !state.current) return;
    var currency = state.current.currency || "USD";
    var alt = otherCurrency(currency);

    pfConfirmAmount.textContent = money(value, currency);
    pfConfirmCur.textContent = currency;
    pfConfirmUsd.textContent = "(" + currencyAmount(convertAmount(value, currency), alt) + ")";
    var debitAmount = currency === fromAccount.currency ? value : convertAmount(value, currency);
    pfSumTotal.textContent = currencyAmount(debitAmount, fromAccount.currency || "USD");
    pfSumFrom.textContent = fromAccount.id + " | " + fromAccount.currency;
    if (pfFeeCur) pfFeeCur.textContent = fromAccount.currency || "USD";

    var note = pfNote.value.trim();
    pfConfirmNote.textContent = note || "\u2014";

    pfConfirmBtn.disabled = false;
    pfConfirmBtn.textContent = "Confirm";
    setStatus("");
    showStep("confirm");
  }

  function simulatePayment(value) {
    state.paying = true;
    pfConfirmBtn.disabled = true;
    pfConfirmBtn.textContent = "Processing\u2026";
    setStatus("Static preview on GitHub Pages \u2014 no real Bakong call.");
    setTimeout(function () {
      state.paying = false;
      if (!state.current || !flow.classList.contains("open")) return;
      showSuccess({
        amount: value,
        currency: state.current.currency || "USD",
        merchant: state.current.merchant,
        recipientBank: state.current.bank || { name: "Bakong member bank", short: "" },
        ref: "DEMO-" + makeRef(),
        status: "paid"
      });
    }, 1500);
  }

  function startPayment() {
    if (!state.otpCompleted) {
      openOtp();
      return;
    }
    state.otpCompleted = false;
    if (state.paying || !state.current) return;
    var value = readAmount();
    if (!(value > 0)) return;
    if (envMode === "demo-static") { simulatePayment(value); return; }

    state.paying = true;
    pfConfirmBtn.disabled = true;
    pfConfirmBtn.textContent = "Processing\u2026";
    setStatus(envMode === "demo"
      ? "Demo mode: processing a preview payment; no real Bakong transfer is sent."
      : "Verifying the QR code with Bakong\u2026");

    apiFetch("/payments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr: state.current.raw,
        amount: value,
        note: pfNote.value.trim(),
        from: fromAccount.id || ""
      })
    }).then(function (payment) {
      state.payment = payment;
      if (payment.recipientBank && payment.recipientBank.name) {
        pfSuccessBank.textContent = payment.recipientBank.name;
        pfConfirmBank.textContent = recipientAccountText(Object.assign({}, state.current || {}, {
          merchantId: payment.merchantId || payment.merchantAccount ||
            (payment.recipientAccount && (payment.recipientAccount.id || payment.recipientAccount)) ||
            (state.current && state.current.merchantId)
        }));
        pfSuccessBankShort.textContent = bankLabel(payment.recipientBank.short || payment.recipientBank.name);
        paintMark(pfSuccessBankMark, bankLogoSrc(state.current), pfSuccessBankShort.textContent);
      }
      if (payment.demo) {
        pfConfirmBtn.disabled = true;
        pfConfirmBtn.textContent = "Completing demo payment\u2026";
        setStatus("Demo mode: completing the preview payment. No real funds are moved.");
      } else if (payment.deeplink) {
        pfConfirmBtn.disabled = false;
        pfConfirmBtn.textContent = "Open Bakong to pay";
        setStatus("Tap the button to approve it in Bakong. This screen only completes when Bakong confirms the transfer \u2014 never simulated.");
      } else {
        pfConfirmBtn.textContent = "Waiting for payment\u2026";
        setStatus("Waiting for the transfer to arrive. Success is shown only after Bakong confirms it.");
      }
      pollAttempt = 0;
      pollPayment();
    }).catch(function (err) {
      state.paying = false;
      pfConfirmBtn.disabled = false;
      pfConfirmBtn.textContent = "Try again";
      setStatus(err.message || "Payment service unavailable.", "error");
    });
  }

  /* Bakong 每个 token 每天只有 100 次查询额度 —— 轮询必须往回退，
     不能每 2 秒打一次（那样 3 分钟就把一天的额度烧光，之后即使真的付了钱
     也查不到，页面永远停在“等待到账”）。 */
  var POLL_DELAYS = [4000, 6000, 10000, 15000, 20000, 30000];
  var pollAttempt = 0;

  function pollPayment() {
    if (!state.payment) return;
    var id = state.payment.id;
    var delay = POLL_DELAYS[Math.min(pollAttempt, POLL_DELAYS.length - 1)];
    pollAttempt += 1;
    if (state.payment.quota && state.payment.quota.exhausted) delay = Math.max(delay, 30000);
    state.pollTimer = setTimeout(function () {
      apiFetch("/payments/" + id).then(function (payment) {
        // 流程已关闭或已换成别的支付单时，丢掉这次响应
        if (!state.payment || state.payment.id !== id || !flow.classList.contains("open")) return;
        state.payment = payment;
        if (payment.status === "paid") { showSuccess(payment); return; }
        if (payment.status === "expired") {
          state.paying = false;
          pfConfirmBtn.disabled = false;
          pfConfirmBtn.textContent = "Try again";
          setStatus("Bakong did not receive this payment before the QR expired. Nothing was charged.", "error");
          return;
        }
        if (quotaExhausted(payment)) {
          setStatus(
            "Bakong verified the QR, but today's transaction-query quota is used up (" +
              payment.quota.used + "/" + payment.quota.limit +
              "). If you already paid, it will be confirmed after the quota resets (midnight Cambodia time). Nothing else was charged.",
            "error"
          );
        }
        pollPayment();
      }).catch(function () {
        pollPayment();
      });
    }, delay);
  }

  function quotaExhausted(payment) {
    if (!payment) return false;
    return Boolean(payment.quotaExhausted || (payment.quota && payment.quota.exhausted));
  }

  function saveStaticDemoPayment(payment, note) {
    if (envMode !== "demo-static") return;
    var debit = Number(payment.amount) || 0;
    var currency = payment.currency || fromAccount.currency;
    if (currency !== fromAccount.currency) {
      debit = currency === "KHR" ? debit / 4083 : debit * 4083;
    }
    debit = fromAccount.currency === "KHR" ? Math.round(debit) : Math.round(debit * 100) / 100;
    var key = LOCAL_TX_KEY;
    var records = [];
    try { records = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) {}
    if (records.some(function (item) { return item.ref === payment.ref; })) return;
    var priorDebit = records.filter(function (item) {
      return item.accountId === fromAccount.id && item.currency === fromAccount.currency;
    }).reduce(function (sum, item) { return sum + (Number(item.amount) || 0); }, 0);
    saveLocalTx({
      direction: "out",
      title: "KHQR payment to " + (payment.merchant || "KHQR merchant"),
      amount: debit,
      currency: fromAccount.currency,
      createdAt: Date.now(),
      ref: payment.ref,
      externalRef: Math.random().toString(16).slice(2, 10),
      note: note,
      merchantId: (state.current && state.current.merchantId) || "",
      counterpartyName: payment.merchant || (state.current && state.current.merchant) || "",
      counterpartyAccount: displayRecipientAccount(
        (state.current && (state.current.merchantId || state.current.accountId || state.current.account)) || ""
      ),
      bank: (payment.recipientBank && payment.recipientBank.name) ||
        (state.current && state.current.bank && state.current.bank.name) || "",
      accountId: fromAccount.id,
      balanceAfter: Math.max(0, Number(fromAccount.balance || 0) - priorDebit - debit),
      external: true,
      demo: true
    });
  }

  function showSuccess(payment) {
    stopPolling();
    state.paying = false;
    var currency = payment.currency || (state.current && state.current.currency) || "USD";
    var recipientBank = recipientBankInfo(state.current, payment);
    var bankName = recipientBank.name;
    var bankShort = bankLabel(bankName) || bankName;
    var accountId = (state.current && (state.current.accountId || state.current.account)) || "";
    var merchantId = (state.current && state.current.merchantId) || payment.merchantId || "";
    var note = pfNote.value.trim() || ((fromAccount && fromAccount.name) || "SOKHA CHAN") + " transfer";
    saveStaticDemoPayment(payment, note);

    pfSuccessAmount.textContent = currencyAmount(payment.amount, currency);
    pfSuccessTime.textContent = nowLabel();
    pfSuccessFromName.textContent = fromAccount.name || "SOKHA CHAN";
    pfSuccessFrom.textContent = fromAccount.id + " | " + fromAccount.currency;
    pfSuccessMerchant.textContent = payment.merchant || "";
    var recipientAccount = merchantId || accountId;
    pfSuccessBank.textContent = recipientAccount ? "Account: " + displayRecipientAccount(recipientAccount) : "";
    var bankInfoForLogo = Object.assign({}, state.current || {}, { bank: recipientBank });
    paintMark(
      pfSuccessBankMark,
      recipientBank.logo || bankLogoSrc(bankInfoForLogo) || RECEIVER_DEFAULT_LOGO,
      bankShort
    );
    pfSuccessBankShort.textContent = String(bankShort || bankName || "").toUpperCase();
    var displayRef = displayTransactionCode(payment.ref);
    pfSuccessRef.textContent = displayRef;
    var externalRef = payment.tx && (
      payment.tx.hash || payment.tx.transactionId || payment.tx.externalTxnRef || payment.tx.externalRef
    );
    var displayExternalRef = displayTransactionCode(externalRef || refNumber(payment.ref));
    pfSuccessTx.textContent = displayExternalRef;
    pfSuccessNote.textContent = note;

    lastReceipt = {
      amount: pfSuccessAmount.textContent,
      merchant: payment.merchant,
      bank: bankName,
      ref: displayRef,
      time: pfSuccessTime.textContent,
      from: fromAccount.id + " | " + fromAccount.currency
    };
    setStatus("");
    showStep("success");
    document.dispatchEvent(new Event("mb:payment-recorded"));
  }

  function shareReceipt() {
    if (!lastReceipt) return;
    var text = "MB Bank Cambodia \u2014 payment receipt\n" +
      lastReceipt.amount + " to " + lastReceipt.merchant + "\n" +
      "Received by " + lastReceipt.bank + "\n" +
      "Transaction ID: " + lastReceipt.ref + "\n" +
      "Date & Time: " + lastReceipt.time + "\n" +
      "From: " + lastReceipt.from;
    if (navigator.share) {
      navigator.share({ title: "Payment receipt", text: text }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast("Receipt copied to clipboard");
      }).catch(function () { showToast("Transaction ID " + lastReceipt.ref); });
      return;
    }
    showToast("Transaction ID " + lastReceipt.ref);
  }

  // 扫码结果先问后端拿银行名（KHQR 里没有银行字段），拿不到再用本地解析结果
  var BANK_SUFFIXES = {
    acleda: ["ACLEDA Bank", "ACLEDA Plc."], aclb: ["ACLEDA Bank", "ACLEDA Plc."],
    aba: ["ABA Bank", "Advanced Bank of Asia"], ababank: ["ABA Bank", "Advanced Bank of Asia"],
    abaa: ["ABA Bank", "Advanced Bank of Asia"],
    wing: ["Wing Bank", "Wing Bank (Cambodia) Plc."],
    ppcbank: ["PPCBank", "Phnom Penh Commercial Bank"], ppcb: ["PPCBank", "Phnom Penh Commercial Bank"],
    canadabank: ["Canadia Bank", "Canadia Bank Plc."], maybank: ["Maybank Cambodia", "Maybank (Cambodia) Plc."],
    ftb: ["FTB Bank", "Foreign Trade Bank of Cambodia"], cimb: ["CIMB Bank", "CIMB Bank Plc."],
    vattanac: ["Vattanac Bank", "Vattanac Bank"], sathapana: ["Sathapana Bank", "Sathapana Bank Plc."],
    hattha: ["Hattha Bank", "Hattha Bank Plc."], campubank: ["Campu Bank", "Cambodia Public Bank"],
    jtrust: ["J Trust Royal Bank", "J Trust Royal Bank"], phillip: ["Phillip Bank", "Phillip Bank Plc."],
    chipmong: ["Chip Mong Bank", "Chip Mong Commercial Bank"], firstbank: ["First Commercial Bank", "First Commercial Bank"],
    kbprasac: ["KB Prasac Bank", "KB Prasac Bank Plc."], devb: ["DEV Bank", "Bakong sandbox bank"],
    bakong: ["Bakong", "National Bank of Cambodia"],
    pipay: ["PiPay", "PiPay"],
    truemoney: ["TrueMoney", "TrueMoney"]
  };

  // 柬埔寨银行目录（kh-banks.js 由 open-banking-tracker-data 生成）：补齐别名、正式名称和 logo
  (function mergeKhBankDirectory() {
    var banks = (window.MB_KH_BANKS instanceof Array) ? window.MB_KH_BANKS : [];
    banks.forEach(function (bank) {
      var aliases = bank.aliases instanceof Array ? bank.aliases : [];
      var names = [bank.name, bank.short].filter(Boolean);
      aliases.forEach(function (alias) {
        var key = String(alias).toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!key) return;
        if (!BANK_SUFFIXES[key]) BANK_SUFFIXES[key] = names;
        if (bank.logo) BANK_LOGOS[key] = bank.logo;
      });
    });
  })();

  function localBank(accountId) {
    var id = String(accountId || "");
    if (id.indexOf("@") === -1) return { name: "Bakong member bank", short: "" };
    var key = id.split("@").pop().toLowerCase();
    var hit = BANK_SUFFIXES[key] || BANK_SUFFIXES[key.replace(/[^a-z0-9]/g, "")];
    if (!hit) return { name: "Bakong member bank", short: "", logo: "" };
    var file = BANK_LOGOS[key] || BANK_LOGOS[key.replace(/[^a-z0-9]/g, "")];
    return { name: hit[0], short: hit[1], logo: bankLogoPath(file) };
  }

  function resolveInfo(info) {
    if (!info.raw) { openFlow(info); return; }
    if (envMode === "demo-static") {
      // static hosting has no resolver: read the QR locally and continue as demo
      info.bank = localBank(info.accountId || "");
      openFlow(info);
      return;
    }
    apiFetch("/scan/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qr: info.raw })
    }).then(function (data) {
      openFlow({
        merchant: data.merchant || info.merchant,
        amount: data.amount === null || data.amount === undefined ? info.amount : data.amount,
        currency: data.currency || info.currency,
        city: data.city || info.city,
        bank: data.bank,
        merchantId: data.merchantId || "",
        accountId: data.merchantAccount || info.accountId || "",
        recipient: data.recipient || null,
        kind: info.kind,
        raw: info.raw
      });
    }).catch(function () {
      info.bank = localBank(info.accountId || info.bakongAccountId || "");
      openFlow(info);
    });
  }

  /* ---------- flow events ---------- */

  pfAmount.addEventListener("input", function () {
    var currency = (state.current && state.current.currency) || "USD";
    var before = pfAmount.value;
    var caret = pfAmount.selectionStart;
    var cleaned = sanitizeAmount(before, currency);
    if (cleaned !== before) {
      // 尽量保持光标位置（按光标前的有效字符数还原）
      var kept = String(before).slice(0, caret == null ? before.length : caret).replace(/[^0-9.]/g, "").length;
      pfAmount.value = cleaned;
      var pos = Math.min(kept, cleaned.length);
      try { pfAmount.setSelectionRange(pos, pos); } catch (err) { /* 忽略不支持的光标设置 */ }
    }
    refreshAmountState();
    sizeAmountInput();
  });

  pfAmount.addEventListener("blur", function () {
    var currency = (state.current && state.current.currency) || "USD";
    var value = sanitizeAmount(pfAmount.value, currency).replace(/\.$/, "");
    if (value !== pfAmount.value) pfAmount.value = value;
    refreshAmountState();
    sizeAmountInput();
  });

  /* ---------- currency toggle (USD / KHR) ---------- */
  if (pfCur && pfCur.tagName === "BUTTON") {
    pfCur.addEventListener("click", function () {
      if (!state.current) return;
      var oldCur = state.current.currency || "USD";
      var newCur = oldCur === "KHR" ? "USD" : "KHR";
      state.current.currency = newCur;
      pfCur.textContent = newCur;
      pfCur.setAttribute("data-cur", newCur);

      // 金额按汇率转换
      var val = readAmount();
      if (val > 0) {
        val = newCur === "KHR" ? Math.round(val * USD_KHR_RATE) : val / USD_KHR_RATE;
        var decimals = amountDecimals(newCur);
        pfAmount.value = decimals === 0 ? String(Math.round(val)) : (Math.round(val * 100) / 100).toFixed(decimals).replace(/\.?0+$/, "");
      }
      sizeAmountInput();
      refreshAmountState();
    });
  }

  pfNext.addEventListener("click", goConfirm);

  pfConfirmBtn.addEventListener("click", function () {
    // 支付单已建好时，这个按钮用来去 Bakong 授权，并顺手查一次到账
    if (state.payment && state.payment.status === "pending") {
      if (state.payment.deeplink) openBakong();
      confirmNow();
      return;
    }
    openOtp();
  });

  /* 用户说“我已经付了”：手动确认一次。
     服务端有 5 秒最小间隔 + 每日额度约束，所以点多了也不会把额度打光。 */
  function confirmNow() {
    if (!state.payment || state.confirming) return;
    var id = state.payment.id;
    state.confirming = true;
    setStatus("Checking with Bakong whether the payment arrived\u2026");
    apiFetch("/payments/" + id + "/verify", { method: "POST" }).then(function (payment) {
      state.confirming = false;
      if (!state.payment || state.payment.id !== id) return;
      state.payment = payment;
      if (payment.status === "paid") { showSuccess(payment); return; }
      if (payment.status === "expired") {
        setStatus("Bakong did not receive this payment before the QR expired. Nothing was charged.", "error");
        return;
      }
      if (quotaExhausted(payment)) {
        setStatus(
          "Bakong verified the QR, but today's transaction-query quota is used up (" +
            payment.quota.used + "/" + payment.quota.limit +
            "). Your payment will be confirmed after the quota resets (midnight Cambodia time).",
          "error"
        );
        return;
      }
      setStatus("Bakong has not received this payment yet. If you just paid, wait a few seconds and tap again.");
    }).catch(function () {
      state.confirming = false;
      setStatus("Could not reach the payment service. Check your connection and try again.", "error");
    });
  }

  if (otpOverlay) {
    otpOverlay.addEventListener("click", function (event) {
      if (event.target.closest("[data-otp-close]")) closeOtp();
      var digit = event.target.closest("[data-otp-digit]");
      if (digit) enterOtpDigit(digit.getAttribute("data-otp-digit"));
      if (event.target.closest("[data-otp-delete]")) {
        state.otp = state.otp.slice(0, -1);
        updateOtpDots();
        if (otpError) { otpError.textContent = ""; otpError.hidden = true; }
      }
    });
  }
  if (otpDone) otpDone.addEventListener("click", submitOtp);
  if (otpForgot) {
    otpForgot.addEventListener("click", function () {
      if (!otpError) return;
      otpError.textContent = "Contact MB Bank to reset your Digital OTP.";
      otpError.hidden = false;
    });
  }

  pfDone.addEventListener("click", function () {
    closeFlow();
    closeScanner();
  });

  pfShare.addEventListener("click", shareReceipt);

  var billBack = flow.querySelector("[data-bill-back]");
  if (billBack) {
    billBack.addEventListener("click", function () {
      closeFlow();
      startCamera();
    });
  }

  var confirmBack = flow.querySelector("[data-confirm-back]");
  if (confirmBack) {
    confirmBack.addEventListener("click", function () {
      setStatus("");
      showStep("amount");
    });
  }

  var confirmHome = document.getElementById("pf-confirm-home");
  if (confirmHome) {
    confirmHome.addEventListener("click", function () {
      closeFlow();
      closeScanner();
    });
  }

  if (changeAccountBtn) {
    changeAccountBtn.addEventListener("click", function () {
      if (!paymentAccounts.length) loadFromAccount();
      openAccountPicker();
    });
  }
  if (accountPicker) {
    accountPicker.addEventListener("click", function (event) {
      if (event.target.closest("[data-account-picker-close]")) closeAccountPicker();
    });
  }

  if (pfCopyRef) {
    pfCopyRef.addEventListener("click", function () {
      var text = pfSuccessTx.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showToast("Reference copied: " + text);
        }).catch(function () { showToast(text); });
      } else {
        showToast(text);
      }
    });
  }

  if (pfActionNew) {
    pfActionNew.addEventListener("click", function () {
      closeFlow();
      startCamera();
    });
  }

  if (pfActionShot) {
    pfActionShot.addEventListener("click", function () {
      showToast("Screenshot saved (demo)");
    });
  }

  Array.prototype.forEach.call(flow.querySelectorAll(".pf-back"), function (btn) {
    btn.addEventListener("click", function () {
      if (flow.dataset.step === "confirm") {
        setStatus("");
        showStep("amount");
        return;
      }
      closeFlow();
      startCamera();
    });
  });

  /* ---------- camera ---------- */

  function cameraAvailable() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.jsQR);
  }

  function stopCamera() {
    state.running = false;
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
    if (state.track && state.track.applyConstraints && state.torch) {
      try { state.track.applyConstraints({ advanced: [{ torch: false }] }); } catch (e) {}
      state.torch = false;
    }
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) { t.stop(); });
      state.stream = null;
    }
    state.track = null;
    video.srcObject = null;
    overlay.classList.remove("camera-on");
  }

  function startCamera() {
    if (!cameraAvailable()) {
      cameraHint.textContent = "Camera unavailable \u2014 upload a QR image instead.";
      cameraHint.hidden = false;
      return;
    }
    if (state.stream) return;

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false
    }).then(function (stream) {
      state.stream = stream;
      state.track = stream.getVideoTracks()[0];
      video.srcObject = stream;
      video.setAttribute("playsinline", "");
      video.muted = true;
      var playing = video.play();
      if (playing && playing.catch) playing.catch(function () {});
      overlay.classList.add("camera-on");
      cameraHint.hidden = true;
      state.running = true;
      state.lastTick = 0;
      state.raf = requestAnimationFrame(tick);
    }).catch(function () {
      cameraHint.textContent = "Camera unavailable \u2014 upload a QR image instead.";
      cameraHint.hidden = false;
    });
  }

  function tick(ts) {
    if (!state.running) return;
    if (ts - state.lastTick > 120 && video.readyState >= 2 && video.videoWidth) {
      state.lastTick = ts;
      var vw = video.videoWidth;
      var vh = video.videoHeight;
      var scale = Math.min(1, 480 / Math.max(vw, vh));
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      var frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var code = null;
      try {
        code = window.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
      } catch (e) {}
      if (code && code.data) {
        stopCamera();
        handlePayload(code.data);
        return;
      }
    }
    state.raf = requestAnimationFrame(tick);
  }

  function decodeImage(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 900 / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var code = null;
        try {
          code = window.jsQR ? window.jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" }) : null;
        } catch (e) {}
        URL.revokeObjectURL(url);
        resolve(code && code.data ? code.data : null);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  /* ---------- payload handling ---------- */

  function handlePayload(text) {
    var info = parsePayload(text);
    if (!info) {
      showToast("This QR code is not a supported payment code.");
      startCamera();
      return;
    }
    stopCamera();
    resolveInfo(info);
  }

  /* ---------- upload ---------- */

  function clearSelected() {
    if (state.objectUrl) { URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; }
    selectedBox.hidden = true;
    selectedFile.hidden = true;
    selectedImg.removeAttribute("src");
    selectedName.textContent = "";
    instruction.textContent = "Align frame with QR code";
  }

  uploadBtn.addEventListener("click", function () { fileInput.click(); });

  fileInput.addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!window.jsQR) { showToast("QR decoder failed to load."); return; }

    stopCamera();
    clearSelected();
    state.objectUrl = URL.createObjectURL(file);
    selectedImg.src = state.objectUrl;
    selectedImg.alt = "Selected image: " + file.name;
    selectedBox.hidden = false;
    selectedName.textContent = file.name;
    selectedName.title = file.name;
    selectedFile.hidden = false;
    instruction.textContent = "Reading QR code\u2026";

    decodeImage(file).then(function (text) {
      if (!text) {
        instruction.textContent = "No QR code found";
        showToast("No QR code found in that image. Try another one.");
        return;
      }
      instruction.textContent = "Image selected";
      handlePayload(text);
    });
  });

  /* ---------- flash / torch ---------- */

  flashBtn.addEventListener("click", function () {
    var on = !overlay.classList.contains("flash");
    overlay.classList.toggle("flash", on);
    flashBtn.classList.toggle("active", on);
    flashBtn.setAttribute("aria-pressed", on ? "true" : "false");
    flashState.textContent = on ? "On" : "";
    if (state.track && state.track.applyConstraints) {
      try {
        state.track.applyConstraints({ advanced: [{ torch: on }] }).then(function () {
          state.torch = on;
        }).catch(function () {});
      } catch (e) {}
    }
  });

  /* ---------- open / close ---------- */

  function openScanner() {
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    startCamera();
    setTimeout(function () { backBtn.focus(); }, 80);
  }

  function closeScanner() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    stopCamera();
    overlay.classList.remove("flash");
    flashBtn.classList.remove("active");
    flashBtn.setAttribute("aria-pressed", "false");
    flashState.textContent = "";
    closeFlow();
    clearSelected();
  }

  backBtn.addEventListener("click", function () {
    if (flow.classList.contains("open")) { closeFlow(); return; }
    closeScanner();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && accountPicker && accountPicker.classList.contains("open")) {
      closeAccountPicker();
      return;
    }
    if (otpOverlay && otpOverlay.classList.contains("open")) {
      if (/^[0-9]$/.test(e.key)) { enterOtpDigit(e.key); return; }
      if (e.key === "Backspace") {
        state.otp = state.otp.slice(0, -1);
        updateOtpDots();
        if (otpError) { otpError.textContent = ""; otpError.hidden = true; }
        return;
      }
      if (e.key === "Enter") { submitOtp(); return; }
    }
    if (e.key !== "Escape") return;
    if (otpOverlay && otpOverlay.classList.contains("open")) { closeOtp(); return; }
    if (flow.classList.contains("open")) { closeFlow(); return; }
    if (overlay.classList.contains("open")) closeScanner();
  });

  // open the scanner from the app's QR entry points without letting the
  // React handler show its "not connected" toast
  document.addEventListener("click", function (e) {
    if (overlay.classList.contains("open")) return;
    var el = e.target && e.target.closest ? e.target.closest("[aria-label]") : null;
    if (!el || el.closest("#qr-scan")) return;
    var label = (el.getAttribute("aria-label") || "").toLowerCase();
    var testid = el.getAttribute("data-testid") || "";
    // header round QR button = show own receive QR (matches the real app)
    if (testid === "button-qr-account") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openMyQr();
      return;
    }
    // real scanner entry: bottom-nav centre button
    if (testid === "nav-qr" || label.indexOf("tr\u00ecnh qu\u00e9t") > -1 || label.indexOf("scan") > -1) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openScanner();
    }
  }, true);

  /* ---------- my KHR QR (receive) ---------- */

  var myqrSheet = document.getElementById("myqr");
  var myqrBtn = document.getElementById("qr-myqr");
  var myqrImg = document.getElementById("myqr-img");
  var myqrLoading = document.getElementById("myqr-loading");
  var myqrName = document.getElementById("myqr-name");
  var myqrAmountEl = document.getElementById("myqr-amount");
  var myqrStatus = document.getElementById("myqr-status");
  var myqrAccountsEl = document.getElementById("myqr-accounts");
  var myqrBack = document.getElementById("myqr-back");
  var myqrHome = document.getElementById("myqr-home");
  var myqrSetAmountBtn = document.getElementById("myqr-set-amount");
  var myqrShareBtn = document.getElementById("myqr-share");
  var myqrDownloadBtn = document.getElementById("myqr-download");
  var myqrAmountSheet = document.getElementById("myqr-amount-sheet");
  var myqrAmountInput = document.getElementById("myqr-amount-input");
  var myqrAmountCancel = document.getElementById("myqr-amount-cancel");
  var myqrAmountConfirm = document.getElementById("myqr-amount-confirm");

  // Bakong / KHQR 收款方配置。在 index.html 里设置 window.MB_KHQR_CONFIG
  // 即可换成自己的 Bakong 账户（形如 012345678@aclb），无需改这个文件。
  var KHQR_DEFAULTS = {
    accountId: "angkor.travel@acleda",
    merchantName: "Angkor Travel KH",
    city: "Phnom Penh",
    storeLabel: "Angkor Travel KH",
    terminalLabel: "MB Cambodia App",
    merchantCategoryCode: "5999"
  };
  var khqrConfig = (function () {
    var cfg = {};
    var key;
    for (key in KHQR_DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(KHQR_DEFAULTS, key)) cfg[key] = KHQR_DEFAULTS[key];
    }
    var override = window.MB_KHQR_CONFIG || {};
    for (key in override) {
      if (Object.prototype.hasOwnProperty.call(override, key) && override[key]) cfg[key] = String(override[key]);
    }
    return cfg;
  })();

  var MYQR_HOLDER = "SOKHA CHAN";
  var MYQR_IMAGE = "./assets/myqr-sokha-chan.png";

  var myqrFromScanner = false;
  var myqrState = { accounts: [], accountId: null, currency: "KHR", amount: 0, req: 0 };

  function myqrMoney(value, currency) {
    var n = Number(value) || 0;
    if (currency === "KHR") return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function myqrSetStatus(text, kind) {
    if (!myqrStatus) return;
    myqrStatus.textContent = text || "";
    if (kind === "note") myqrStatus.setAttribute("data-kind", "note");
    else myqrStatus.removeAttribute("data-kind");
  }

  function myqrDefaultId(accounts) {
    var preferred = accounts.filter(function (a) {
      return String(a.label || "").indexOf("Current") > -1;
    })[0];
    return (preferred || accounts[0] || {}).id;
  }

  function myqrOrdered(accounts) {
    // 个人收款码挂两个账户：一个 KHR、一个 USD（各取默认/第一个）
    var khr = accounts.filter(function (a) { return String(a.currency || "").toUpperCase() === "KHR"; });
    var usd = accounts.filter(function (a) { return String(a.currency || "").toUpperCase() === "USD"; });
    function pick(list) {
      return list.filter(function (a) {
        return String(a.label || "").indexOf("Current") > -1;
      })[0] || list[0];
    }
    var out = [];
    if (pick(khr)) out.push(pick(khr));
    if (pick(usd)) out.push(pick(usd));
    return out.length ? out : accounts;
  }

  function renderMyQrAccounts() {
    if (!myqrAccountsEl) return;
    myqrAccountsEl.innerHTML = "";
    var defId = myqrDefaultId(myqrState.accounts);
    myqrAccountsEl.classList.toggle("single", myqrOrdered(myqrState.accounts).length === 1);
    myqrOrdered(myqrState.accounts).forEach(function (acct) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "myqr-acct" + (acct.id === myqrState.accountId ? " active" : "");
      card.setAttribute("data-account-id", acct.id);
      card.setAttribute("aria-pressed", acct.id === myqrState.accountId ? "true" : "false");

      var cur = document.createElement("span");
      cur.className = "myqr-acct-cur";
      cur.textContent = String(acct.currency || "").toUpperCase();
      var num = document.createElement("span");
      num.className = "myqr-acct-num";
      num.textContent = acct.id;
      card.appendChild(cur);
      card.appendChild(num);

      if (acct.id === defId) {
        var badge = document.createElement("span");
        badge.className = "myqr-acct-badge";
        badge.textContent = "Default";
        card.appendChild(badge);
        var star = document.createElement("span");
        star.className = "myqr-acct-star";
        star.setAttribute("aria-hidden", "true");
        star.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>';
        card.appendChild(star);
      }

      card.addEventListener("click", function () {
        selectMyQrAccount(acct.id);
      });
      myqrAccountsEl.appendChild(card);
    });
  }

  function currentMyQrAccount() {
    return myqrState.accounts.filter(function (a) {
      return a.id === myqrState.accountId;
    })[0] || myqrState.accounts[0] || null;
  }

  function selectMyQrAccount(id) {
    if (!id || id === myqrState.accountId) return;
    var acct = myqrState.accounts.filter(function (a) { return a.id === id; })[0];
    if (!acct) return;
    myqrState.accountId = id;
    myqrState.currency = String(acct.currency || "KHR").toUpperCase();
    myqrState.amount = 0;
    renderMyQrAccounts();
    generateMyQr();
  }

  function loadMyQrAccounts() {
    var demo = Array.isArray(window.mbDemoAccounts) ? window.mbDemoAccounts.slice() : [];
    return apiFetch("/internal/accounts", {
      headers: { Accept: "application/json" },
      cache: "no-store"
    }).then(function (data) {
      var list = data && Array.isArray(data.accounts) && data.accounts.length ? data.accounts : demo;
      return list;
    }).catch(function () {
      return demo;
    });
  }

  function drawQr(text) {
    if (!window.qrcode) return false;
    var qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    myqrImg.src = qr.createDataURL(8, 4);
    myqrImg.setAttribute("data-payload", text);
    return true;
  }

  /* --- KHQR（Bakong）报文：EMVCo TLV + CRC16-CCITT --- */

  function khqrTlv(tag, value) {
    var text = String(value === undefined || value === null ? "" : value);
    return tag + (text.length < 10 ? "0" : "") + text.length + text;
  }

  function khqrCrc16(text) {
    var crc = 0xFFFF;
    for (var i = 0; i < text.length; i++) {
      crc ^= text.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
      }
    }
    var hex = crc.toString(16).toUpperCase();
    return ("0000" + hex).slice(-4);
  }

  function khqrAmountText(amount) {
    var text = String(amount);
    return /^\d+$/.test(text) ? text : Number(amount).toFixed(2);
  }

  // 与 bakong-khqr 的 generateIndividual 输出一致，Bakong App 可直接识别
  function buildKhqr(currency, amount) {
    var cfg = khqrConfig;
    var dynamicQr = Number(amount) > 0;
    var payload = khqrTlv("00", "01");
    payload += khqrTlv("01", dynamicQr ? "12" : "11");
    payload += khqrTlv("29", khqrTlv("00", cfg.accountId));
    payload += khqrTlv("52", cfg.merchantCategoryCode);
    payload += khqrTlv("53", String(currency).toUpperCase() === "KHR" ? "116" : "840");
    if (dynamicQr) payload += khqrTlv("54", khqrAmountText(amount));
    payload += khqrTlv("58", "KH");
    payload += khqrTlv("59", cfg.merchantName);
    payload += khqrTlv("60", cfg.city);
    var extra = "";
    if (cfg.storeLabel) extra += khqrTlv("03", cfg.storeLabel);
    if (cfg.terminalLabel) extra += khqrTlv("07", cfg.terminalLabel);
    if (extra) payload += khqrTlv("62", extra);
    if (dynamicQr) {
      var created = Date.now();
      var expires = created + 5 * 60 * 1000;
      payload += khqrTlv("99", khqrTlv("00", created) + khqrTlv("01", expires));
    }
    return payload + "6304" + khqrCrc16(payload + "6304");
  }

  function myqrAmountLabel() {
    if (!myqrState.amount) return "0";
    return myqrMoney(myqrState.amount, myqrState.currency);
  }

  function paintMyQrAmount() {
    if (myqrAmountEl) myqrAmountEl.textContent = myqrAmountLabel();
  }

  function generateMyQr() {
    var acct = currentMyQrAccount();
    if (!acct) return;
    myqrState.req++;
    myqrState.currency = String(acct.currency || "KHR").toUpperCase();
    if (myqrName) myqrName.textContent = MYQR_HOLDER;
    if (myqrImg) {
      myqrImg.src = MYQR_IMAGE;
      myqrImg.setAttribute("data-ready", "1");
    }
    if (myqrLoading) myqrLoading.hidden = true;
    myqrSetStatus("", "");
  }

  function openQrAmount() {
    if (!myqrAmountSheet) return;
    myqrAmountInput.value = myqrState.amount ? String(myqrState.amount) : "";
    myqrAmountSheet.classList.add("open");
    myqrAmountSheet.setAttribute("aria-hidden", "false");
    window.setTimeout(function () {
      try { myqrAmountInput.focus(); } catch (e) {}
    }, 60);
  }

  function closeQrAmount() {
    if (!myqrAmountSheet) return;
    if (document.activeElement && myqrAmountSheet.contains(document.activeElement)) {
      try { document.activeElement.blur(); } catch (e) {}
    }
    myqrAmountSheet.classList.remove("open");
    myqrAmountSheet.setAttribute("aria-hidden", "true");
  }

  function applyQrAmount() {
    var raw = String(myqrAmountInput.value || "").replace(/,/g, "").trim();
    var value = Number(raw);
    if (raw && (!isFinite(value) || value < 0)) {
      myqrSetStatus("Enter a valid amount.");
      return;
    }
    if (myqrState.currency === "KHR") value = Math.round(value);
    else value = Math.round(value * 100) / 100;
    myqrState.amount = value > 0 ? value : 0;
    closeQrAmount();
    generateMyQr();
  }

  function myqrDefaultSelection(accounts) {
    var keep = accounts.filter(function (a) { return a.id === myqrState.accountId; })[0];
    if (keep) return keep.id;
    var khr = accounts.filter(function (a) {
      return String(a.currency || "").toUpperCase() === "KHR";
    })[0];
    return (khr || accounts[0] || {}).id || null;
  }

  function openMyQr() {
    myqrFromScanner = overlay.classList.contains("open");
    if (myqrFromScanner) stopCamera();
    myqrSheet.classList.add("open");
    myqrSheet.setAttribute("aria-hidden", "false");
    myqrSetStatus("", "");
    if (myqrName) myqrName.textContent = MYQR_HOLDER;
    loadMyQrAccounts().then(function (accounts) {
      myqrState.accounts = myqrOrdered(accounts);
      myqrState.accountId = myqrDefaultSelection(myqrState.accounts);
      myqrState.amount = 0;
      renderMyQrAccounts();
      generateMyQr();
    });
  }

  function closeMyQr() {
    closeQrAmount();
    if (document.activeElement && myqrSheet.contains(document.activeElement)) {
      try { document.activeElement.blur(); } catch (e) {}
    }
    myqrSheet.classList.remove("open");
    myqrSheet.setAttribute("aria-hidden", "true");
    if (myqrFromScanner) startCamera();
    myqrFromScanner = false;
  }

  function goAppHome() {
    var home = document.querySelector('[data-testid="nav-home"]');
    closeMyQr();
    if (home && home.click) home.click();
  }

  /* --- download: draw the full KHQR card on a canvas --- */

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function buildQrCard() {
    return new Promise(function (resolve, reject) {
      if (!myqrImg.getAttribute("data-ready")) {
        reject(new Error("QR not ready"));
        return;
      }
      var acct = currentMyQrAccount() || {};
      var img = new Image();
      img.onload = function () {
        var w = 760;
        var h = 1180;
        var cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        var ctx = cv.getContext("2d");
        ctx.fillStyle = "#f4f6fa";
        ctx.fillRect(0, 0, w, h);

        var cx = 40;
        var cy = 40;
        var cw = w - 80;
        var ch = h - 80;
        ctx.save();
        roundRectPath(ctx, cx, cy, cw, ch, 32);
        ctx.clip();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(cx, cy, cw, ch);

        ctx.fillStyle = "#e01b24";
        ctx.fillRect(cx, cy, cw, 150);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.font = "800 54px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
        ctx.fillText("KHRQR", w / 2, cy + 96);

        ctx.fillStyle = "#0a1936";
        ctx.font = "700 36px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
        ctx.fillText(MYQR_HOLDER, w / 2, cy + 236);

        ctx.strokeStyle = "#c9d0dc";
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.moveTo(cx + 56, cy + 300);
        ctx.lineTo(cx + cw - 56, cy + 300);
        ctx.stroke();
        ctx.setLineDash([]);

        var qrSize = 420;
        ctx.drawImage(img, (w - qrSize) / 2, cy + 340, qrSize, qrSize);

        ctx.fillStyle = "#6b7689";
        ctx.font = "500 26px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
        ctx.fillText("Account " + String(acct.id || ""), w / 2, cy + 900);
        ctx.font = "400 24px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
        ctx.fillText("Scan with any KHQR member app", w / 2, cy + 946);
        ctx.restore();
        resolve(cv);
      };
      img.onerror = function () { reject(new Error("QR image not loaded")); };
      img.src = myqrImg.src;
    });
  }

  function canvasToBlob(cv) {
    return new Promise(function (resolve) {
      if (cv.toBlob) {
        cv.toBlob(function (blob) { resolve(blob); }, "image/png");
      } else {
        resolve(null);
      }
    });
  }

  function downloadMyQr() {
    buildQrCard().then(function (cv) {
      return canvasToBlob(cv).then(function (blob) {
        var acct = currentMyQrAccount() || {};
        var name = "MB-QR-" + String(acct.id || "receive") + ".png";
        var url;
        var revoke = false;
        if (blob) {
          url = URL.createObjectURL(blob);
          revoke = true;
        } else {
          url = cv.toDataURL("image/png");
        }
        var a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (revoke) window.setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
        myqrSetStatus("Saved to your downloads", "note");
      });
    }).catch(function () {
      myqrSetStatus("Unable to prepare the image. Try again.");
    });
  }

  function shareMyQr() {
    var acct = currentMyQrAccount() || {};
    var text = "My KHQR — " + MYQR_HOLDER + " · Account " + String(acct.id || "");
    function copy() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          myqrSetStatus("QR details copied", "note");
        }).catch(function () {
          myqrSetStatus("Unable to share on this device.");
        });
      } else {
        myqrSetStatus("Unable to share on this device.");
      }
    }
    buildQrCard().then(function (cv) {
      return canvasToBlob(cv).then(function (blob) {
        if (!blob || !navigator.canShare || !window.File) {
          if (navigator.share) return navigator.share({ title: "My KHQR", text: text });
          copy();
          return;
        }
        var file = new File([blob], "MB-KHR-QR.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] }) && navigator.share) {
          return navigator.share({ title: "My KHQR", text: text, files: [file] });
        }
        if (navigator.share) return navigator.share({ title: "My KHQR", text: text });
        copy();
      });
    }).catch(function (err) {
      if (err && err.name === "AbortError") return;
      copy();
    });
  }

  if (myqrBtn) myqrBtn.addEventListener("click", openMyQr);
  if (myqrBack) myqrBack.addEventListener("click", closeMyQr);
  if (myqrHome) myqrHome.addEventListener("click", goAppHome);
  if (myqrSetAmountBtn) myqrSetAmountBtn.addEventListener("click", openQrAmount);
  if (myqrAmountCancel) myqrAmountCancel.addEventListener("click", closeQrAmount);
  if (myqrAmountConfirm) myqrAmountConfirm.addEventListener("click", applyQrAmount);
  if (myqrAmountSheet) {
    myqrAmountSheet.addEventListener("click", function (e) {
      if (e.target === myqrAmountSheet) closeQrAmount();
    });
  }
  if (myqrAmountInput) {
    myqrAmountInput.addEventListener("input", function () {
      var digits = String(myqrAmountInput.value || "").replace(/[^0-9.]/g, "");
      var parts = digits.split(".");
      var clean = parts.shift() + (parts.length ? "." + parts.join("") : "");
      myqrAmountInput.value = clean;
    });
    myqrAmountInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        applyQrAmount();
      }
    });
  }
  if (myqrDownloadBtn) myqrDownloadBtn.addEventListener("click", downloadMyQr);
  if (myqrShareBtn) myqrShareBtn.addEventListener("click", shareMyQr);

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (myqrAmountSheet && myqrAmountSheet.classList.contains("open")) { closeQrAmount(); return; }
    if (myqrSheet && myqrSheet.classList.contains("open")) closeMyQr();
  });

  apiFetch("/health").then(function (d) {
    envMode = (d && d.bakong && d.bakong.mode) || null;
  }).catch(function () {
    // no backend (e.g. GitHub Pages): walk the UI as a labelled demo
    envMode = "demo-static";
  });

  window.mbScanQR = { open: openScanner, close: closeScanner };
})();
