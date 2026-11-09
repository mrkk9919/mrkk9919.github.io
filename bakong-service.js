/*!
 * Bakong Open API 前端支持层
 * 只负责调用本站 /api/bakong/* 服务（token 保存在服务端，不会下发到浏览器）。
 * 部署静态站（GitHub Pages）时默认关闭；把 window.MB_API_BASE 指到自己的
 * API 服务（例如 https://api.example.com/api）即可启用。
 */
(function () {
  "use strict";

  var API_BASE = window.MB_API_BASE || "/api";
  var state = { available: false, ready: false, bakong: null, checkedAt: 0 };

  function request(pathname, options) {
    var opts = options || {};
    var init = {
      method: opts.method || "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    return fetch(API_BASE + pathname, init).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!res.ok) {
            var err = new Error(data.error || "HTTP " + res.status);
            err.code = data.code || null;
            err.status = res.status;
            throw err;
          }
          return data;
        });
    });
  }

  function applyStatus(payload) {
    state.available = true;
    state.bakong = payload.bakong || null;
    state.ready = Boolean(payload.bakong && payload.bakong.ready);
    state.checkedAt = Date.now();
    try {
      window.dispatchEvent(new CustomEvent("mb:bakong-status", { detail: status() }));
    } catch (err) {
      /* 老浏览器忽略 */
    }
    return status();
  }

  function status() {
    return {
      available: state.available,
      ready: state.ready,
      checkedAt: state.checkedAt,
      apiBase: API_BASE,
      bakong: state.bakong
    };
  }

  function refresh() {
    return request("/bakong/status")
      .then(applyStatus)
      .catch(function (err) {
        state.available = false;
        state.ready = false;
        state.checkedAt = Date.now();
        state.error = err && err.message;
        return status();
      });
  }

  function checkAccount(accountId) {
    return request("/bakong/check-account", {
      method: "POST",
      body: { accountId: accountId }
    });
  }

  function transaction(query) {
    return request("/bakong/transaction", { method: "POST", body: query || {} });
  }

  function deeplink(qr) {
    return request("/bakong/deeplink", { method: "POST", body: { qr: qr } });
  }

  function requestToken(input) {
    return request("/bakong/token/request", { method: "POST", body: input || {} });
  }

  function verifyToken(code) {
    return request("/bakong/token/verify", { method: "POST", body: { code: code } });
  }

  function renewToken() {
    return request("/bakong/token/renew", { method: "POST", body: {} });
  }

  window.mbBakong = {
    status: status,
    refresh: refresh,
    checkAccount: checkAccount,
    transaction: transaction,
    deeplink: deeplink,
    requestToken: requestToken,
    verifyToken: verifyToken,
    renewToken: renewToken
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      refresh();
    });
  } else {
    refresh();
  }
})();
