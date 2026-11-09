# Bakong Open API 支持服务

本项目把柬埔寨国家银行（NBC）的 **Bakong Open API** 接成了一个可独立部署的支撑服务，供 MB Cambodia 演示应用调用。浏览器端不会持有 token，所有需要鉴权的请求都由 Node 服务转发。

- 官方文档：<https://api-bakong.nbc.gov.kh/document>
- 生产环境：`https://api-bakong.nbc.gov.kh`
- 测试环境（SIT）：`https://sit-api-bakong.nbc.org.kh`

## 已接入的官方接口

| 官方接口 | 用途 | 本服务封装 |
|---|---|---|
| `POST /v1/request_token` | 用邮箱注册开发者、发送 20 位验证码 | `bakong.requestToken()` |
| `POST /v1/verify` | 用验证码换取 access token（90 天有效） | `bakong.verifyCode()` |
| `POST /v1/renew_token` | token 过期前用邮箱续期 | `bakong.renewToken()`，401 时也会自动续期重试一次 |
| `POST /v1/generate_deeplink_by_qr` | 把 KHQR 转成可唤起 Bakong App 的短链 | `bakong.makeDeeplink()` |
| `POST /v1/check_transaction_by_md5` | 用 KHQR 的 md5 查这笔码是否已支付 | `bakong.checkByMd5()` |
| `POST /v1/check_transaction_by_hash` | 用完整交易 hash 查交易 | `bakong.checkByHash()` |
| `POST /v1/check_transaction_by_short_hash` | 用 8 位短 hash + 金额币种查交易 | `bakong.checkByShortHash()` |
| `POST /v1/check_bakong_account` | 校验 Bakong 账户是否存在（`responseCode: 0` 表示存在） | `bakong.checkAccount()` |

## 本服务对外的 REST 接口

所有接口都在 `/api` 前缀下，默认端口 `8787`，已开启 CORS，浏览器/静态站可跨域调用。

| 方法 | 路径 | 请求体 | 说明 |
|---|---|---|---|
| GET | `/api/bakong/status` | – | 返回环境、baseUrl、token 是否配置、已接入的官方接口列表 |
| POST | `/api/bakong/token/request` | `{email, organization, project}` | 触发 NBC 往邮箱发验证码 |
| POST | `/api/bakong/token/verify` | `{code}` | 用 20 位验证码换 token（仅内存保存） |
| POST | `/api/bakong/token/renew` | `{}` | 用 `BAKONG_EMAIL` 续期 token |
| POST | `/api/bakong/check-account` | `{accountId}` | 校验 `xxx@bank` 账户是否存在 |
| POST | `/api/bakong/transaction` | `{md5}` 或 `{hash}` 或 `{shortHash, amount, currency}` | 查询交易，返回 `PAID` / `UNPAID` |
| POST | `/api/bakong/deeplink` | `{qr}` | 生成 Bakong App 唤起短链 |
| GET | `/api/health` | – | 服务与 Bakong 配置总览（原有接口，已保留） |

返回示例（查询到交易）：

```json
{
  "ok": true,
  "status": "PAID",
  "found": true,
  "paid": true,
  "tx": {
    "hash": "8465d722d7d5065f2886f0a474a4d34dc6a7855355b6118367b6111228893e9",
    "fromAccountId": "rieh_dhqj_1984@devb",
    "toAccountId": "bridge_account@devb",
    "currency": "USD",
    "amount": 1.0,
    "description": "testing bakong generator"
  }
}
```

未配置 token 时，需要鉴权的接口统一返回：

```json
{ "error": "BAKONG_TOKEN 未配置", "code": "BAKONG_TOKEN_MISSING" }
```

## 配置步骤

1. 在 <https://bakong.nbc.gov.kh> 注册开发者账号。
2. 复制 `server/.env.example` 为 `server/.env`，填写：

```ini
BAKONG_ENV=production
BAKONG_EMAIL=你的注册邮箱
BAKONG_ACCOUNT_ID=123456789@aclb
MERCHANT_NAME=SOKHA CHAN
MERCHANT_CITY=Phnom Penh
PAYMENT_MODE=bakong
```

3. 申请 token（二选一）：

   - 服务已启动时调用：
     ```bash
     curl -X POST http://127.0.0.1:8787/api/bakong/token/request \
       -H "Content-Type: application/json" \
       -d '{"email":"you@example.com","organization":"MB Cambodia","project":"MB Cambodia App"}'
     ```
     收到邮件里的 20 位验证码后：
     ```bash
     curl -X POST http://127.0.0.1:8787/api/bakong/token/verify \
       -H "Content-Type: application/json" \
       -d '{"code":"20位验证码"}'
     ```
   - 或直接在 Bakong 开发者后台拿到 token，写入 `BAKONG_TOKEN`。

4. 启动服务：

```bash
cd server
npm install
npm start          # http://127.0.0.1:8787
```

5. 验证：

```bash
curl http://127.0.0.1:8787/api/bakong/status
curl -X POST http://127.0.0.1:8787/api/bakong/check-account \
  -H "Content-Type: application/json" -d '{"accountId":"sokha@wing"}'
```

## 前端调用

`bakong-service.js` 已随 `index.html` 加载，全局暴露：

```js
window.mbBakong.status()                       // 当前是否已连上支持服务
window.mbBakong.refresh()                      // 重新探测
window.mbBakong.checkAccount("sokha@wing")     // 校验 Bakong 账户
window.mbBakong.transaction({ md5: "..." })    // 查交易，支持 hash / shortHash
window.mbBakong.deeplink(qrString)            // 生成 Bakong App 短链
```

服务连通状态变化时会派发 `mb:bakong-status` 事件。

**静态站注意**：GitHub Pages 只能托管静态文件，跑不了 Node 服务。要启用真实 Bakong 能力，把 `server/` 部署到任意 Node 主机（VPS / Render / Railway 等），然后在 `index.html` 加载脚本前加一行，把 API 指过去：

```html
<script>window.MB_API_BASE = "https://your-api.example.com/api";</script>
```

未设置时默认请求同源 `/api`，静态站上会探测失败并自动降级为纯演示模式，不影响现有页面。

## 安全约定

- `BAKONG_TOKEN` 只存在服务端内存/环境变量里，不下发浏览器，不写进前端代码。
- `/api/bakong/token/request` 会真的向 NBC 申请注册邮件，生产环境建议加内网或管理鉴权后再开放。
- 支付是否成功以 Bakong 返回的 `responseCode === 0` 且 `data` 非空为准；`errorCode` 仅用于排查（1 找不到交易、2 不支持静态码、3 交易失败、6 未授权等）。
- 静态码（无金额）不能直接用于交易校验，需要付款方输入金额后再查。
