# Desktop Pet

像素风桌面宠物 + Amazon 库存查询（Electron + Vite + TypeScript）。

支持角色：**菲比 / 咕嘎 / Doro / 糯糯**。

## 功能

- 透明无边框置顶桌宠：拖拽、切换角色、气泡台词
- 库存查询业务面板（统一 A / B / A+B 模式）
- 单任务队列：暂停 / 继续 / 取消 / 删除历史
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

需要 Node.js 18+。

```bash
npm install
npm run rebuild:native   # better-sqlite3 适配 Electron
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
git tag v0.1.0
git push origin v0.1.0
```

## 环境变量（可选）

| 变量 | 默认 | 说明 |
|------|------|------|
| `AMAZON_REQUEST_INTERVAL` | `1.8` | 请求间隔（秒） |
| `AMAZON_REQUEST_JITTER` | `0.8` | 间隔抖动（秒） |
| `AMAZON_MAX_RETRIES` | `3` | 重试次数 |
| `HTTP_PROXY` / `HTTPS_PROXY` | — | Amazon 请求代理（应用会显式读取） |
| `NO_PROXY` | — | 无需代理的主机 |

Amazon JP 通常需要代理，请在**启动桌宠前**设置环境变量：

```bash
# macOS / Linux
HTTPS_PROXY=http://127.0.0.1:7890 npm run dev

# Windows CMD
set HTTPS_PROXY=http://127.0.0.1:7890
npm run dev
```

## License

MIT
