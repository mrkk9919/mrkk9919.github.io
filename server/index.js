"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const config = require("./config");
const bakong = require("./lib/bakong");
const store = require("./lib/store");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function send(res, status, body, headers) {
  const h = Object.assign(
    {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    },
    headers || {}
  );
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    if (!h["Content-Type"]) h["Content-Type"] = "text/plain; charset=utf-8";
  } else {
    body = JSON.stringify(body);
    h["Content-Type"] = "application/json; charset=utf-8";
  }
  res.writeHead(status, h);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 100 * 1024) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

/* ---------------- 业务路由 ---------------- */

async function createPayment(body) {
  const qr = String(body.qr || "").trim();
  if (!qr) return { status: 400, body: { error: "缺少 qr" } };

  const decoded = bakong.decodeKhqr(qr);
  if (!decoded) {
    return { status: 400, body: { error: "该二维码不是合法的 KHQR 支付码", code: "NOT_KHQR" } };
  }
  if (config.paymentMode !== "demo" && !config.bakong.token) {
    return {
      status: 503,
      body: {
        error: "Bakong is not configured. Add BAKONG_TOKEN or use explicit demo mode.",
        code: "BAKONG_NOT_CONFIGURED"
      }
    };
  }

  // 静态码不带金额时，由付款方在界面输入
  const amount = decoded.amount !== null ? decoded.amount : Number(body.amount);
  if (!isFinite(amount) || amount <= 0) {
    return { status: 400, body: { error: "金额无效", code: "INVALID_AMOUNT" } };
  }

  const hash = bakong.md5(qr);
  // Demo payments are completed by the local status poller and must not wait
  // for an unrelated live Bakong deeplink request.
  const deeplink = config.paymentMode === "demo" ? null : await bakong.makeDeeplink(qr);

  const payment = store.createPayment({
    qr,
    md5: hash,
    merchant: decoded.merchant,
    city: decoded.city,
    merchantAccount: decoded.bakongAccountId,
    merchantId: decoded.merchantId,
    recipientBank: decoded.bank,
    note: String(body.note || "").slice(0, 80),
    amount,
    currency: decoded.currency,
    fromAccount: String(body.from || ""),
    deeplink
  });

  return { status: 201, body: publicPayment(payment) };
}

// 支付成功后把该笔交易写入付款账户流水（只记一次）
function recordLedger(payment) {
  if (!payment || payment.recorded || !payment.fromAccount) return;
  const r = store.recordExternalPayment({
    accountId: payment.fromAccount,
    amount: payment.amount,
    currency: payment.currency,
    merchant: payment.merchant,
    merchantId: payment.merchantId,
    note: payment.note,
    ref: payment.ref,
    externalRef: payment.tx && (payment.tx.hash || payment.tx.transactionId || payment.tx.externalTxnRef),
    bank: payment.recipientBank
  });
  if (!r.ok) {
    store.updatePayment(payment.id, { ledgerError: r.message });
    return;
  }
  store.updatePayment(payment.id, {
    recorded: true,
    ledgerRef: r.record.ref,
    ledgerError: null
  });
}

async function paymentStatus(id, body) {
  let payment = store.getPayment(id);
  if (!payment) return { status: 404, body: { error: "支付单不存在" } };

  if (payment.status === "paid" && !payment.recorded) {
    recordLedger(payment);
    payment = store.getPayment(id);
  }

  if (payment.status === "pending") {
    const now = Date.now();

    if (payment.demo) {
      if (now - payment.createdAt > 2500) {
        const paid = store.updatePayment(id, {
          status: "paid",
          paidAt: now,
          tx: { hash: "demo_" + id.slice(0, 8), currency: payment.currency, amount: payment.amount }
        });
        recordLedger(paid);
        return { status: 200, body: publicPayment(store.getPayment(id)) };
      }
    } else if (now > payment.expiresAt) {
      const expired = store.updatePayment(id, { status: "expired" });
      return { status: 200, body: publicPayment(expired) };
    } else if (now - (payment.lastCheckedAt || 0) > 2000) {
      store.updatePayment(id, { lastCheckedAt: now });
      try {
        const result = await bakong.checkByMd5(payment.md5);
        if (result.paid) {
          const paid = store.updatePayment(id, { status: "paid", paidAt: now, tx: result.tx });
          recordLedger(paid);
          return { status: 200, body: publicPayment(store.getPayment(id)) };
        }
        store.updatePayment(id, { lastError: result.reason || null });
      } catch (err) {
        store.updatePayment(id, { lastError: String(err.message || err) });
      }
    }
  }

  return { status: 200, body: publicPayment(store.getPayment(id)) };
}

