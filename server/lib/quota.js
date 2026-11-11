"use strict";

/**
 * Bakong 查询额度预算（本地侧）。
 *
 * 背景：NBC Bakong Open API 对每个 source（开发者 token / 出口 IP）有
 * “每天 100 次”的硬限制（实测报错 errorCode 19：
 * "Daily request limit of 100 exceeded for this source."）。
 * 一旦超了，当天的 check_transaction_by_md5 全部失败，前端就会永远停在
 * “等待到账”，看起来像「支付不成功」，其实钱可能已经付了。
 *
 * 因此这里在本地记账：额度有限的接口（generate_deeplink_by_qr /
 * check_transaction_*）每次真实调用前先扣一次预算，用完就不再打 Bakong，
 * 直接把“额度已用完”告诉前端，避免把额度浪费在反复轮询上。
 *
 * 计数落在 store 的状态里（Postgres 已接入时会持久化，重启不丢）。
 */

const config = require("../config");
const store = require("./store");

const DAILY_LIMIT = Math.max(1, Number(process.env.BAKONG_DAILY_LIMIT || 90));
/** Bakong 按柬埔寨时间（UTC+7）刷新每日配额 */
const TZ_OFFSET_MS = 7 * 3600 * 1000;

function dayKey(atMs) {
  const at = Number(atMs) || Date.now();
  return new Date(at + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function nextResetMs(nowMs) {
  const now = Number(nowMs) || Date.now();
  const shifted = now + TZ_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / 86400000) * 86400000;
  return dayStartShifted + 86400000 - TZ_OFFSET_MS;
}

function read() {
  const raw = typeof store.getQuota === "function" ? store.getQuota() : {};
  const day = dayKey();
  if (!raw || raw.day !== day) {
    return { day, used: 0, exhaustedAt: 0, errorCode: null, message: null };
  }
  return {
    day,
    used: Number(raw.used) || 0,
    exhaustedAt: Number(raw.exhaustedAt) || 0,
    errorCode: raw.errorCode === undefined ? null : raw.errorCode,
    message: raw.message || null
  };
}

function write(patch) {
  if (typeof store.setQuota !== "function") return read();
  const next = Object.assign(read(), patch);
  store.setQuota(next);
  return next;
}

function limit() {
  return DAILY_LIMIT;
}

/** 还能不能打一次 Bakong 的额度接口 */
function canSpend(count) {
  const q = read();
  if (q.exhaustedAt) return false;
  return q.used + (Number(count) || 1) <= DAILY_LIMIT;
}

/** 调用前扣预算（先扣后打，保证不会超过上限） */
function spend(count) {
  const q = read();
  return write({ used: q.used + (Number(count) || 1) });
}

/** Bakong 自己回了 errorCode 19（额度真的用完了），当天不再重试 */
function exhaust(message, errorCode) {
  const q = read();
  return write({
    exhaustedAt: Date.now(),
    errorCode: errorCode === undefined ? 19 : errorCode,
    message: String(message || "Daily request limit exceeded"),
    used: Math.max(q.used, DAILY_LIMIT)
  });
}

function snapshot() {
  const q = read();
  const remaining = q.exhaustedAt ? 0 : Math.max(0, DAILY_LIMIT - q.used);
  return {
    day: q.day,
    limit: DAILY_LIMIT,
    used: Math.min(q.used, DAILY_LIMIT),
    remaining,
    exhausted: Boolean(q.exhaustedAt) || remaining <= 0,
    resetAt: nextResetMs(),
    message: q.message,
    tz: "Asia/Phnom_Penh (UTC+7)"
  };
}

module.exports = { limit, canSpend, spend, exhaust, snapshot, dayKey, nextResetMs };
