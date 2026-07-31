# 🎨 你画我猜 - Draw & Guess

一个基于 Supabase 实时数据库的多人你画我猜在线游戏。纯前端实现，零后端代码，延迟极低！

## ✨ 特性

- 🎨 **实时绘画同步**：基于 WebSocket（Supabase Realtime），笔画实时传输
- 💬 **实时聊天**：猜词消息即时推送
- 📱 **响应式设计**：手机、平板、电脑均可畅玩
- 🎯 **智能计分**：猜对得分，绘画者也有分
- 🔄 **多轮游戏**：轮流做绘画者，公平有趣
- 🆓 **完全免费**：Supabase 免费层足够日常使用
- 🇨🇳 **国内可访问**：新加坡节点，无需 VPN

## 🚀 快速开始

### 第一步：创建 Supabase 项目（免费）

1. 访问 [supabase.com](https://supabase.com) 注册账号
2. 点击 **"New project"** 创建新项目
3. 配置：
   - **Name**：`draw-guess`（任意名称）
   - **Database Password**：设置一个强密码（记下来）
   - **Region**：选择 **Singapore (ap-southeast-1)** ← 国内访问最快
   - **Pricing Plan**：选择 **Free**
4. 等待项目创建完成（约 2 分钟）

### 第二步：初始化数据库

1. 在 Supabase 项目面板左侧，点击 **SQL Editor**
2. 点击 **"New query"**
3. 将本项目的 `setup.sql` 文件内容**全部复制粘贴**到编辑器中
4. 点击 **"Run"** 执行
5. 看到 "Success" 即表示数据库初始化完成

### 第三步：获取 API 密钥

1. 在 Supabase 项目面板左侧，点击 **Settings** → **API**
2. 复制以下两个值：
   - **Project URL**（例如 `https://xxxxx.supabase.co`）
   - **anon public key**（以 `eyJ...` 开头的长字符串）

### 第四步：配置前端

打开 `js/config.js`，替换以下两行：

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';         // 粘贴 Project URL
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // 粘贴 anon key
```

### 第五步：启动游戏

#### 方式一：本地直接打开
直接用浏览器打开 `index.html` 即可开始玩。

#### 方式二：部署到 Vercel（推荐）
1. 将整个 `draw-and-guess` 文件夹上传到 GitHub
2. 在 [vercel.com](https://vercel.com) 用 GitHub 账号登录
3. 点击 **"New Project"** → 选择你的仓库 → **Deploy**
4. 获得一个公开 URL，分享给朋友即可！

## 🎮 玩法说明

1. **创建房间**：输入昵称 → 点击"创建新房间" → 记下 6 位房间码
2. **邀请好友**：把房间码发给朋友，让他们输入房间码加入
3. **开始游戏**：至少 2 人后，房主点击"开始游戏"
4. **轮流绘画**：系统随机选一位玩家当绘画者，其他人猜词
5. **猜词得分**：
   - 猜对词语的人：+10 分
   - 绘画者（有人猜对时）：+5 分
6. **游戏结束**：完成设定轮数后，得分最高者获胜！

## 📁 项目结构

```
draw-and-guess/
├── index.html          # 主页面（首页 + 大厅 + 游戏界面）
├── css/
│   └── style.css       # 全局样式
├── js/
│   ├── config.js       # Supabase 配置（需填写密钥）
│   ├── game.js         # 全局状态 & 游戏核心逻辑
│   ├── canvas.js       # 画板绘制 & 笔画同步
│   ├── chat.js         # 聊天消息处理
│   ├── room.js         # 房间创建 & 加入逻辑
│   └── home.js         # 首页交互
├── setup.sql           # 数据库初始化脚本
└── README.md           # 本文件
```

## ⚙️ 自定义配置

可以在 `game.js` 中修改以下默认值：
- `G.roundTime`：每轮时间（默认 60 秒）
- `G.maxRounds`：游戏总轮数（默认 3 轮）
- `G.COLORS`：画笔颜色列表
- `G.SIZES`：画笔粗细选项

在 `setup.sql` 中可以添加更多词语。

## 💰 免费额度

Supabase 免费层包含：
- 500MB 数据库空间
- 50MB 文件存储
- 2GB 带宽/月
- 实时订阅（WebSocket）
- 每月 50,000 活跃用户

对于日常小范围使用完全足够！

## 🔧 技术栈

- **前端**：HTML5 + CSS3 + Vanilla JavaScript
- **画板**：HTML5 Canvas API
- **实时通信**：Supabase Realtime（WebSocket）
- **数据库**：Supabase PostgreSQL
- **托管**：Vercel / 任意静态托管