function publicPayment(p) {
  return {
    id: p.id,
    ref: p.ref,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    merchant: p.merchant,
    city: p.city,
    merchantAccount: p.merchantAccount,
    merchantId: p.merchantId || null,
    recipientBank: p.recipientBank || { name: "Bakong member bank", short: "", code: "" },
    note: p.note || "",
    deeplink: p.deeplink || null,
    demo: Boolean(p.demo),
    tx: p.tx || null,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
    lastError: p.lastError || null
  };
}

async function createQr(body) {
  try {
    const result = bakong.createOwnQr({
      amount: body.amount === undefined || body.amount === "" ? null : Number(body.amount),
      currency: body.currency,
      billNumber: body.billNumber
    });
    return {
      status: 201,
      body: {
        qr: result.qr,
        md5: result.md5,
        amount: result.amount,
        currency: result.currency,
        merchant: config.bakong.merchantName,
        account: config.bakong.accountId,
        env: config.bakong.env
      }
    };
  } catch (err) {
    return { status: 503, body: { error: String(err.message || err), code: "QR_UNAVAILABLE" } };
  }
}

async function checkQrStatus(hash, body) {
  if (config.paymentMode === "demo") {
    return { status: 200, body: { md5: hash, status: "UNPAID", demo: true } };
  }
  try {
    const result = await bakong.checkByMd5(hash);
    return { status: 200, body: { md5: hash, status: result.paid ? "PAID" : "UNPAID", tx: result.tx || null } };
  } catch (err) {
    return { status: 502, body: { error: String(err.message || err) } };
  }
}

