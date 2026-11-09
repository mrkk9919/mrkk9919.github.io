"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

const FILE = path.join(config.storageDir, "state.json");

const SEED = {
  accounts: [
    { id: "2118997861", label: "USD · Current", currency: "USD", balance: 17600.89 },
    { id: "1624454845", label: "KHR · Savings", currency: "KHR", balance: 4120000 }
  ],
  payments: {},
  transfers: []
};

let state = null;

function ensureDir() {
  if (!fs.existsSync(config.storageDir)) fs.mkdirSync(config.storageDir, { recursive: true });
}

function load() {
  if (state) return state;
  ensureDir();
  if (fs.existsSync(FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch (err) {
      // 损坏时保留坏文件，避免静默丢数据
      const bad = FILE + ".corrupt-" + Date.now();
      fs.renameSync(FILE, bad);
      state = null;
    }
  }
  if (!state) {
    state = JSON.parse(JSON.stringify(SEED));
    persist();
  }
  if (!state.accounts) state.accounts = JSON.parse(JSON.stringify(SEED.accounts));
  if (!state.payments) state.payments = {};
  if (!state.transfers) state.transfers = [];
  return state;
}

function persist() {
  ensureDir();
  const tmp = path.join(config.storageDir, ".state." + process.pid + ".tmp");
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE); // 原子替换，避免半截文件
}

function newRef(prefix) {
  const t = Date.now().toString(36).toUpperCase().slice(-6);
  const r = crypto.randomBytes(2).toString("hex").toUpperCase();
  return (prefix || "MB") + t + r;
}

/* ---------- payments ---------- */

function createPayment(data) {
  const st = load();
  const id = crypto.randomBytes(9).toString("hex");
  const now = Date.now();
  const payment = Object.assign(
    {
      id,
      ref: newRef("MB"),
      status: "pending",
      createdAt: now,
      expiresAt: now + config.paymentTimeout * 1000,
      tx: null,
      demo: config.paymentMode === "demo"
    },
    data
  );
  st.payments[id] = payment;
  prunePayments(st);
  persist();
  return payment;
}

function getPayment(id) {
  const st = load();
  return st.payments[id] || null;
}

function updatePayment(id, patch) {
  const st = load();
  if (!st.payments[id]) return null;
  Object.assign(st.payments[id], patch);
  persist();
  return st.payments[id];
}

// 只保留最近 200 条，避免 state.json 无限增长
function prunePayments(st) {
  const ids = Object.keys(st.payments);
  if (ids.length <= 200) return;
  ids
    .sort((a, b) => st.payments[a].createdAt - st.payments[b].createdAt)
    .slice(0, ids.length - 200)
    .forEach((id) => delete st.payments[id]);
}

/* ---------- internal ledger ---------- */

function listAccounts() {
  return load().accounts.map((a) => Object.assign({}, a));
}

function createAccount({ name, type, currency, balance }) {
  const st = load();
  const cur = String(currency || "").toUpperCase();
  if (cur !== "USD" && cur !== "KHR") {
    return { ok: false, code: "BAD_CURRENCY", message: "币种仅支持 USD / KHR" };
  }
  const kind = String(type || "Payment");
  if (kind !== "Payment" && kind !== "Savings") {
    return { ok: false, code: "BAD_TYPE", message: "账户类型仅支持 Payment / Savings" };
  }
  const bal = balance === "" || balance === undefined || balance === null ? 0 : Number(balance);
  if (!Number.isFinite(bal) || bal < 0) {
    return { ok: false, code: "BAD_BALANCE", message: "初始余额不合法" };
  }
  let id;
  do {
    id = "000" + String(Math.floor(100000000 + Math.random() * 899999999));
  } while (st.accounts.some((a) => a.id === id));

  const account = {
    id,
    label: cur + " · " + kind,
    currency: cur,
    balance: round(bal, cur)
  };
  if (name) account.name = String(name).slice(0, 40);
  st.accounts.push(account);
  persist();
  return { ok: true, account, accounts: listAccounts() };
}

function getAccount(id) {
  return load().accounts.find((a) => a.id === id) || null;
}

