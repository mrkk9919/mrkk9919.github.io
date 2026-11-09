"use strict";

const fs = require("fs");
const path = require("path");

function loadEnvFile() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || /^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")
    )) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadEnvFile();

const BAKONG_BASE = {
  production: "https://api-bakong.nbc.gov.kh",
  sit: "https://sit-api-bakong.nbc.gov.kh"
};

const env = (process.env.BAKONG_ENV || "production").toLowerCase();
const bakongToken = process.env.BAKONG_TOKEN || "";

const config = {
  port: Number(process.env.PORT || 8787),
  bakong: {
    env,
    baseUrl: BAKONG_BASE[env] || BAKONG_BASE.production,
    token: bakongToken,
    email: process.env.BAKONG_EMAIL || "",
    accountId: process.env.BAKONG_ACCOUNT_ID || "",
    merchantName: process.env.MERCHANT_NAME || "",
    merchantCity: process.env.MERCHANT_CITY || "Phnom Penh",
    merchantId: process.env.MERCHANT_ID || "",
    acquiringBank: process.env.ACQUIRING_BANK || "",
    proxy: process.env.BAKONG_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ""
  },
  paymentMode: (process.env.PAYMENT_MODE || (bakongToken ? "bakong" : "demo")).toLowerCase(),
  paymentTimeout: Number(process.env.PAYMENT_TIMEOUT || 180),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "",
  storageDir: path.join(__dirname, "data"),
  siteRoot: path.join(__dirname, ".."),
  sitePrefix: "/mb-cambodia-app-/"
};

config.qrReady = Boolean(config.bakong.accountId && config.bakong.merchantName);
config.bakongReady = Boolean(config.bakong.token && config.qrReady);

module.exports = config;
