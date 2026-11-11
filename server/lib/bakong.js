"use strict";

const crypto = require("crypto");
const config = require("../config");
const { BakongKHQR, khqrData, MerchantInfo, IndividualInfo } = require("bakong-khqr");

let token = config.bakong.token;
let renewing = null;

let proxyDispatcher = null;
if (config.bakong.proxy) {
  try {
    const { ProxyAgent } = require("undici");
    proxyDispatcher = new ProxyAgent(config.bakong.proxy);
  } catch (err) {
    console.error("Bakong proxy init failed:", err.message);
  }
}

function md5(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

async function call(pathname, body, options) {
  const opts = options || {};
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (opts.auth !== false) headers.Authorization = "Bearer " + (token || "");
  let res;
  try {
    res = await fetch(config.bakong.baseUrl + pathname, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(20000),
      ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {})
    });
  } catch (err) {
    const cause = err && err.cause;
    console.error(
      "[bakong] fetch failed:",
      err && err.message,
      "| cause:",
      cause && (cause.code || cause.message),
      "| proxy:",
      config.bakong.proxy ? "on" : "off"
    );
    throw err;
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    /* 非 JSON 响应（网关错误页等） */
  }
  return { status: res.status, json, text };
}

async function renewToken() {
  if (renewing) return renewing;
  renewing = (async () => {
    if (!config.bakong.email) throw new Error("未配置 BAKONG_EMAIL，无法自动续期 token");
    const r = await call("/v1/renew_token", { email: config.bakong.email }, { auth: false });
    const newToken = r.json && r.json.data && r.json.data.token;
    if (!newToken) {
      throw new Error("续期失败：" + (r.json ? r.json.responseMessage : r.status));
    }
    token = newToken; // 仅保存在内存，不写回 .env
    return token;
  })();
  try {
    return await renewing;
  } finally {
    renewing = null;
  }
}

/**
 * 通过 md5 向 Bakong 查询这笔 QR 是否已被支付。
 * responseCode === 0 且 data 非空 => 已支付；其余一律视为未支付。
 */
async function checkByMd5(hash) {
  const r = await authed("/v1/check_transaction_by_md5", { md5: hash });
  return transactionResult(r);
}

/** 用完整交易 hash 查询（Bakong 文档 6） */
async function checkByHash(hash) {
  const r = await authed("/v1/check_transaction_by_hash", { hash: hash });
  return transactionResult(r);
}

/** 用 8 位短 hash + 金额币种查询（Bakong 文档 7） */
async function checkByShortHash(hash, amount, currency) {
  const r = await authed("/v1/check_transaction_by_short_hash", {
    hash: hash,
    amount: Number(amount),
    currency: String(currency || "USD").toUpperCase()
  });
  return transactionResult(r);
}

/** 校验 Bakong 账户是否存在（文档 8）：responseCode 0 = 存在 */
async function checkAccount(accountId) {
  const r = await authed("/v1/check_bakong_account", { accountId: accountId });
  const data = (r.json && r.json.data) || {};
  return {
    ok: Boolean(r.json && r.json.responseCode === 0),
    exists: Boolean(r.json && r.json.responseCode === 0),
    httpStatus: r.status,
    errorCode: r.json ? r.json.errorCode : null,
    message: (r.json && r.json.responseMessage) || "HTTP " + r.status,
    fullName: data.fullName || "",
    accountStatus: data.accountStatus || "",
    kycStatus: data.kycStatus || "",
    canReceive: data.canReceive === true,
    frozen: data.frozen === 1 || data.frozen === true
  };
}

/** 带 token 的调用，遇到 401 自动续期后重试一次 */
async function authed(pathname, body) {
  let r = await call(pathname, body);
  if (r.status === 401) {
    await renewToken();
    r = await call(pathname, body);
  }
  return r;
}

function transactionResult(r) {
  if (r.json && r.json.responseCode === 0 && r.json.data && Object.keys(r.json.data).length) {
    return { found: true, paid: true, tx: r.json.data, httpStatus: r.status };
  }
  return {
    found: false,
    paid: false,
    httpStatus: r.status,
    errorCode: r.json ? r.json.errorCode : null,
    reason: (r.json && r.json.responseMessage) || "HTTP " + r.status
  };
}

