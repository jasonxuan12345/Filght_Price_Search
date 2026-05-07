# Flight Value Advisor

一个面向“厦门 ⇄ 伦敦”这类国际机票比价的本地工具。它不会硬抓 Google Flights 或航司官网页面，而是：

- 可选接入 SerpApi 的 Google Flights/Travel Explore 结构化结果。
- 接入携程 `lowestPrice` 低价日历接口；接口有返回时直接显示人民币最低价。
- 生成 Google Flights、Trip.com、携程、南航官网的复核入口。
- 在没有 API key 时，可开启自动遍历模式，逐个访问公开页面并记录静态 HTML 中的候选价格文本，但不会把这些未验证数字当作真实报价。
- 对低价、南航优先、晚间离境、中转城市、伦敦机场、分开出票风险进行评分。
- 使用实时 USD/CNY 汇率换算人民币；汇率接口不可用时使用 fallback。
- 没有 API key 时使用参考班次和策略规则，适合先做决策框架；真实票价请通过结果里的 OTA/航司链接复核。

## 运行

```powershell
npm start
```

打开：

```text
http://localhost:8787
```

命令行输出 JSON：

```powershell
npm run scan
```

开启自动遍历 1 天样例：

```powershell
Invoke-RestMethod "http://localhost:8787/api/analyze?crawl=true&crawlDays=1"
```

## 接入 Google Flights 数据

Google Flights 没有官方公开 API。工具支持通过 SerpApi 的 `google_travel_explore` 接口获取结构化结果。

```powershell
$env:SERPAPI_KEY="你的 key"
npm start
```

也可以复制 `.env.example` 作为本地配置参考。

为避免一次扫完整日期范围消耗过多额度，默认通过 `SERPAPI_MAX_QUERIES=2` 限制每次分析最多执行 2 次 SerpApi 查询。需要覆盖更多日期/机场时，可以临时调高环境变量，或在请求里追加 `serpApiMaxQueries=10`。

## 携程低价日历

工具会自动调用携程公开低价日历接口：

```text
https://flights.ctrip.com/itinerary/api/12808/lowestPrice
```

对接口支持的航线，会优先读取 `Roundtrip` 返回的指定去程/返程日期最低价；如果没有往返价，会尝试用去程和回程两个 `Oneway` 最低价相加。该价格是日期维度低价日历，不绑定具体航班、舱位、行李、税费和退改规则，下单前仍需打开携程复核。

## 文档

- [API](docs/API.md)
- [Data Sources](docs/DATA_SOURCES.md)
- [Scoring Model](docs/SCORING.md)

## 设计取舍

航司官网多数没有稳定公开票价 API。第一版不做脆弱网页爬取，而是把南航官网作为最终复核与出票渠道。后续可以增加：

- Amadeus/Sabre/Travelport 等 GDS API 适配器。
- 携程/Trip.com 手工导出的 CSV 导入。
- 价格监控和每日自动提醒。
- 更细的票规解析：行李、退改、是否同票号、是否机场换乘。

## 关于自动遍历

Google Flights、Trip.com、携程、航司官网经常使用动态渲染、验证码、反爬和会话定价。无 API key 时，工具会尽力访问公开页面并解析明显价格文本，但不会伪造登录、绕过验证码或承诺每次都能抓到价格。抓不到时，结果会标记为 `dynamic-or-blocked` 或 `no-price-found`，并保留可点击复核链接。

静态 HTML 中出现的数字不一定绑定到当前航班、日期、舱位、税费或库存。为了避免假价格，工具只会把它们放在 `crawlFindings` 诊断信息里；只有 SerpApi 等结构化来源返回的价格才会进入航班卡片的 `priceUsd` / `priceCny` 字段。
