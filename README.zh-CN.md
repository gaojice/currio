![Currio](assets/screen.png)

**Currio** — 一个静默的 Chrome 扩展，自动把网页上的所有货币金额转换为你熟悉的币种，页面加载即完成。

> 做这个扩展是因为不想再手动算人民币等于几块新台币。

## 工作原理

```
访问 amazon.com → $1,299 → ¥9,429
```

无需点击，不用复制粘贴，不用开新标签。转换结果紧跟在原价旁边，需要时自然看到，不需要时几乎注意不到。

## 功能

- **自动识别** — 支持 `$100`、`¥1000`、`€50`、`£30`、`₩50000`、`USD 100`、`100 USD`、`NT$690`、`HK$100` 等格式
- **智能推断** — `$` 可映射到 6 种以上货币，通过页面 locale、浏览器语言、域名后缀、显式货币代码来准确判断
- **汇率常新** — 45 分钟缓存 TTL，失败指数退避，过期缓存兜底
- **React 友好** — 通过 CSS `::after` 伪元素渲染（不修改 DOM），SPA 页面不会冲突
- **零配置** — 首次安装自动根据浏览器语言识别目标货币
- **网站黑名单** — 一键屏蔽指定域名
- **隐私优先** — 不追踪、不收集数据，仅请求 ExchangeRate-API 获取汇率
- **轻量** — 解压后约 50KB，页面开销 < 3%，内存占用 < 10MB

## 安装

### Chrome 网上应用店

*（即将上架）*

### 手动安装（开发者模式）

```bash
git clone https://github.com/gaojice/currio.git
```

1. 打开 `chrome://extensions`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序** → 选择 `currio` 文件夹

## 使用

| 操作 | 方法 |
|------|------|
| 切换目标货币 | 点击扩展图标 → 选择币种 |
| 禁用当前网站 | 点击扩展图标 → **添加到黑名单** |
| 强制重新扫描 | 点击扩展图标 → **重新扫描** |

## 架构

```
content.js (DOM 扫描器)
  ├── TreeWalker + MutationObserver
  ├── 多模式正则匹配
  ├── 语言环境感知源推断
  └── CSS data-attribute 渲染

background.js (Service Worker)
  ├── 汇率获取
  ├── 45 分钟缓存
  └── 消息路由（设置 + 汇率）

popup.js (浏览器动作)
  ├── 币种选择器
  └── 网站黑名单管理
```

## 支持的货币

| 符号 | 解析为 |
|------|--------|
| `$` | USD · CAD · AUD · HKD · SGD · TWD |
| `¥` / `￥` / `元` | JPY · CNY |
| `€` | EUR |
| `£` | GBP |
| `₩` | KRW |
| 多字符 | NT$ · HK$ · AU$ · CA$ · S$ · US$ |
| 货币代码 | USD · EUR · GBP · JPY · CNY · TWD · KRW · AUD · CAD · HKD · SGD |

## 隐私

Currio **不读取任何个人数据**。唯一的对外请求是向 `api.exchangerate-api.com` 获取汇率。不收集浏览历史，无分析统计，无遥测上报。

## 路线图

- [ ] Chrome 网上应用店上架
- [ ] 加密货币支持（BTC、ETH，接入 CoinGecko）
- [ ] 可选 IP 定位确定默认货币
- [ ] 悬停显示历史汇率走势

## 许可证

MIT

---

<div align="center">
  <sub>
    纯原生 JS 构建 · Manifest V3 · 汇率数据来自 <a href="https://exchangerate-api.com">ExchangeRate-API</a>
  </sub>
</div>

## 赞赏

如果 Currio 对你有帮助，可以考虑请我喝杯咖啡 ☕

<img src="assets/support.jpg" width="200" alt="赞赏码">