/** 申请 token：NBC 会向注册邮箱发送 20 位验证码（文档 1） */
async function requestToken(input) {
  const r = await call(
    "/v1/request_token",
    {
      email: String(input.email || "").trim(),
      organization: String(input.organization || "MB Cambodia").slice(0, 100),
      project: String(input.project || "MB Cambodia App").slice(0, 100)
    },
    { auth: false }
  );
  return { ok: Boolean(r.json && r.json.responseCode === 0), httpStatus: r.status, response: r.json || r.text };
}

/** 用邮箱收到的验证码换取 access token（文档 2） */
async function verifyCode(code) {
  const r = await call("/v1/verify", { code: String(code || "").trim() }, { auth: false });
  const newToken = r.json && r.json.data && r.json.data.token;
  if (newToken) token = newToken;
  return { ok: Boolean(newToken), token: newToken || null, httpStatus: r.status, response: r.json || r.text };
}

/** Bakong 账户域名 → 银行名（KHQR 报文里没有银行字段，只能按 @域名 反查） */
const BANK_DOMAINS = {
  acleda: { name: "ACLEDA Bank", short: "ACLEDA Plc." },
  aclb: { name: "ACLEDA Bank", short: "ACLEDA Plc." },
  acledabank: { name: "ACLEDA Bank", short: "ACLEDA Plc." },
  aba: { name: "ABA Bank", short: "Advanced Bank of Asia" },
  ababank: { name: "ABA Bank", short: "Advanced Bank of Asia" },
  abaa: { name: "ABA Bank", short: "Advanced Bank of Asia" },
  wing: { name: "Wing Bank", short: "Wing Bank (Cambodia) Plc." },
  pipay: { name: "PiPay", short: "PiPay Cambodia" },
  pipaykh: { name: "PiPay", short: "PiPay Cambodia" },
  ppcbank: { name: "PPCBank", short: "Phnom Penh Commercial Bank" },
  ppcb: { name: "PPCBank", short: "Phnom Penh Commercial Bank" },
  canadabank: { name: "Canadia Bank", short: "Canadia Bank Plc." },
  maybank: { name: "Maybank Cambodia", short: "Maybank (Cambodia) Plc." },
  ftb: { name: "FTB Bank", short: "Foreign Trade Bank of Cambodia" },
  cimb: { name: "CIMB Bank", short: "CIMB Bank Plc." },
  vattanac: { name: "Vattanac Bank", short: "Vattanac Bank" },
  sathapana: { name: "Sathapana Bank", short: "Sathapana Bank Plc." },
  hattha: { name: "Hattha Bank", short: "Hattha Bank Plc." },
  campubank: { name: "Campu Bank", short: "Cambodia Public Bank" },
  jtrust: { name: "J Trust Royal Bank", short: "J Trust Royal Bank" },
  phillip: { name: "Phillip Bank", short: "Phillip Bank Plc." },
  chipmong: { name: "Chip Mong Bank", short: "Chip Mong Commercial Bank" },
  firstbank: { name: "First Commercial Bank", short: "First Commercial Bank" },
  kbprasac: { name: "KB Prasac Bank", short: "KB Prasac Bank Plc." },
  devb: { name: "DEV Bank", short: "Bakong sandbox bank" },
  bakong: { name: "Bakong", short: "National Bank of Cambodia" }
};

function resolveBank(accountId) {
  const id = String(accountId || "").trim();
  if (!id.includes("@")) return { name: "Bakong member bank", short: "", code: "" };
  const domain = id.split("@").pop().toLowerCase();
  const hit = BANK_DOMAINS[domain];
  if (hit) return { name: hit.name, short: hit.short, code: domain };
  // 未收录的成员行：域名首字母大写兜底，避免空白
  const pretty = domain
    .replace(/[_-]+/g, " ")
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return { name: pretty + " Bank", short: "", code: domain };
}

/** 解析 KHQR 字符串，返回商户、金额、币种等；不是合法 KHQR 时返回 null */
function decodeKhqr(qr) {
  const decoded = BakongKHQR.decode(qr);
  if (!decoded || !decoded.data) return null;
  const d = decoded.data;
  if (decoded.status && decoded.status.code !== 0) return null;
  if (!d.bakongAccountID) return null;

  const currency = d.transactionCurrency === "116" ? "KHR" : "USD";
  const amount = d.transactionAmount ? Number(d.transactionAmount) : null;

  return {
    bakongAccountId: d.bakongAccountID,
    merchantId: d.merchantID || null,
    merchant: d.merchantName || "KHQR merchant",
    city: d.merchantCity || "",
    amount: isFinite(amount) ? amount : null,
    currency,
    billNumber: d.billNumber || null,
    expiresAt: d.expirationTimestamp ? Number(d.expirationTimestamp) : null,
    merchantType: d.merchantType,
    bank: resolveBank(d.bakongAccountID),
    crc: d.crc
  };
}

