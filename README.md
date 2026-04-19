# 大坝 IP PureCheck v1.1.0

> 大坝 IP 纯净度检测平台 — 全面检测 IP 质量、纯净度与安全隐私风险

## 功能特性

- **IP 纯净度评分** — 0-100 分动画环形图，综合评估 IP 质量
- **IP 类型分类** — 住宅 IP / 数据中心 / 移动网络 / 代理 自动判定
- **WebRTC 泄露检测** — 多 STUN 服务器并发检测，自动对比出口 IP
- **DNS 泄露检测** — DoH 可达性测试 + HTTP 出口 IP 一致性对比
- **IPv6 泄露检测** — 双栈检测，防止 IPv6 旁路泄露
- **AI 服务可达性** — Claude / ChatGPT / Gemini / Copilot 一键批量检测
- **浏览器指纹一致性** — 时区、语言与 IP 地理位置匹配分析
- **中英文双语** — 自动识别浏览器语言，一键切换
- **暗黑科技风 UI** — 发光效果、扫描线、渐变动画
- **术语帮助面板** — 详细解释每个检测指标的含义与检测原理
- **SEO 优化** — JSON-LD 结构化数据、语义化 HTML、Sitemap
- **Google AdSense** — 自动广告集成
- **响应式设计** — 桌面 / 平板 / 手机自适应

## 技术栈

| 层级 | 技术 |
|------|------|
| Frontend | 原生 HTML + CSS + Alpine.js (无构建依赖) |
| Backend | Cloudflare Pages Functions (TypeScript) |
| API 数据源 | ip-api.com + ipwho.is (双重 fallback) |
| 部署 | Cloudflare Pages (全球 CDN) |

## 项目结构

```
├── public/                  # 静态文件
│   ├── index.html           # 主页面
│   ├── css/theme.css        # 暗黑科技主题
│   ├── js/
│   │   ├── app.js           # Alpine.js 主逻辑
│   │   ├── i18n.js          # 中英文翻译
│   │   └── webrtc.js        # WebRTC 泄露检测
│   ├── robots.txt           # 搜索引擎爬虫规则
│   └── sitemap.xml          # 站点地图
├── functions/api/
│   └── check.ts             # IP 聚合查询 API
├── wrangler.toml            # Cloudflare Pages 配置
└── package.json
```

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发
npm run dev
# 打开 http://localhost:8788

# 部署到 Cloudflare Pages
npm run deploy
```

## 部署方式

### 方式一：CLI 部署（推荐）

```bash
# 1. 登录 Cloudflare
npx wrangler login

# 2. 创建 Pages 项目（首次）
npx wrangler pages project create daba-ip-purecheck

# 3. 部署
npm run deploy
```

### 方式二：GitHub 连接部署

1. 将代码推送到 GitHub 仓库
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create a project
3. 连接 GitHub 仓库
4. 构建设置：
   - **Build command:** 留空（无需构建）
   - **Build output directory:** `public`
   - **Root directory:** `/`
5. 点击 Save and Deploy

部署完成后，绑定自定义域名即可。

## API 说明

### GET /api/check

查询 IP 信息与纯净度评分。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| `ip` | string | 可选，不传则自动检测当前出口 IP |

**返回示例：**
```json
{
  "ip": "1.2.3.4",
  "basic": {
    "country": "United States",
    "countryCode": "US",
    "region": "California",
    "city": "Los Angeles",
    "timezone": "America/Los_Angeles",
    "isp": "AT&T Services",
    "org": "AT&T Services",
    "as": "AS7018 AT&T Services"
  },
  "purity": {
    "score": 100,
    "ipType": "residential",
    "isProxy": false,
    "isHosting": false,
    "isMobile": false,
    "riskLevel": "low",
    "penalties": []
  }
}
```

## 纯净度评分规则

| 因素 | 扣分 | 说明 |
|------|------|------|
| 基础分 | 100 | 住宅 IP 起步 |
| 代理检测 | -35 | IP 被标记为代理/VPN |
| 数据中心 | -30 | IP 属于云服务商 |
| 移动网络 | -5 | 轻微扣分 |

## License

MIT
