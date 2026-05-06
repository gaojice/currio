# 📄 设计文档（PRD + 技术方案）

**项目名：Currio（网页自动货币转换器）**
版本：v1.0（MVP → 可上架）
日期：2026-05-07

---

## 1. 背景与目标

### 1.1 背景

跨境购物、阅读外文内容时，用户需要频繁进行心算或手动查询汇率，成本高、体验差。

### 1.2 目标（Success Criteria）

* **自动识别**网页中的货币金额并进行转换展示
* **默认智能化**：首次安装自动选择合理的目标币种
* **低干扰**：不破坏页面结构与交互
* **高性能**：对页面性能影响可控（<3% 额外开销）

### 1.3 非目标（v1 不做）

* 不做复杂金融分析
* 不提供交易功能
* 不保证金融级精度（仅信息参考）

---

## 2. 用户与场景

### 2.1 目标用户

* 海外购物用户（Amazon / eBay）
* 技术用户（浏览英文文档）
* 出海从业者

### 2.2 核心场景

```text
用户打开网页 → 自动识别 $100 → 显示 ≈ NT$3,200
```

---

## 3. 功能需求

### 3.1 货币识别（FR-1）

支持以下格式：

* 符号：`$100` `¥1000` `€50`
* 代码：`USD 100` `100 USD`
* 千分位：`$1,234.56`

#### 源货币推断（$ 符号消歧义）

`$` 被 USD / CAD / AUD / HKD / SGD 等数十种货币使用，必须推断源货币：

| 优先级 | 策略 | 示例 |
| ------ | ---- | ---- |
| 1 | 货币代码显式声明 | `USD 100` → 源货币 USD |
| 2 | 页面 `<html lang>` / TLD 推断 | `lang="en-CA"` + `$` → CAD |
| 3 | 符号唯一映射（无歧义符号） | `¥` → JPY（语境区分）、`€` → EUR |
| 4 | 默认假定 USD 并在转换结果标注 | `$100 (≈ NT$3,200, 按 USD)` |

#### 约束：

* 必须包含货币上下文（符号或代码）
* 避免误识别（版本号、普通数字）

#### 误识别排除规则：

* 不包含货币符号或代码的裸数字（如 `100`）
* 版本号模式：`v\d+\.\d+`、`\d+\.\d+\.\d+`
* 日期格式：`2024-01-01`、`01/01/2024`
* 电话号码、邮编（连续 5+ 位无分隔数字不含货币上下文）
* `<script>` `<style>` `<textarea>` `<input>` 节点内文本

---

### 3.2 汇率转换（FR-2）

* 支持主流货币（USD、TWD、CNY、JPY、EUR 等）
* 汇率数据来源（可选）：

  * ExchangeRate-API
  * Fixer
  * Open Exchange Rates

#### 缓存策略：

* TTL：30–60 分钟
* 本地缓存：`chrome.storage.local`

#### API 降级策略：

* 请求失败 → 使用过期缓存（如有），标注汇率时间戳 `(≈ NT$3,200, 1h前汇率)`
* 无缓存且请求失败 → 静默降级，不做转换，避免展示错误数据
* 连续失败 3 次 → 延长重试间隔至 2 小时，减少无效请求

---

### 3.3 显示策略（FR-3）

#### Inline（默认）

```text
$100 → $100 (≈ NT$3,200)
```

#### Tooltip（可选）

hover 显示转换值

---

### 3.4 用户设置（FR-4）

| 设置项  | 说明               |
| ---- | ---------------- |
| 目标货币 | 如 TWD / CNY      |
| 显示模式 | inline / tooltip |
| 自动启用 | 开 / 关            |
| 黑名单  | 不生效的网站           |

---

### 3.5 默认货币自动推断（FR-5 ⭐重点）

#### 触发时机：

* **仅首次安装时执行**

---

## 4. 默认货币推断设计（核心）

### 4.1 数据源优先级

```text
用户手动设置 > 浏览器语言 > 默认 USD
```

（v1 不引入 IP，避免隐私与权限复杂度）

---

### 4.2 输入数据

```js
navigator.languages
navigator.language
```

---

### 4.3 映射规则

```js
const localeCurrencyMap = {
  "zh-TW": "TWD",
  "zh-CN": "CNY",
  "zh-HK": "HKD",
  "zh-SG": "SGD",
  "en-US": "USD",
  "en-GB": "GBP",
  "en-CA": "CAD",
  "en-AU": "AUD",
  "en-SG": "SGD",
  "ja-JP": "JPY",
  "ko-KR": "KRW",
  "de-DE": "EUR",
  "fr-FR": "EUR",
}
```

---

### 4.4 推断算法（确定性）