/** 生成本账户的收款 KHQR（动态码带金额 / 静态码不带金额） */
function createOwnQr(input) {
  if (!config.qrReady) {
    throw new Error("未配置 BAKONG_ACCOUNT_ID / MERCHANT_NAME，无法生成收款码");
  }
  const currency = input.currency === "KHR" ? "KHR" : "USD";
  const amount = input.amount === undefined || input.amount === null ? null : Number(input.amount);
  if (amount !== null && (!isFinite(amount) || amount <= 0)) throw new Error("金额无效");

  const optional = {
    currency: currency === "KHR" ? khqrData.currency.khr : khqrData.currency.usd,
    amount: amount === null ? undefined : amount,
    billNumber: input.billNumber || undefined,
    storeLabel: config.bakong.merchantName,
    terminalLabel: "MB Cambodia App",
    merchantCategoryCode: "5999"
  };
  if (amount !== null) {
    optional.expirationTimestamp = Date.now() + config.paymentTimeout * 1000;
  }

  const lib = new BakongKHQR();
  let response;
  if (config.bakong.merchantId && config.bakong.acquiringBank) {
    const info = new MerchantInfo(
      config.bakong.accountId,
      config.bakong.merchantName,
      config.bakong.merchantCity,
      Number(config.bakong.merchantId),
      config.bakong.acquiringBank,
      optional
    );
    response = lib.generateMerchant(info);
  } else {
    // 注意：SDK 实际签名是 (accountId, merchantName, merchantCity, optional)，
    // 币种放在 optional.currency 里（README 的示例是旧版写法，会丢字段）
    const info = new IndividualInfo(
      config.bakong.accountId,
      config.bakong.merchantName,
      config.bakong.merchantCity,
      optional
    );
    response = lib.generateIndividual(info);
  }

  if (!response || !response.data || !response.data.qr) {
    throw new Error("KHQR 生成失败：" + JSON.stringify(response && response.status));
  }
  return { qr: response.data.qr, md5: response.data.md5 || md5(response.data.qr), currency, amount };
}

/** 让付款方跳转到 Bakong App 完成支付（不是所有环境都开放，失败就返回 null） */
async function makeDeeplink(qr) {
  try {
    const r = await call(
      "/v1/generate_deeplink_by_qr",
      {
        qr,
        sourceInfo: config.publicBaseUrl
          ? {
              appIconUrl: config.publicBaseUrl + "/favicon.svg",
              appName: "MB Cambodia",
              appDeepLinkCallback: config.publicBaseUrl
            }
          : undefined
      },
      { auth: false }
    );
    if (r.json && r.json.responseCode === 0 && r.json.data) {
      return r.json.data.shortLink || r.json.data.deeplink || r.json.data.url || null;
    }
  } catch (err) {
    /* deeplink 是可选能力，失败不影响主流程 */
  }
  return null;
}

function info() {
  return {
    env: config.bakong.env,
    baseUrl: config.bakong.baseUrl,
    mode: config.paymentMode,
    accountId: config.bakong.accountId || null,
    accountConfigured: Boolean(config.bakong.accountId),
    tokenConfigured: Boolean(token),
    emailConfigured: Boolean(config.bakong.email),
    qrReady: config.qrReady,
    ready: Boolean(token && config.qrReady),
    apis: [
      "request_token",
      "verify",
      "renew_token",
      "generate_deeplink_by_qr",
      "check_transaction_by_md5",
      "check_transaction_by_hash",
      "check_transaction_by_short_hash",
      "check_bakong_account"
    ]
  };
}

module.exports = {
  md5,
  checkByMd5,
  checkByHash,
  checkByShortHash,
  checkAccount,
  requestToken,
  verifyCode,
  decodeKhqr,
  createOwnQr,
  makeDeeplink,
  renewToken,
  info
};
