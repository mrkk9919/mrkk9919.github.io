(function () {
  "use strict";

  var page = document.getElementById("notification-page");
  if (!page) return;

  var generalPanel = document.getElementById("notice-general");
  var transactionPanel = document.getElementById("notice-transaction");
  var generalTab = document.getElementById("notice-tab-general");
  var transactionTab = document.getElementById("notice-tab-transaction");
  var transactionList = document.getElementById("notice-transaction-list");
  var transactionEmpty = document.getElementById("notice-transaction-empty");
  var alertList = document.getElementById("notice-alert-list");
  var transactionRequest = 0;

  function setTab(name) {
    var general = name === "general";
    generalTab.classList.toggle("selected", general);
    transactionTab.classList.toggle("selected", !general);
    generalTab.setAttribute("aria-selected", general ? "true" : "false");
    transactionTab.setAttribute("aria-selected", general ? "false" : "true");
    generalPanel.hidden = !general;
    transactionPanel.hidden = general;
    if (!general) loadTransactions();
  }

  function displayRef(ref) {
    return String(ref == null ? "" : ref).replace(/^(?:DEMO-|demo_)/i, "");
  }

  // 演示流水没有后端 External Txn Ref 时，按交易号生成稳定的 8 位十六进制参考号
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

  function externalRefOf(item) {
    var ref = displayRef(item.externalRef);
    if (ref) return ref;
    return item.ref ? demoExternalRef(item.ref) : "";
  }

  function dateParts(value) {
    var date = new Date(Number(value) || Date.now());
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    var key = pad(date.getDate()) + "/" + pad(date.getMonth() + 1) + "/" + date.getFullYear();
    var today = new Date();
    var isToday = date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    return {
      key: key,
      label: isToday ? "Today" : key,
      time: pad(date.getHours()) + ":" + pad(date.getMinutes()) + " " + key
    };
  }

  function money(value, currency) {
    var amount = Number(value) || 0;
    return currency === "KHR"
      ? Math.round(amount).toLocaleString("en-US") + " KHR"
      : amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;
  }

  function addLine(card, label, value, className) {
    if (value === null || value === undefined || value === "") return;
    var line = document.createElement("p");
    var strong = document.createElement("strong");
    line.appendChild(document.createTextNode(label + ": "));
    strong.textContent = value;
    if (className) strong.className = className;
    line.appendChild(strong);
    card.appendChild(line);
  }

  function renderTransactions(items, account) {
    transactionList.innerHTML = "";
    transactionEmpty.hidden = items.length > 0;
    if (!items.length) return;

    var dateHeading = "";
    items.forEach(function (item) {
      var date = dateParts(item.createdAt);
      if (date.key !== dateHeading) {
        dateHeading = date.key;
        var heading = document.createElement("h2");
        heading.className = "notification-day";
        heading.textContent = date.label;
        transactionList.appendChild(heading);
      }

      var card = document.createElement("article");
      card.className = "transaction-notice";
      addLine(card, "Checking account", item.accountId || (account && account.id) || "");
      var outgoing = item.direction === "out";
      var amount = money(item.amount, item.currency || (account && account.currency) || "USD");
      addLine(card, "Amount", (outgoing ? "-" : "+") + amount, outgoing ? "transaction-out" : "transaction-in");
      if (item.balanceAfter !== null && item.balanceAfter !== undefined) {
        addLine(card, "Balance", money(item.balanceAfter, item.currency || (account && account.currency) || "USD"));
      }
      if (item.title) addLine(card, outgoing ? "To" : "From", item.title.replace(/^Demo\s*·\s*/i, "").replace(/^(KHQR payment to |Send to |Received from )/, ""));
      if (item.merchantId) addLine(card, "Merchant ID", item.merchantId);
      if (item.bank) addLine(card, "Receiver bank", item.bank);
      addLine(card, "Transaction time", date.time);
      addLine(card, "Transaction code", displayRef(item.ref) || "");
      addLine(card, "External Txn Ref", externalRefOf(item));
      addLine(card, "Description", item.note || (item.title || "").replace(/^Demo\s*·\s*/i, ""));
      transactionList.appendChild(card);
    });
  }

  function readLocalTransactions(accountId) {
    try {
      var records = JSON.parse(localStorage.getItem("mb_local_tx") || "[]");
      return records.filter(function (item) { return !accountId || item.accountId === accountId; });
    } catch (e) {
      return [];
    }
  }

  function fallbackAccountId() {
    var selector = document.querySelector('[data-testid="button-account-selector"]');
    var match = selector && selector.textContent.match(/\b\d{6,}\b/);
    return match ? match[0] : "2118997861";
  }

  function primaryAccount() {
    var demo = (window.mbDemoAccounts || []).slice();
    for (var i = 0; i < demo.length; i++) {
      if (demo[i] && demo[i].currency === "USD") return demo[i];
    }
    return demo[0] || null;
  }

  function sortNewest(items) {
    return items.slice().sort(function (a, b) {
      return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
    });
  }

  function alertTitle(item) {
    var title = String(item.title || "").replace(/^Demo\s*·\s*/i, "");
    if (title) return title;
    return item.direction === "out" ? "Money sent" : "Money received";
  }

  function renderAlerts(items, account) {
    if (!alertList) return;
    alertList.innerHTML = "";
    if (!items.length) {
      alertList.hidden = true;
      return;
    }
    alertList.hidden = false;
    var heading = document.createElement("h2");
    heading.className = "notification-day";
    heading.textContent = "Latest transactions";
    alertList.appendChild(heading);

    sortNewest(items).slice(0, 10).forEach(function (item) {
      var card = document.createElement("article");
      card.className = "notification-card notification-alert";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("data-ref", item.ref || "");
      card.setAttribute("data-account", item.accountId || (account && account.id) || "");

      var head = document.createElement("h2");
      var icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "\uD83D\uDD14";
      head.appendChild(icon);
      head.appendChild(document.createTextNode(alertTitle(item)));
      card.appendChild(head);

      var meta = document.createElement("p");
      var outgoing = item.direction === "out";
      var amount = money(item.amount, item.currency || (account && account.currency) || "USD");
      var amountEl = document.createElement("strong");
      amountEl.className = outgoing ? "transaction-out" : "transaction-in";
      amountEl.textContent = (outgoing ? "-" : "+") + amount;
      meta.appendChild(amountEl);
      var accountId = item.accountId || (account && account.id) || "";
      meta.appendChild(document.createTextNode(" · " + (accountId ? "Account " + accountId + " · " : "") + dateParts(item.createdAt).time));
      card.appendChild(meta);

      if (item.ref) {
        var refLine = document.createElement("p");
        var refStrong = document.createElement("strong");
        refStrong.textContent = "Transaction code: " + (displayRef(item.ref) || "");
        refLine.appendChild(refStrong);
        card.appendChild(refLine);
      }
      alertList.appendChild(card);
    });
  }

  function loadTransactions() {
    var request = ++transactionRequest;
    transactionList.innerHTML = "";
    transactionEmpty.textContent = "Loading transactions...";
    transactionEmpty.hidden = false;

    var account = primaryAccount();
    var feed;
    if (account && window.mbAccountPage && window.mbAccountPage.activity) {
      feed = window.mbAccountPage.activity(account);
    } else {
      feed = Promise.resolve({
        account: account,
        items: readLocalTransactions((account && account.id) || fallbackAccountId())
      });
    }

    feed.then(function (result) {
      if (request !== transactionRequest) return;
      var items = (result && result.items) || [];
      var resultAccount = (result && result.account) || account;
      transactionEmpty.textContent = "No transaction records yet.";
      transactionEmpty.hidden = items.length > 0;
      renderTransactions(items, resultAccount);
      renderAlerts(items, resultAccount);
    }).catch(function () {
      if (request !== transactionRequest) return;
      transactionEmpty.textContent = "No transaction records yet.";
      renderTransactions([], account);
      renderAlerts([], account);
    });
  }

  function openNotifications() {
    if (window.mbReferral && window.mbReferral.close) window.mbReferral.close();
    page.classList.add("open");
    page.setAttribute("aria-hidden", "false");
    document.body.classList.add("notification-open");
    document.documentElement.style.overflow = "hidden";
    setTab("general");
    loadTransactions();
  }

  function closeNotifications() {
    page.classList.remove("open");
    page.setAttribute("aria-hidden", "true");
    document.body.classList.remove("notification-open");
    document.documentElement.style.overflow = "";
  }

  page.addEventListener("click", function (event) {
    var alert = event.target.closest(".notification-alert");
    if (alert) {
      var ref = alert.getAttribute("data-ref");
      var accountId = alert.getAttribute("data-account");
      closeNotifications();
      if (ref && window.mbAccountPage && window.mbAccountPage.openTransaction) {
        window.setTimeout(function () {
          window.mbAccountPage.openTransaction(accountId, ref);
        }, 80);
      } else if (accountId && window.mbAccountPage && window.mbAccountPage.open) {
        window.setTimeout(function () {
          window.mbAccountPage.open();
        }, 80);
      }
      return;
    }

    var tab = event.target.closest("[data-notice-tab]");
    if (tab) {
      setTab(tab.getAttribute("data-notice-tab"));
      return;
    }

    if (event.target.closest("[data-notification-close]")) {
      closeNotifications();
      return;
    }

    var nav = event.target.closest("[data-notification-nav]");
    if (!nav) return;
    var destination = nav.getAttribute("data-notification-nav");
    if (destination === "home") {
      closeNotifications();
      return;
    }
    closeNotifications();
    if (destination === "scan") {
      window.setTimeout(function () {
        if (window.mbScanQR && window.mbScanQR.open) window.mbScanQR.open();
      }, 60);
    } else if (destination === "referral") {
      if (window.mbReferral && window.mbReferral.open) window.mbReferral.open();
    } else {
      var original = document.querySelector('[data-testid="nav-' + destination + '"]');
      if (original) original.click();
    }
  });

  document.addEventListener("click", function (event) {
    if (page.classList.contains("open")) return;
    var button = event.target.closest('[data-testid="nav-notifications"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openNotifications();
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && page.classList.contains("open")) closeNotifications();
  });
  document.addEventListener("mb:payment-recorded", function () {
    if (page.classList.contains("open")) loadTransactions();
  });

  window.mbNotifications = { open: openNotifications, close: closeNotifications };
})();