async function handleApi(req, res, pathname, query) {
  if (req.method === "GET" && pathname === "/api/health") {
    return send(res, 200, {
      ok: true,
      bakong: bakong.info(),
      storage: store.storageMode(),
      time: Date.now()
    });
  }

  if (req.method === "POST" && pathname === "/api/payments/create") {
    const body = await readBody(req);
    const r = await createPayment(body);
    return send(res, r.status, r.body);
  }

  // 扫码后先解析出商户/银行，供「Pay to Merchant」屏展示（不建支付单）
  if (req.method === "POST" && pathname === "/api/scan/resolve") {
    const body = await readBody(req);
    const qr = String(body.qr || "");
    const decoded = qr ? bakong.decodeKhqr(qr) : null;
    if (!decoded) return send(res, 422, { error: "不是受支持的 KHQR 收款码", code: "INVALID_QR" });
    let recipient = null;
    if (config.bakong.token && decoded.bakongAccountId) {
      try {
        const r = await bakong.checkAccount(decoded.bakongAccountId);
        recipient = {
          exists: r.exists,
          fullName: r.fullName,
          accountStatus: r.accountStatus,
          kycStatus: r.kycStatus,
          canReceive: r.canReceive,
          frozen: r.frozen,
          message: r.message
        };
      } catch (err) {
        recipient = { exists: null, message: String(err.message || err) };
      }
    }
    return send(res, 200, {
      merchant: decoded.merchant,
      city: decoded.city,
      amount: decoded.amount,
      currency: decoded.currency,
      bank: decoded.bank,
      merchantAccount: decoded.bakongAccountId,
      merchantId: decoded.merchantId,
      merchantType: decoded.merchantType,
      recipient
    });
  }

  const paymentMatch = pathname.match(/^\/api\/payments\/([a-f0-9]{16,32})$/);
  if (req.method === "GET" && paymentMatch) {
    const r = await paymentStatus(paymentMatch[1]);
    return send(res, r.status, r.body);
  }

  if (req.method === "POST" && pathname === "/api/qr/create") {
    const body = await readBody(req);
    const r = await createQr(body);
    return send(res, r.status, r.body);
  }

  const qrMatch = pathname.match(/^\/api\/qr\/([a-f0-9]{32})\/status$/);
  if (req.method === "GET" && qrMatch) {
    const r = await checkQrStatus(qrMatch[1]);
    return send(res, r.status, r.body);
  }

  /* ---- Bakong Open API 支持服务 ---- */

  if (req.method === "GET" && pathname === "/api/bakong/status") {
    return send(res, 200, { ok: true, bakong: bakong.info() });
  }

  if (req.method === "POST" && pathname === "/api/bakong/token/request") {
    const body = await readBody(req);
    if (!body.email) return send(res, 400, { error: "缺少 email", code: "EMAIL_REQUIRED" });
    const r = await bakong.requestToken(body);
    return send(res, r.ok ? 200 : 502, r);
  }

  if (req.method === "POST" && pathname === "/api/bakong/token/verify") {
    const body = await readBody(req);
    if (!body.code) return send(res, 400, { error: "缺少 code", code: "CODE_REQUIRED" });
    const r = await bakong.verifyCode(body.code);
    return send(res, r.ok ? 200 : 502, r);
  }

  if (req.method === "POST" && pathname === "/api/bakong/token/renew") {
    try {
      const newToken = await bakong.renewToken();
      return send(res, 200, { ok: true, tokenConfigured: Boolean(newToken), bakong: bakong.info() });
    } catch (err) {
      return send(res, 502, { error: String(err.message || err), code: "TOKEN_RENEW_FAILED" });
    }
  }

  if (req.method === "POST" && pathname === "/api/bakong/check-account") {
    const body = await readBody(req);
    const accountId = String(body.accountId || "").trim();
    if (!accountId) return send(res, 400, { error: "缺少 accountId", code: "ACCOUNT_REQUIRED" });
    if (!config.bakong.token) {
      return send(res, 503, { error: "BAKONG_TOKEN 未配置", code: "BAKONG_TOKEN_MISSING" });
    }
    try {
      const r = await bakong.checkAccount(accountId);
      return send(res, 200, { accountId, ...r });
    } catch (err) {
      return send(res, 502, { error: String(err.message || err), code: "BAKONG_REQUEST_FAILED" });
    }
  }

  if (req.method === "POST" && pathname === "/api/bakong/transaction") {
    const body = await readBody(req);
    if (!config.bakong.token) {
      return send(res, 503, { error: "BAKONG_TOKEN 未配置", code: "BAKONG_TOKEN_MISSING" });
    }
    try {
      let r;
      if (body.md5) r = await bakong.checkByMd5(String(body.md5));
      else if (body.hash) r = await bakong.checkByHash(String(body.hash));
      else if (body.shortHash) r = await bakong.checkByShortHash(body.shortHash, body.amount, body.currency);
      else return send(res, 400, { error: "缺少 md5 / hash / shortHash", code: "QUERY_REQUIRED" });
      return send(res, 200, { ok: r.found, status: r.paid ? "PAID" : "UNPAID", ...r });
    } catch (err) {
      return send(res, 502, { error: String(err.message || err), code: "BAKONG_REQUEST_FAILED" });
    }
  }

  if (req.method === "POST" && pathname === "/api/bakong/deeplink") {
    const body = await readBody(req);
    const qr = String(body.qr || "").trim();
    if (!qr) return send(res, 400, { error: "缺少 qr", code: "QR_REQUIRED" });
    const deeplink = await bakong.makeDeeplink(qr);
    return send(res, deeplink ? 200 : 502, {
      ok: Boolean(deeplink),
      deeplink,
      error: deeplink ? null : "Bakong 未返回 deeplink"
    });
  }

  /* ---- 内部转账 ---- */

  if (req.method === "GET" && pathname === "/api/internal/accounts") {
    return send(res, 200, { accounts: store.listAccounts() });
  }

  const activityMatch = pathname.match(/^\/api\/internal\/accounts\/([^/]+)\/activity$/);
  if (req.method === "GET" && activityMatch) {
    const accountId = decodeURIComponent(activityMatch[1]);
    const account = store.getAccount(accountId);
    if (!account) return send(res, 404, { error: "account not found" });
    const activity = store.listTransfers(accountId).map((t) => {
      const outgoing = t.from === accountId;
      const other = store.getAccount(outgoing ? t.to : t.from) || {};
      const name = other.name || other.label || (outgoing ? t.to : t.from);
      return {
        direction: outgoing ? "out" : "in",
        title: (t.external ? "KHQR payment to " : (outgoing ? "Send to " : "Received from ")) + name,
        counterpartyName: name,
        counterpartyAccount: other.id || t.merchantId || null,
        amount: t.amount,
        currency: t.currency,
        createdAt: t.createdAt,
        status: t.status || "completed",
        ref: t.ref,
        externalRef: t.externalRef || null,
        note: t.note || "",
        merchantId: t.merchantId || null,
        bank: t.bank || null,
        balanceAfter: t.balanceAfter === undefined ? null : t.balanceAfter,
        accountId,
        external: Boolean(t.external)
      };
    });
    return send(res, 200, { account, activity });
  }

  if (req.method === "POST" && pathname === "/api/internal/accounts") {
    const body = await readBody(req);
    const r = store.createAccount({
      name: String(body.name || ""),
      type: String(body.type || ""),
      currency: String(body.currency || ""),
      balance: body.balance
    });
    if (!r.ok) return send(res, 400, { error: r.message, code: r.code });
    return send(res, 201, { account: r.account, accounts: r.accounts });
  }

  if (req.method === "POST" && pathname === "/api/internal/transfer") {
    const body = await readBody(req);
    const result = store.transfer({
      from: String(body.from || ""),
      to: String(body.to || ""),
      amount: body.amount,
      note: body.note
    });
    if (!result.ok) {
      return send(res, 400, { error: result.message, code: result.code });
    }
    return send(res, 201, { transfer: result.transfer, accounts: result.accounts });
  }

  if (req.method === "GET" && pathname === "/api/internal/transactions") {
    return send(res, 200, {
      transfers: store.listTransfers(query.account || null),
      accounts: store.listAccounts()
    });
  }

  return send(res, 404, { error: "not found" });
}