```js
function detectDefaultCurrency() {
  const langs = navigator.languages || [navigator.language]

  for (const lang of langs) {
    // 1. 精确匹配（含地区）
    if (localeCurrencyMap[lang]) {
      return localeCurrencyMap[lang]
    }

    // 2. 基础语言匹配（仅当该语言有唯一合理映射时）
    const base = lang.split("-")[0]

    if (base === "ja") return "JPY"
    if (base === "ko") return "KRW"

    // zh / en 覆盖多个国家和地区，不做 base 匹配，继续遍历下一语言
  }

  // 3. fallback
  return "USD"
}
```

---

### 4.5 UX 要求

#### 首次安装：

弹提示：

```text
已根据浏览器语言设置为：TWD
[更改]
```

#### 后续：

* 不再自动修改
* 完全以用户设置为准

---

### 4.6 风险与对策

| 风险        | 对策     |
| --------- | ------ |
| 用户语言 ≠ 地区 | 提供修改入口 |
| 多语言浏览器    | 按优先顺序  |
| VPN 用户    | 不做强依赖  |

---

## 5. 系统架构

```text
Content Script
  ├─ DOM 扫描 (TreeWalker)
  ├─ 货币识别 (正则 + 源货币推断)
  ├─ 转换计算 (本地，使用缓存汇率)
  └─ 渲染 (插入 span 节点)

Background (Service Worker)
  ├─ 汇率获取 (fetch API)
  ├─ 缓存管理 (chrome.storage.local)
  └─ 消息路由

Popup UI
  └─ 用户设置

Storage
  └─ chrome.storage.local
```

### 5.1 消息协议

Content Script 与 Background 通过 `chrome.runtime.sendMessage` 通信：

```text
CS → BG: { type: "GET_RATES" }
BG → CS: { rates: { USD: 1, TWD: 32.5, ... }, timestamp: 1715000000 }

CS → BG: { type: "GET_SETTINGS" }
BG → CS: { targetCurrency: "TWD", displayMode: "inline", autoEnabled: true }
```

Content Script 启动时拉取一次汇率和设置，之后 Background 在汇率刷新后主动推送更新。

---

## 6. 关键技术设计

### 6.1 DOM 扫描

* 使用 `TreeWalker`
* 跳过：

  * script / style / textarea / input

---

### 6.2 动态页面支持

* `MutationObserver`
* debounce（300ms）
* 对高频变更（SPA、无限滚动）加入 throttle 上限（最多 1 次/500ms）

### 6.3 千分位/小数点歧义处理

`$1,234` 在 en-US 是 1234，在 de-DE 语境下 `$1.234` 也是 1234。策略：

* 优先取页面 `<html lang>` 判断 locale
* 无 lang 属性时，按英文规则（`,` 千分位、`.` 小数点）
* 同时匹配两种模式，取更合理的解析结果（如两种都命中则优先英文规则）

---

### 6.4 渲染策略

* 不修改原文本
* 插入 span 节点

```js
<span class="currio-converted">(≈ NT$3200)</span>
```

---

### 6.5 去重机制

* WeakSet 标记节点
* 或 data-attribute

---

## 7. 性能指标

| 指标       | 目标      |
| -------- | ------- |
| 首次扫描     | < 100ms |
| DOM 增量处理 | < 10ms  |
| 内存占用     | < 10MB  |

---

## 8. 权限设计（Manifest V3）

```json
{
  "manifest_version": 3,
  "name": "Currio",
  "permissions": ["storage"],
  "host_permissions": [
    "https://api.exchangerate-api.com/*"
  ],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"]
  }]
}
```

> 注：使用静态 `content_scripts` 声明无需 `scripting` 权限。保留 `storage` 用于汇率缓存和用户设置。

---

## 9. 安全与隐私

* 不收集用户数据
* 不上传浏览内容
* 汇率请求仅访问第三方 API

---

## 10. 边界与异常处理

### 10.1 误识别

* 必须带货币上下文

### 10.2 金融网站

默认黑名单：

* 交易所
* 银行

---

## 11. 发布策略（Chrome 商店）

### 11.1 Listing 优化

关键词：

* currency converter
* exchange rate
* auto convert money

---

### 11.2 初期增长策略

* Reddit（r/chrome_extensions）
* Product Hunt
* 技术社区

---

## 12. Roadmap

### v1（当前）

* 基础识别
* 默认货币推断
* Inline 显示

### v2

* IP 定位（可选）
* 加密货币（接入 CoinGecko）

### v3

* 历史汇率
* AI 识别上下文

---

## 13. 验收标准（Acceptance Criteria）

* ✅ 能正确识别 $100 → 转换
* ✅ 首次安装自动设置货币
* ✅ 用户修改后不被覆盖
* ✅ 页面不卡顿
* ✅ 不破坏布局

---

## 14. 关键结论（务实）

这个项目成功的关键不在“能不能转换”，而在：

1. **默认是否聪明（FR-5）**
2. **是否不打扰网页**
3. **误识别率是否足够低**

---

