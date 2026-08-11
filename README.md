# 业余无线电A类模拟考试（HAM Exam）

面向业余无线电爱好者（HAM）的 A 类操作技术能力验证模拟考试 Web 应用。
纯前端 + 离线可用，支持手机安装为 PWA 应用。

**在线体验：** https://bjdr69.github.io/ham-exam/

## 📚 题库来源

本题库来源于**中国无线电协会业余无线电分会（CRAC）**官方发布的

> **《业余无线电台操作技术能力验证题库（2025年版）》**

- 官网：https://www.crac.org.cn/
- 题库下载页：https://www.crac.org.cn/?p=1287
- 发布：2025-07-28

本题库包含 **A 类 / B 类 / C 类** 全套题目，本应用收录其中 **A 类全部 683 道真题**，覆盖全部 52 个知识分类。

> ⚠️ **版权声明**：题目内容版权归 CRAC 所有，本应用仅用于业余无线电爱好者学习与备考，不用于商业用途。

## ✨ 功能特性

- ✅ **683 道 A 类真题**，覆盖法规、电路、电波传播、天线、安全等全部知识分类
- ✅ **答案解析**：每道题均配有通俗易懂、便于记忆的答案解释（含记忆口诀、数值关系）
- ✅ **四种题型**：单选 / 双选 / 三选 / 四选（MC1~MC4）
- ✅ **多种练习模式**：
  - 🎲 随机练习（错题加权优先）
  - 📋 顺序练习（按题号逐组）
  - 📚 分类练习（按知识分类）
  - ❌ 错题本（答对移除，专项强化）
- ✅ **答题进度持久化**：localStorage 本地保存，关闭重开不丢失
- ✅ **成绩统计**：正确率、积分、通过判定（70% 及格线）
- ✅ **离线可用**：Service Worker 缓存全部题库，无网络也能刷题
- ✅ **PWA 支持**：可安装为手机桌面应用（Android 支持 APK 打包）
- ✅ **离线单文件版**：`index.standalone.html` 把全部 683 题直接内嵌页面，打开即用、永不依赖网络/缓存
- ✅ **深色 / 浅色主题**：跟随系统自动切换，可手动选择

## 📱 应用截图

| 首页 | 答题 | 分类练习 |
|------|------|----------|
| ![首页](screenshots/home.png) | ![答题](screenshots/exam.png) | ![分类练习](screenshots/categories.png) |

## 🚀 部署

### GitHub Pages

本仓库已配置为 GitHub Pages，推送到 `main` 分支即自动发布：

```bash
git push origin main
```

发布地址：`https://<username>.github.io/ham-exam/`

### 本地运行

```bash
# 需要 Node.js
npm install express
node server.js
# 访问 http://localhost:3000
```

### 打包为 Android APK

**推荐：全离线版 APK（内置全部 683 题，无需网络，推荐安装）**

📥 **[下载 HAM考试 离线版 v1.0.4](https://github.com/bjdr69/ham-exam/releases/download/v1.0.4/HAM-exam-v1.0.4.apk)**

> **v1.0.4 修复**：① 按 CRAC 官方题库修正 50 道题的分类边界错位，分类练习 1.1.1「无线电管理法规」恢复为 5 题，全部 51 分类计数与官方一致；② 修复 Android 16 上页面标题与系统状态栏叠加显示。

| 特性 | 离线版 v1.0.4（推荐） | 旧版 v1.0.0（TWA） |
|------|----------------------|--------------------|
| 网络 | **100% 离线，永不联网** | 首次需联网加载题库 |
| 题库 | **683 题全部内置 APK** | 靠 Service Worker 缓存 |
| 权限 | **0 权限** | 有通知权限 |
| 体积 | 仅 181 KB | 约 1 MB |
| targetSdk | 36（安卓 5.0~16） | 36 |

> 离线版把全部题目与答案解析直接打包进应用，断网、清缓存、重装后照常使用。
> 包名 `io.github.bjdr69.hamexam`，若曾安装过旧离线版请先卸载。
> 旧版本：[v1.0.3](https://github.com/bjdr69/ham-exam/releases/download/v1.0.3/HAM-exam-v1.0.3.apk)

**旧版 TWA（在线版，加载线上最新数据）**

📥 **[下载 HAM考试 v1.0.0 APK](https://github.com/bjdr69/ham-exam/releases/download/v1.0.0/HAM.apk)**

> 安装方法：手机开启「允许安装未知来源应用」→ 下载 APK → 点击安装。

如需用 PWABuilder 重新打包在线版：
1. 用浏览器打开线上地址（或本地服务地址）
2. 访问 [PWABuilder](https://www.pwabuilder.com) 输入网址
3. 选择 **Android** 平台打包下载
4. 将 ZIP 中的 APK 传到手机安装

## 🗂️ 项目结构

```
├── index.html          # 单页应用（全部功能）
├── manifest.json       # PWA 清单
├── sw.js               # Service Worker（离线缓存）
├── icon-192.png        # 应用图标
├── icon-512.png        # 应用图标
├── screenshots/        # 应用商店截图
└── data/
    ├── questions.json  # 683 道真题 + 答案解析
    └── categories.json # 52 个知识分类
```

## 📄 数据字段说明

`data/questions.json` 每题字段：

| 字段 | 说明 |
|------|------|
| `id` | 题目编号（如 MC1-0001） |
| `category` | 分类编号（如 1.1.1） |
| `categoryName` | 分类名称（如 无线电管理法规） |
| `type` | 题型（MC1单选 / MC2双选 / MC3三选 / MC4四选） |
| `selectCount` | 需选择答案数量 |
| `question` | 题目内容 |
| `options` | 选项（A/B/C/D） |
| `answer` | 标准答案 |
| `explanation` | 答案解释（通俗易懂、便于记忆） |

## 📝 说明

- 答题进度存储在浏览器 localStorage，更换设备或清除浏览器数据会丢失
- 答案解析为学习辅导用途，若与官方考试判分标准有出入，以官方题库为准
- 本项目为学习工具，不参与任何商业运营

## 📧 反馈

问题或建议，欢迎在 [GitHub Issues](https://github.com/bjdr69/ham-exam/issues) 提出。
