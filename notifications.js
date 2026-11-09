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
      addLine(card, "Transaction code", item.ref || "");
      addLine(card, "External Txn Ref", item.externalRef || "");
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

  function loadTransactions() {
    var request = ++transactionRequest;
    transactionList.innerHTML = "";
    transactionEmpty.textContent = "Loading transactions...";
    transactionEmpty.hidden = false;

    fetch("/api/internal/accounts", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Account request failed");
        return response.json();
      })
      .then(function (data) {
        var accounts = (data && data.accounts) || [];
        var account = accounts.filter(function (item) { return item.currency === "USD"; })[0] || accounts[0] || null;
        if (!account) throw new Error("No account available");
        return fetch("/api/internal/accounts/" + encodeURIComponent(account.id) + "/activity", { cache: "no-store" })
          .then(function (response) {
            if (!response.ok) throw new Error("Activity request failed");
            return response.json();
          })
          .then(function (activity) {
            if (request !== transactionRequest) return;
            var items = (activity && activity.activity) || [];
            transactionEmpty.textContent = "No transaction records yet.";
            if (items.length) renderTransactions(items, activity.account);
            else {
              var localItems = readLocalTransactions(account.id);
              renderTransactions(localItems, account);
            }
          });
      })
      .catch(function () {
        if (request !== transactionRequest) return;
        transactionEmpty.textContent = "No transaction records yet.";
        renderTransactions(readLocalTransactions(fallbackAccountId()), null);
      });
  }

  function openNotifications() {
    if (window.mbReferral && window.mbReferral.close) window.mbReferral.close();
    page.classList.add("open");
    page.setAttribute("aria-hidden", "false");
    document.body.classList.add("notification-open");
    document.documentElement.style.overflow = "hidden";
    setTab("general");
  }

  function closeNotifications() {
    page.classList.remove("open");
    page.setAttribute("aria-hidden", "true");
    document.body.classList.remove("notification-open");
    document.documentElement.style.overflow = "";
  }

  page.addEventListener("click", function (event) {
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
    if (page.classList.contains("open") && !transactionPanel.hidden) loadTransactions();
  });

  window.mbNotifications = { open: openNotifications, close: closeNotifications };
})();
