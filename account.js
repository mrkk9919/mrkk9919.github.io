(function () {
  "use strict";

  var page = document.getElementById("account-page");
  if (!page) return;

  var listEl = document.getElementById("acct-list");
  var titleEl = document.getElementById("acct-list-title");
  var balEl = document.getElementById("acct-balance-amount");
  var exEl = document.getElementById("acct-exchange-amount");
  var toast = document.getElementById("acct-toast");
  var toastTimer = null;
  var form = document.getElementById("acct-form");
  var addBtn = document.getElementById("acct-add-btn");
  var formErr = document.getElementById("acct-f-err");
  var fName = document.getElementById("acct-f-name");
  var fBal = document.getElementById("acct-f-bal");
  var fSubmit = document.getElementById("acct-f-submit");
  var typeGroup = document.getElementById("acct-f-type");
  var curGroup = document.getElementById("acct-f-cur");
  var currentAccounts = null;

  var HOLDER = "SOKHA CHAN";

  // shown when there is no backend (GitHub Pages) — same seed data as the server
  var DEMO_ACCOUNTS = [
    { id: "2118997861", label: "USD · Current", currency: "USD", balance: 18265.5 },
    { id: "1624454845", label: "KHR · Savings", currency: "KHR", balance: 4120000 }
  ];
  window.mbDemoAccounts = DEMO_ACCOUNTS;

  function money(value, currency) {
    var n = Number(value) || 0;
    if (currency === "KHR") {
      return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function stripDemo(text) {
    return String(text == null ? "" : text).replace(/^Demo\s*·\s*/i, "");
  }

  function referenceCode(ref) {
    return String(ref == null ? "" : ref).replace(/^(?:DEMO-|demo_)/i, "");
  }

  // 演示交易没有后端返回的 External Txn Ref 时，按交易号生成一个稳定的 8 位十六进制参考号
  function demoExternalRef(seed) {
    var text = String(seed || "MB");
    var h1 = 0x811c9dc5;
    var h2 = 0x27220a95;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      h1 = ((h1 ^ code) * 0x01000193) >>> 0;
      h2 = ((h2 + code * 31) * 0x85ebca6b) >>> 0;
    }
    return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 8);
  }

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 1900);
  }

  function copyTarget(node) {
    var value = node.getAttribute("data-copy-value") || "";
    function done() { showToast("Account number copied"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch (e) {
        showToast("Copy failed");
      }
    }
  }

  function render(accounts) {
    currentAccounts = accounts;
    window.dispatchEvent(new CustomEvent("mb:accounts-updated", { detail: accounts }));
    var khr = accounts.filter(function (a) { return a.currency === "KHR"; });
    var usd = accounts.filter(function (a) { return a.currency === "USD"; });
    var khrTotal = khr.reduce(function (s, a) { return s + (Number(a.balance) || 0); }, 0);
    var usdTotal = usd.reduce(function (s, a) { return s + (Number(a.balance) || 0); }, 0);

    balEl.textContent = money(khrTotal, "KHR");
    exEl.textContent = money(usdTotal, "USD");
    titleEl.textContent = "List of Accounts (" + accounts.length + ")";

    // KHR first, then USD — same order as the reference screen
    var ordered = khr.concat(usd);
    var defId = (accounts.filter(function (a) {
      return (a.label || "").indexOf("Current") > -1;
    })[0] || accounts[0] || {}).id;

    listEl.innerHTML = "";
    ordered.forEach(function (a) {
      var item = document.createElement("article");
      item.className = "acct-item";

      var left = document.createElement("div");
      if (a.id === defId) {
        var badge = document.createElement("span");
        badge.className = "acct-badge";
        badge.textContent = "Default";
        left.appendChild(badge);
      }
      var name = document.createElement("p");
      name.className = "acct-name";
      name.textContent = HOLDER;
      var num = document.createElement("p");
      num.className = "acct-number";
      num.textContent = a.currency + " \u00b7 " + a.id;
      var bal = document.createElement("p");
      bal.className = "acct-bal";
      bal.textContent = money(a.balance, a.currency) + " ";
      var cur = document.createElement("span");
      cur.textContent = a.currency;
      bal.appendChild(cur);
      left.appendChild(name);
      left.appendChild(num);
      left.appendChild(bal);

      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "acct-copy";
      copyBtn.setAttribute("aria-label", "Copy account number " + a.id);
      copyBtn.setAttribute("data-copy-value", a.id);
      copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
      copyBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        copyTarget(copyBtn);
      });

      item.setAttribute("data-account-id", a.id);
      item.addEventListener("click", function () { openDetail(a); });

      item.appendChild(left);
      item.appendChild(copyBtn);
      listEl.appendChild(item);
    });
  }

  /* ---------- add account ---------- */

  function segValue(group) {
    var on = group.querySelector("button.on");
    return on ? on.getAttribute("data-value") : "";
  }

  function showForm(show) {
    if (!form || !listEl) return;
    form.hidden = !show;
    listEl.hidden = show;
    if (addBtn) addBtn.hidden = show;
    if (show) {
      formErr.textContent = "";
      fBal.value = "0";
      if (titleEl) titleEl.textContent = "New Account";
    }
  }

  function localAdd(payload) {
    var accounts = currentAccounts ? currentAccounts.slice() : DEMO_ACCOUNTS.slice();
    var id;
    do {
      id = "000" + String(Math.floor(100000000 + Math.random() * 899999999));
    } while (accounts.some(function (a) { return a.id === id; }));
    accounts.push({
      id: id,
      label: payload.currency + " \u00b7 " + payload.type,
      currency: payload.currency,
      balance: Number(payload.balance) || 0,
      name: payload.name
    });
    render(accounts);
  }

  function postJson(url, data) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = window.setTimeout(function () {
      if (controller) controller.abort();
    }, 10000);
    function done() { window.clearTimeout(timer); }
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      cache: "no-store",
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        done();
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json().catch(function () { return {}; });
      })
      .catch(function (err) {
        done();
        throw err;
      });
  }

  function submitForm(e) {
    e.preventDefault();
    var payload = {
      name: (fName && fName.value.trim()) || HOLDER,
      type: segValue(typeGroup) || "Payment",
      currency: segValue(curGroup) || "USD",
      balance: fBal ? fBal.value : "0"
    };
    var bal = Number(payload.balance);
    if (!Number.isFinite(bal) || bal < 0) {
      formErr.textContent = "Initial balance must be 0 or more.";
      return;
    }
    formErr.textContent = "";
    fSubmit.disabled = true;

    postJson("/api/internal/accounts", payload)
      .then(function (body) {
        var accounts = body.accounts && body.accounts.length ? body.accounts : null;
        if (accounts) render(accounts);
        else localAdd(payload);
        showForm(false);
        showToast("Account added");
      })
      .catch(function (err) {
        // no backend (static Pages): add into the demo list
        localAdd(payload);
        showForm(false);
        showToast("Account added (demo only)");
        if (err && err.message) console.warn("[account] create failed:", err.message);
      })
      .then(function () {
        fSubmit.disabled = false;
        if (titleEl) titleEl.textContent = "List of Accounts (" + ((currentAccounts && currentAccounts.length) || 0) + ")";
      });
  }

  if (addBtn) addBtn.addEventListener("click", function () { showForm(true); });
  if (form) form.addEventListener("submit", submitForm);
  var cancelBtn = document.getElementById("acct-f-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      showForm(false);
      if (titleEl) titleEl.textContent = "List of Accounts (" + ((currentAccounts && currentAccounts.length) || 0) + ")";
    });
  }
  [typeGroup, curGroup].forEach(function (group) {
    if (!group) return;
    group.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-value]");
      if (!btn) return;
      Array.prototype.forEach.call(group.querySelectorAll("button"), function (b) { b.classList.remove("on"); });
      btn.classList.add("on");
    });
  });

  function selectAccount(a) {
    closePage();
    syncHomeAccount(a);
  }

  // keep the home selector in sync with the account picked here
  function syncHomeAccount(a) {
    var selectedLabel = /ti\u1ebft ki\u1ec7m|savings/i.test(a.label || "")
      ? "T\xe0i kho\u1ea3n ti\u1ebft ki\u1ec7m: " + a.id
      : "T\xe0i kho\u1ea3n thanh to\xe1n: " + a.id;

    var sel = document.querySelector('[data-testid="button-account-selector"]');
    if (!sel) return;

    var optId = a.id === "2118997861" ? "option-account-payment"
      : (a.id === "1624454845" ? "option-account-savings" : "");

    if (optId) {
      // let React own the state when its own menu knows this account
      sel.click();
      window.setTimeout(function () {
        var opt = document.querySelector('[data-testid="' + optId + '"]');
        if (opt) opt.click();
      }, 80);
    } else {
      var span = sel.querySelector("span");
      if (span) span.textContent = selectedLabel;
    }
  }

  var loading = false;
  function openPage() {
    page.classList.add("open");
    page.setAttribute("aria-hidden", "false");
    showForm(false);
    if (titleEl) titleEl.textContent = "List of Accounts" + (currentAccounts ? " (" + currentAccounts.length + ")" : "");
    if (loading) return;
    loading = true;
    fetch("/api/internal/accounts", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var accounts = data && data.accounts && data.accounts.length ? data.accounts : DEMO_ACCOUNTS;
        render(accounts);
      })
      .catch(function () {
        render(DEMO_ACCOUNTS);
      })
      .then(function () { loading = false; });
  }

  function closePage() {
    page.classList.remove("open");
    page.setAttribute("aria-hidden", "true");
  }

  var back = document.getElementById("acct-back");
  if (back) back.addEventListener("click", closePage);
  var home = document.getElementById("acct-home");
  if (home) {
    home.addEventListener("click", function () {
      closePage();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // "THÊM" on the home card is rendered by React: delegate and stop its toast
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-testid="button-add-account"]') : null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openPage();
    },
    true
  );

  /* ---------- account detail (transactions) ---------- */

  var detail = document.getElementById("account-detail");
  var acdList = document.getElementById("acd-list");
  var acdEmpty = document.getElementById("acd-empty");
  var acdNote = document.getElementById("acd-note");
  var acdBalance = document.getElementById("acd-balance");
  var acdPill = document.getElementById("acd-pill");
  var acdPillLabel = document.getElementById("acd-pill-label");
  var acdMenu = document.getElementById("acd-menu");
  var acdToast = document.getElementById("acd-toast");
  var acdToastTimer = null;
  var detailAccount = null;
  var transactionDetail = document.getElementById("transaction-detail");
  var currentTransaction = null;

  var txdNodes = {
    amount: document.getElementById("txd-amount"),
    fromLabel: document.getElementById("txd-from-label"),
    fromName: document.getElementById("txd-from-name"),
    fromAccount: document.getElementById("txd-from-account"),
    toLabel: document.getElementById("txd-to-label"),
    toName: document.getElementById("txd-to-name"),
    toAccount: document.getElementById("txd-to-account"),
    status: document.getElementById("txd-status"),
    transferAmount: document.getElementById("txd-transfer-amount"),
    time: document.getElementById("txd-time"),
    ref: document.getElementById("txd-ref"),
    externalRef: document.getElementById("txd-external-ref"),
    copyRef: document.getElementById("txd-copy-ref"),
    description: document.getElementById("txd-description"),
    fromMark: document.getElementById("txd-from-mark"),
    toMark: document.getElementById("txd-to-mark"),
    toast: document.getElementById("txd-toast")
  };

  function acdShowToast(text) {
    if (!acdToast) return;
    acdToast.textContent = text;
    acdToast.classList.add("show");
    window.clearTimeout(acdToastTimer);
    acdToastTimer = window.setTimeout(function () { acdToast.classList.remove("show"); }, 1900);
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function formatTime(ms) {
    var d = new Date(Number(ms) || Date.now());
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) +
      ", " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function transactionParty(t) {
    if (t.counterpartyName) return String(t.counterpartyName);
    return stripDemo(t.title || "")
      .replace(/^(Received from|Send to|KHQR payment to)\s+/i, "") || "Account holder";
  }

  // 收款方账号：Bakong 别名换成真实账号；历史演示记录没有存账号时按收款人兜底
  var COUNTERPARTY_ALIASES = {
    "wing_khqr@wing": "000030101150606",
    "angkor.travel@acleda": "000889900112"
  };
  var COUNTERPARTY_NAMES = {
    "yukheang soeu": "000030101150606"
  };

  function counterpartyAccountValue(id, party) {
    var raw = String(id || "");
    if (raw) {
      var alias = COUNTERPARTY_ALIASES[raw.toLowerCase()];
      return alias || raw;
    }
    return COUNTERPARTY_NAMES[String(party || "").toLowerCase()] || "";
  }

  function partyAccountText(id, bank) {
    var value = id ? String(id) : "";
    if (bank) value += (value ? " - " : "") + bank;
    return value || "Account details unavailable";
  }

  function ownAccountText(id, currency) {
    var value = id ? String(id) : "";
    if (currency) value += (value ? " | " : "") + currency;
    return value || "Account details unavailable";
  }

  // 柬埔寨银行目录（kh-banks.js）：按银行名/别名匹配正式名称与 logo
  function khBankFor(bank) {
    var banks = (window.MB_KH_BANKS instanceof Array) ? window.MB_KH_BANKS : [];
    var raw = String(bank || "").toLowerCase();
    var key = raw.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    var simplified = key.replace(/\b(bank|plc|ltd|limited|public|company|co|corporation|branch|cambodia|cambodge)\b/g, " ")
      .replace(/\s+/g, " ").trim();
    var match = null;
    banks.some(function (item) {
      var aliases = (item.aliases instanceof Array ? item.aliases : []).map(function (a) {
        return String(a).toLowerCase();
      });
      if (aliases.indexOf(key) > -1 || aliases.indexOf(key.replace(/ /g, "")) > -1) {
        match = item;
        return true;
      }
      if (!simplified) return false;
      var names = [item.name, item.short].map(function (n) {
        return String(n || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ")
          .replace(/\b(bank|plc|ltd|limited|public|company|co|corporation|branch|cambodia|cambodge)\b/g, " ")
          .replace(/\s+/g, " ").trim();
      });
      if (names.indexOf(simplified) > -1) {
        match = item;
        return true;
      }
      var hit = aliases.some(function (alias) {
        return alias && (simplified.indexOf(alias) > -1 || key.indexOf(alias) > -1);
      });
      if (hit) {
        match = item;
        return true;
      }
      return false;
    });
    return match;
  }

  // 对方头像：本行是 MB 卡片，对手方按银行显示
  function paintPartyMark(el, bank, isOwn) {
    if (!el) return;
    el.classList.remove("has-logo");
    if (isOwn || !bank) {
      el.innerHTML = "MB<small>Cambodia</small>";
      return;
    }
    var name = String(bank);
    var directoryBank = khBankFor(name);
    if (directoryBank && directoryBank.logo) {
      el.classList.add("has-logo");
      el.innerHTML = '<img src="' + directoryBank.logo + '" alt="' + directoryBank.name.replace(/"/g, "") + '">';
      return;
    }
    if (/acleda/i.test(name)) {
      el.classList.add("has-logo");
      el.innerHTML = '<img src="./acleda-bank-logo.png" alt="">';
      return;
    }
    if (/wing/i.test(name)) {
      el.innerHTML = '<span class="txd-bank-tile wing">Wing Bank</span>';
      return;
    }
    if (/maybank/i.test(name)) {
      el.innerHTML = '<span class="txd-bank-tile maybank">Maybank</span>';
      return;
    }
    var initials = name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean)
      .map(function (w) { return w.charAt(0); }).join("").slice(0, 3).toUpperCase();
    el.innerHTML = '<span class="txd-bank-tile generic">' + (initials || "BANK") + '</span>';
  }

  function openTransactionDetail(t, isSample) {
    if (!transactionDetail || !t) return;
    currentTransaction = t;
    var incoming = t.direction === "in";
    var currency = t.currency || (detailAccount && detailAccount.currency) || "USD";
    var amount = money(t.amount, currency) + " " + currency;
    var party = transactionParty(t);
    var owner = (detailAccount && detailAccount.name) || HOLDER;
    var noteText = t.note || stripDemo(t.title || "") || "No description";
    if (!incoming && noteText === party + " transfer") noteText = owner + " transfer";
    var counterpartyAccount = counterpartyAccountValue(t.counterpartyAccount || t.merchantId, party);
    var bank = t.bank || "";
    var sample = Boolean(isSample || t.demo);
    var extRef = referenceCode(t.externalRef);
    if (!extRef && sample) {
      extRef = demoExternalRef(t.ref || t.title);
      t.externalRef = extRef;
    }
    var rawStatus = String(t.status || "").toLowerCase();
    var status = rawStatus === "pending" ? "Pending" :
      (rawStatus === "failed" || rawStatus === "expired" ? "Failed" : "Success");

    txdNodes.amount.textContent = (incoming ? "+" : "-") + amount;
    txdNodes.amount.classList.toggle("in", incoming);
    txdNodes.fromLabel.textContent = incoming ? "From" : "From";
    txdNodes.toLabel.textContent = "To";
    txdNodes.fromName.textContent = incoming ? party : owner;
    txdNodes.toName.textContent = incoming ? owner : party;
    txdNodes.fromAccount.textContent = incoming
      ? partyAccountText(counterpartyAccount, bank)
      : ownAccountText(detailAccount && detailAccount.id, currency);
    txdNodes.toAccount.textContent = incoming
      ? ownAccountText(detailAccount && detailAccount.id, currency)
      : partyAccountText(counterpartyAccount, bank);
    paintPartyMark(txdNodes.fromMark, bank, !incoming);
    paintPartyMark(txdNodes.toMark, bank, incoming);
    txdNodes.status.textContent = status;
    txdNodes.status.dataset.state = status === "Success" ? "success" : (status === "Pending" ? "pending" : "failed");
    txdNodes.transferAmount.textContent = amount;
    txdNodes.time.textContent = formatTime(t.createdAt);
    txdNodes.ref.textContent = referenceCode(t.ref) || "Not available";
    txdNodes.externalRef.textContent = extRef || "Not available";
    txdNodes.copyRef.disabled = !extRef;
    txdNodes.description.textContent = noteText;
    txdNodes.toast.textContent = "";
    if (detail) detail.setAttribute("aria-hidden", "true");
    transactionDetail.classList.add("open");
    transactionDetail.setAttribute("aria-hidden", "false");
  }

  function closeTransactionDetail() {
    if (!transactionDetail) return;
    transactionDetail.classList.remove("open");
    transactionDetail.setAttribute("aria-hidden", "true");
    if (detail && detail.classList.contains("open")) detail.setAttribute("aria-hidden", "false");
    currentTransaction = null;
  }

  var txdBack = document.getElementById("txd-back");
  if (txdBack) txdBack.addEventListener("click", closeTransactionDetail);

  var txdHome = document.getElementById("txd-home");
  if (txdHome) {
    txdHome.addEventListener("click", function () {
      closeTransactionDetail();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  var txdShare = document.getElementById("txd-share");
  if (txdShare) {
    txdShare.addEventListener("click", function () {
      var t = currentTransaction;
      if (!t) return;
      var currency = t.currency || (detailAccount && detailAccount.currency) || "USD";
      var signed = (t.direction === "in" ? "+" : "-") + money(t.amount, currency) + " " + currency;
      var party = transactionParty(t);
      var owner = (detailAccount && detailAccount.name) || HOLDER;
      var incoming = t.direction === "in";
      var rawStatus = String(t.status || "").toLowerCase();
      var status = rawStatus === "pending" ? "Pending" :
        (rawStatus === "failed" || rawStatus === "expired" ? "Failed" : "Success");
      var noteText = t.note || stripDemo(t.title || "") || "No description";
      if (!incoming && noteText === party + " transfer") noteText = owner + " transfer";
      var text = [
        "MB Cambodia - Transaction receipt",
        "Amount: " + signed,
        "From: " + (incoming ? party : owner),
        "To: " + (incoming ? owner : party),
        "Status: " + status,
        "Time: " + formatTime(t.createdAt),
        "Transaction code: " + (referenceCode(t.ref) || "Not available"),
        "Description: " + noteText
      ].join("\n");
      function shared() { txdNodes.toast.textContent = "Receipt shared"; }
      function fallbackCopied() { txdNodes.toast.textContent = "Receipt copied to clipboard"; }
      function fallback() {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(fallbackCopied).catch(function () {
            txdNodes.toast.textContent = "Unable to share receipt";
          });
        } else {
          txdNodes.toast.textContent = "Share is not available in this browser";
        }
      }
      if (navigator.share) {
        navigator.share({ title: "MB Cambodia transaction", text: text }).then(shared).catch(fallback);
      } else {
        fallback();
      }
    });
  }
  if (txdNodes.copyRef) {
    txdNodes.copyRef.addEventListener("click", function () {
      var ref = referenceCode(currentTransaction && currentTransaction.externalRef);
      if (!ref) return;
      function copied() { txdNodes.toast.textContent = "External reference copied"; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(String(ref)).then(copied).catch(function () {
          txdNodes.toast.textContent = "Unable to copy reference";
        });
      } else {
        txdNodes.toast.textContent = "Copy is not available in this browser";
      }
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && transactionDetail && transactionDetail.classList.contains("open")) {
      closeTransactionDetail();
    }
  });

  function accountKind(a) {
    return /savings/i.test(a.label || "") ? "Savings account" : "Payment account";
  }

  function sampleActivity(currency) {
    var m = currency === "KHR" ? 4000 : 1;
    // "dd/mm/yyyy hh:mm:ss" -> ms
    function stamp(text) {
      var parts = text.split(" ");
      var day = parts[0].split("/");
      var hm = parts[1].split(":");
      return new Date(Number(day[2]), Number(day[1]) - 1, Number(day[0]),
        Number(hm[0]), Number(hm[1]), Number(hm[2])).getTime();
    }
    return [
      { direction: "in", title: "Received from ANGKOR TRAVEL", amount: 0.07 * m, currency: currency, createdAt: stamp("05/11/2026 20:52:00"), ref: "FT263140N5GL", externalRef: "052d185c", status: "success", counterpartyAccount: "000889900112", bank: "Wing Bank", note: "ANGKOR TRAVEL transfer" },
      { direction: "in", title: "Received from SOKHA CHAN", amount: 0.01 * m, currency: currency, createdAt: stamp("05/11/2026 20:51:00"), ref: "FT263140N4KM", externalRef: "6b31f0a2", status: "success", counterpartyAccount: "1624454845", bank: "MB Bank Cambodia", note: "SOKHA CHAN transfer" },
      { direction: "in", title: "Received from ANGKOR TRAVEL", amount: 0.01 * m, currency: currency, createdAt: stamp("31/10/2026 21:05:00"), ref: "FT262990F2QJ", externalRef: "93c47d1e", status: "success", counterpartyAccount: "000889900112", bank: "Wing Bank", note: "ANGKOR TRAVEL transfer" },
      { direction: "out", title: "Send to ANGKOR SUPPLY", amount: 3.93 * m, currency: currency, createdAt: stamp("30/10/2026 22:34:00"), ref: "FT262940A7VB", externalRef: "7fa2c918", status: "success", counterpartyAccount: "000778899001", bank: "ACLEDA Bank", note: "Payment to ANGKOR SUPPLY" },
      { direction: "out", title: "Send to ANGKOR SUPPLY", amount: 50 * m, currency: currency, createdAt: stamp("30/10/2026 20:56:00"), ref: "FT262940A6TD", externalRef: "24bd90f5", status: "success", counterpartyAccount: "000778899001", bank: "ACLEDA Bank", note: "Payment to ANGKOR SUPPLY" },
      { direction: "out", title: "Send to KHOEURN BUNTHOEURN", amount: 1.99 * m, currency: currency, createdAt: stamp("30/10/2026 20:24:00"), ref: "FT262940A5RP", externalRef: "c81e3b67", status: "success", counterpartyAccount: "000665544332", bank: "Wing Bank", note: "Transfer to KHOEURN BUNTHOEURN" },
      { direction: "out", title: "TOP UP PHONE NUMBER - 0979935566", amount: 1 * m, currency: currency, createdAt: stamp("30/10/2026 19:57:00"), ref: "FT262940A4LM", externalRef: "45a9d02c", status: "success", counterpartyAccount: "0979935566", bank: "Mobile top-up", note: "Top-up 0979935566" },
      { direction: "out", title: "Send to TIMES MEDIA", amount: 5 * m, currency: currency, createdAt: stamp("30/10/2026 19:19:00"), ref: "FT262940A3HN", externalRef: "de07b154", status: "success", counterpartyAccount: "000554433221", bank: "ABA Bank", note: "Payment to TIMES MEDIA" }
    ];
  }

  function demoPaymentActivity(accountId) {
    try {
      var records = JSON.parse(localStorage.getItem("mb_local_tx") || "[]");
      return records.filter(function (t) { return t.accountId === accountId; });
    } catch (e) {
      return [];
    }
  }

  // Single source of truth for "the transaction records of this account":
  // server activity first, then locally recorded demo payments, then built-in samples.
  function activityFor(a) {
    return fetch("/api/internal/accounts/" + encodeURIComponent(a.id) + "/activity", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var items = (data && data.activity) || [];
        var account = (data && data.account) || a;
        if (items.length) return { account: account, items: items, sample: false };
        var localItems = demoPaymentActivity(a.id);
        if (localItems.length) return { account: account, items: localItems, sample: false };
        return { account: account, items: sampleActivity(a.currency), sample: true };
      })
      .catch(function () {
        var localItems = demoPaymentActivity(a.id);
        if (localItems.length) return { account: a, items: localItems, sample: false };
        return { account: a, items: sampleActivity(a.currency), sample: true };
      });
  }

  function openTransactionByRef(accountId, ref) {
    var accounts = (currentAccounts && currentAccounts.length ? currentAccounts : DEMO_ACCOUNTS) || [];
    var account = null;
    for (var i = 0; i < accounts.length; i++) {
      if (String(accounts[i].id) === String(accountId)) { account = accounts[i]; break; }
    }
    if (!account) account = accounts[0];
    if (!account || !acdList) return false;
    openDetail(account);
    var tries = 0;
    function seek() {
      var row = null;
      for (var j = 0; j < acdList.children.length; j++) {
        if (acdList.children[j].getAttribute("data-ref") === String(ref)) { row = acdList.children[j]; break; }
      }
      if (row) { row.click(); return; }
      if (++tries < 20) window.setTimeout(seek, 120);
    }
    window.setTimeout(seek, 160);
    return true;
  }

  function renderActivity(items, isSample) {
    acdList.innerHTML = "";
    if (!items.length) {
      acdEmpty.hidden = false;
      acdNote.hidden = true;
      return;
    }
    acdEmpty.hidden = true;
    acdNote.hidden = !isSample;

    items.forEach(function (t) {
      var li = document.createElement("li");
      li.className = "acd-row";
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.setAttribute("aria-label", "View transaction details: " + stripDemo(t.title || "transaction"));
      li.addEventListener("click", function () { openTransactionDetail(t, isSample); });
      li.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openTransactionDetail(t, isSample);
        }
      });

      var avatar = document.createElement("span");
      avatar.className = "acd-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.innerHTML = "MB<em>Cambodia</em>";

      var main = document.createElement("div");
      main.className = "acd-main";
      var title = document.createElement("p");
      title.className = "acd-row-title";
      title.textContent = stripDemo(t.title);
      var time = document.createElement("p");
      time.className = "acd-row-time";
      time.textContent = formatTime(t.createdAt);
      main.appendChild(title);
      main.appendChild(time);
      var rowAccount = counterpartyAccountValue(t.counterpartyAccount || t.merchantId, transactionParty(t));
      if (rowAccount) {
        var acct = document.createElement("p");
        acct.className = "acd-row-acct";
        acct.textContent = rowAccount + (t.bank ? " · " + t.bank : "");
        main.appendChild(acct);
      }
      if (t.note) {
        var note = document.createElement("p");
        note.className = "acd-row-note";
        note.textContent = t.note;
        main.appendChild(note);
      }
      if (t.ref) {
        var ref = document.createElement("p");
        ref.className = "acd-row-ref";
        ref.textContent = "Transaction code: " + (referenceCode(t.ref) || t.ref);
        main.appendChild(ref);
        li.setAttribute("data-ref", String(t.ref));
      }

      var amt = document.createElement("span");
      var incoming = t.direction === "in";
      amt.className = "acd-amount " + (incoming ? "in" : "out");
      var value = Number(t.amount) || 0;
      amt.textContent = (incoming ? "+" : "-") +
        (t.currency === "KHR"
          ? Math.round(value).toLocaleString("en-US")
          : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) +
        " " + t.currency;

      li.appendChild(avatar);
      li.appendChild(main);
      li.appendChild(amt);
      acdList.appendChild(li);
    });
  }

  function renderDetailHero(a) {
    if (!a) return;
    if (acdPillLabel) acdPillLabel.textContent = accountKind(a) + ": " + a.id;
    if (acdBalance) {
      acdBalance.innerHTML = money(a.balance, a.currency) + " <small>" + a.currency + "</small>";
    }
  }

  function loadActivity(a) {
    renderActivity([], false);
    acdEmpty.hidden = true;
    activityFor(a).then(function (result) {
      if (result.account) {
        detailAccount = result.account;
        renderDetailHero(result.account);
      }
      renderActivity(result.items, result.sample);
    });
  }

  function openDetail(a) {
    if (!detail) return;
    detailAccount = a;
    renderDetailHero(a);
    loadActivity(a);
    if (acdMenu) { acdMenu.hidden = true; acdPill.setAttribute("aria-expanded", "false"); }
    detail.classList.add("open");
    detail.setAttribute("aria-hidden", "false");
  }

  function closeDetail() {
    if (!detail) return;
    detail.classList.remove("open");
    detail.setAttribute("aria-hidden", "true");
    if (acdMenu) acdMenu.hidden = true;
  }

  var acdBack = document.getElementById("acd-back");
  if (acdBack) acdBack.addEventListener("click", closeDetail);
  var acdRefresh = document.getElementById("acd-refresh");
  if (acdRefresh) {
    acdRefresh.addEventListener("click", function () {
      if (detailAccount) {
        loadActivity(detailAccount);
        acdShowToast("Transactions refreshed");
      }
    });
  }

  if (acdPill) {
    acdPill.addEventListener("click", function () {
      if (!acdMenu) return;
      var open = acdMenu.hidden;
      if (open) {
        var rect = acdPill.getBoundingClientRect();
        acdMenu.style.top = Math.round(rect.bottom + 6) + "px";
        acdMenu.style.left = Math.round(rect.left) + "px";
        var accounts = currentAccounts || DEMO_ACCOUNTS;
        acdMenu.innerHTML = "";
        accounts.forEach(function (a) {
          var b = document.createElement("button");
          b.type = "button";
          b.setAttribute("data-account-id", a.id);
          if (detailAccount && a.id === detailAccount.id) b.className = "on";
          b.innerHTML = accountKind(a) + ": " + a.id +
            "<small>" + money(a.balance, a.currency) + " " + a.currency + "</small>";
          b.addEventListener("click", function () {
            detailAccount = a;
            renderDetailHero(a);
            loadActivity(a);
            syncHomeAccount(a);
            acdMenu.hidden = true;
            acdPill.setAttribute("aria-expanded", "false");
          });
          acdMenu.appendChild(b);
        });
      }
      acdMenu.hidden = !open;
      acdPill.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  var acdMore = document.getElementById("acd-more");
  if (acdMore) acdMore.addEventListener("click", function () { acdShowToast("Full statement is a demo feature"); });
  var acdExport = document.getElementById("acd-export");
  if (acdExport) acdExport.addEventListener("click", function () { acdShowToast("Statement export is a demo feature"); });

  window.mbAccountPage = {
    open: openPage,
    close: closePage,
    detail: openDetail,
    activity: activityFor,
    openTransaction: openTransactionByRef
  };
})();