/* ---------------- 静态文件 ---------------- */

function serveStatic(req, res, pathname) {
  let rel = pathname;
  if (pathname === "/" || pathname === "") {
    rel = "index.html";
  } else if (rel.startsWith(config.sitePrefix)) {
    rel = rel.slice(config.sitePrefix.length) || "index.html";
  } else {
    // 也支持根路径直接访问（资源已是相对路径，两种部署形态都能跑）
    rel = rel.replace(/^\/+/, "");
  }

  const decoded = decodeURIComponent(rel.split("?")[0]);
  if (decoded.includes("\0")) return send(res, 400, { error: "bad path" });

  const target = path.join(config.siteRoot, path.normalize(decoded));
  if (!target.startsWith(config.siteRoot)) return send(res, 403, { error: "forbidden" });

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, { error: "not found" });
    const type = MIME[path.extname(target).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size });
    fs.createReadStream(target).pipe(res);
  });
}

/* ---------------- 启动 ---------------- */

const server = http.createServer((req, res) => {
  let parsed;
  try {
    parsed = url.parse(req.url, true);
  } catch (err) {
    return send(res, 400, { error: "bad request" });
  }
  const pathname = parsed.pathname || "/";

  if (pathname.startsWith("/api/")) {
    if (req.method === "OPTIONS") return send(res, 204, "");
    handleApi(req, res, pathname, parsed.query).catch((err) => {
      const status = /payload too large|invalid json/.test(String(err.message)) ? 400 : 500;
      send(res, status, { error: String(err.message || err) });
    });
    return;
  }
  serveStatic(req, res, pathname);
});

async function boot() {
  const storage = await store.init();

  server.listen(config.port, "0.0.0.0", () => {
    console.log("[mb-cambodia] API + static on http://0.0.0.0:" + config.port + config.sitePrefix);
    console.log("[mb-cambodia] Bakong:", config.bakong.env, config.bakong.baseUrl, "| mode:", config.paymentMode);
    console.log("[mb-cambodia] 存储:", storage.mode + (storage.seeded ? "（已用现有数据初始化）" : ""));
    if (!config.bakongReady) {
      console.warn("[mb-cambodia] 警告：BAKONG_* 未配置完整，/api/payments 将无法校验真实交易");
    }
  });
}

boot().catch((err) => {
  console.error("[mb-cambodia] 启动失败:", err);
  process.exit(1);
});
