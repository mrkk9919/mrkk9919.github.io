"use strict";

/**
 * Postgres 持久化层（可选）。
 *
 * 配置 DATABASE_URL 后，账户 / 支付单 / 流水都存到数据库，Render 这类
 * 临时磁盘的托管环境重启或重新部署都不会丢数据；没有配置时 store.js 自动
 * 退回原来的 JSON 文件存储，本地开发无需装数据库。
 */

const { Pool } = require("pg");

const CONNECTION_STRING = String(process.env.DATABASE_URL || "").trim();
const STATE_ID = "main";

let pool = null;
let ready = false;

function enabled() {
  return Boolean(CONNECTION_STRING);
}

// Render 的外部连接串强制 TLS；内网短主机名（dpg-xxxx-a）不需要。
// sslmode 显式要求 TLS 时也照办，避免静默降级成明文。
function needsSsl(conn) {
  if (/sslmode=(require|verify-ca|verify-full|no-verify)/.test(conn)) return true;
  return /\.render\.com(:\d+)?\//.test(conn);
}

function getPool() {
  if (!enabled()) return null;
  if (pool) return pool;
  pool = new Pool({
    connectionString: CONNECTION_STRING,
    ssl: needsSsl(CONNECTION_STRING) ? { rejectUnauthorized: false } : false,
    max: Number(process.env.DB_POOL_MAX || 5),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  return pool;
}

async function init() {
  const p = getPool();
  if (!p) return { ok: false, reason: "DATABASE_URL 未配置" };
  try {
    await p.query(
      "create table if not exists app_state (" +
        "id text primary key, " +
        "data jsonb not null, " +
        "updated_at timestamptz not null default now())"
    );
    ready = true;
    return { ok: true };
  } catch (err) {
    ready = false;
    return { ok: false, reason: String(err.message || err) };
  }
}

async function loadState() {
  if (!ready) return null;
  const r = await getPool().query("select data from app_state where id = $1", [STATE_ID]);
  return r.rows.length ? r.rows[0].data : null;
}

async function saveState(data) {
  if (!ready) return;
  await getPool().query(
    "insert into app_state (id, data, updated_at) values ($1, $2::jsonb, now()) " +
      "on conflict (id) do update set data = excluded.data, updated_at = now()",
    [STATE_ID, JSON.stringify(data)]
  );
}

function status() {
  if (ready) return "postgres";
  return enabled() ? "file (postgres unavailable)" : "file";
}

async function close() {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
  ready = false;
}

module.exports = { enabled, init, loadState, saveState, status, close };
