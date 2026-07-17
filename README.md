# Desktop Pet

像素风桌面宠物 + Amazon 库存查询（Electron + Vite + TypeScript）。

支持角色：**菲比 / 咕嘎 / Doro / 糯糯**。

## 功能

- 透明无边框置顶桌宠：拖拽、切换角色、气泡台词
- 库存查询业务面板（统一 A / B / A+B 模式）
- 单并发 FIFO 多任务队列（SQLite 持久化）：可排队等待；暂停会阻塞后续任务；重启后自动恢复
- 缺货重点提示、结果筛选、缺货/失败清单复制
- 商品码转换（后台码 → ASIN）
- 查询过程与桌宠动画联动（busy / alert / 完成台词）

## 架构

业务逻辑在 Electron **主进程**（`src/main/services/`）。

```
宠物窗口 / 业务面板
    ↕ IPC
主进程 JobQueue + AmazonScraper (fetch + cheerio)
    → better-sqlite3
    → StockPetDataSource → 桌宠气泡/动画
```

## 开发

需要 Node.js 18+（CI 使用 Node.js 24）。

```bash
npm install               # postinstall 会按 Electron ABI 重建原生模块
npm run rebuild:native   # 手动重建 better-sqlite3（可选）
npm run dev
```

| 操作 | 效果 |
|------|------|
| 拖拽宠物 | 移动窗口 |
| 单击 | 弹跳 + 台词 |
| 双击 / 托盘「打开库存面板」 | 打开业务面板 |
| 右键 / 托盘 | 切换宠物、暂停/继续/取消、退出 |

## 本地打包

```bash
npm run build:mac   # macOS → dist/*.dmg / *.zip
npm run build:win   # Windows → dist/*.exe
```

`better-sqlite3` 已配置 `asarUnpack`。

## CI 打包（GitHub Actions）

推送到 `main`、打 `v*` 标签，或手动触发 workflow，会在：

- **macOS**：产出 `.dmg` / `.zip`
- **Windows**：产出 NSIS / portable `.exe`

产物上传为 Actions Artifact；打 `v*` 标签时会自动创建 GitHub Release 并附带安装包。

```bash
git tag v0.2.0
git push origin v0.2.0
```

## 环境变量（可选）

| 变量 | 默认 | 说明 |
|------|------|------|
| `AMAZON_REQUEST_INTERVAL` | `3.0` | 请求间隔（秒） |
| `AMAZON_REQUEST_JITTER` | `1.2` | 间隔抖动（秒） |
| `AMAZON_MAX_RETRIES` | `3` | 重试次数 |

Amazon JP 库存查询通过隐藏 Chromium 窗口做真实页面导航（Cookie / UA / 系统代理与浏览器一致）。请确保系统已开启可用的代理后再访问 Amazon JP。

## License

MIT