function transfer({ from, to, amount, note }) {
  const st = load();
  const src = st.accounts.find((a) => a.id === from);
  const dst = st.accounts.find((a) => a.id === to);

  if (!src || !dst) return { ok: false, code: "ACCOUNT_NOT_FOUND", message: "账户不存在" };
  if (src.id === dst.id) return { ok: false, code: "SAME_ACCOUNT", message: "转出与转入账户不能相同" };
  if (src.currency !== dst.currency) {
    return { ok: false, code: "CURRENCY_MISMATCH", message: "两个账户币种不同，内部转账仅支持同币种" };
  }

  const value = Number(amount);
  const scale = src.currency === "KHR" ? 1 : 0.01;
  if (!isFinite(value) || value <= 0) {
    return { ok: false, code: "INVALID_AMOUNT", message: "金额必须大于 0" };
  }
  if (Math.abs(value / scale - Math.round(value / scale)) > 1e-9) {
    return { ok: false, code: "INVALID_PRECISION", message: "金额精度超出该币种允许范围" };
  }
  if (src.balance < value) {
    return { ok: false, code: "INSUFFICIENT_FUNDS", message: "余额不足" };
  }

  src.balance = round(src.balance - value, src.currency);
  dst.balance = round(dst.balance + value, dst.currency);

  const record = {
    ref: newRef("TR"),
    from,
    to,
    amount: value,
    currency: src.currency,
    note: String(note || "").slice(0, 120),
    status: "completed",
    createdAt: Date.now()
  };
  st.transfers.unshift(record);
  if (st.transfers.length > 200) st.transfers.length = 200;
  persist();

  return {
    ok: true,
    transfer: record,
    accounts: st.accounts.map((a) => Object.assign({}, a))
  };
}

function listTransfers(accountId) {
  const all = load().transfers;
  if (!accountId) return all.slice(0, 30);
  return all.filter((t) => t.from === accountId || t.to === accountId).slice(0, 30);
}

/* ---------- external KHQR / Bakong payment ledger ---------- */

const USD_KHR_RATE = 4083;

function convert(amount, from, to) {
  if (from === to) return amount;
  return from === "KHR" ? amount / USD_KHR_RATE : amount * USD_KHR_RATE;
}

/**
 * 扫码支付（外部 KHQR / Bakong）成功后写入账户流水，并从付款账户扣减余额。
 * 这样账户明细（Detail Account）里就能查到这笔交易。
 */
function recordExternalPayment({ accountId, amount, currency, merchant, merchantId, note, ref, externalRef, bank }) {
  const st = load();
  const src = st.accounts.find((a) => a.id === accountId);
  const value = Number(amount);
  if (!src || !isFinite(value) || value <= 0) {
    return { ok: false, code: "BAD_PAYMENT", message: "付款账户或金额无效" };
  }
  const existing = ref && st.transfers.find((t) => t.external && t.ref === ref);
  if (existing) return { ok: true, record: existing, account: Object.assign({}, src), duplicate: true };
  const debit = round(convert(value, currency || src.currency, src.currency), src.currency);
  if (src.balance < debit) {
    return { ok: false, code: "INSUFFICIENT_FUNDS", message: "余额不足" };
  }

  src.balance = round(src.balance - debit, src.currency);
  const record = {
    ref: ref || newRef("QR"),
    from: src.id,
    to: String(merchant || "KHQR merchant").slice(0, 60),
    merchantId: merchantId ? String(merchantId).slice(0, 40) : null,
    amount: debit,
    currency: src.currency,
    note: String(note || "").slice(0, 120),
    externalRef: externalRef ? String(externalRef).slice(0, 120) : null,
    bank: (bank && bank.name) || null,
    external: true,
    status: "completed",
    balanceAfter: src.balance,
    createdAt: Date.now()
  };
  st.transfers.unshift(record);
  if (st.transfers.length > 200) st.transfers.length = 200;
  persist();

  return { ok: true, record, account: Object.assign({}, src) };
}

function round(n, currency) {
  return currency === "KHR" ? Math.round(n) : Math.round(n * 100) / 100;
}

module.exports = {
  load,
  persist,
  newRef,
  createPayment,
  getPayment,
  updatePayment,
  listAccounts,
  createAccount,
  getAccount,
  transfer,
  listTransfers,
  recordExternalPayment
};
