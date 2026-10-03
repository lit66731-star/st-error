# error · 音乐播放器

SillyTavern 第三方扩展，界面仿**网易云音乐**，配色沿用 Serendipity 的暖白 + 灰玫瑰体系。

- 唱盘 + 唱针 + 播放列表 + 底部控制（播放/暂停、上一首/下一首、进度、音量）
- 循环模式：列表循环 / 单曲循环 / 随机播放
- 歌源：**网易云**（搜索 + 扫码登录，需自建 NeteaseCloudMusicApi）+ **本地音频文件**（IndexedDB 持久保存）+ **直链 URL**
- 同步歌词（当前句 + 翻译）
- 全屏面板，自适应手机屏幕（`100dvw/100dvh`，规避酒馆移动端 `body: fixed + overflow:hidden` 的高度失效问题）
- 顶栏右侧按钮群注入音乐按钮

## 网易云接入（可选）

插件本身不内置网易云接口，需要一个自建的 **NeteaseCloudMusicApi** 服务当后端（登录态存在服务端，能拿到 320k 音质；会员歌视账号权益）：

1. 在服务器上跑 NeteaseCloudMusicApi（Node，开源项目，与 error 插件无代码耦合）：
   ```bash
   # Docker 方式（推荐）
   docker run -d --name ncm -p 3000:3000 binaryify/netease_cloud_music_api
   # 或 Node 方式
   git clone https://github.com/Binaryify/NeteaseCloudMusicApi && cd NeteaseCloudMusicApi && npm i && node app.js
   ```
2. 打开 error 面板 → 网易云栏点「齿轮」→ 填 API 地址（如 `http://你的服务器:3000`）→ 保存。
3. 点「扫码」按钮，用网易云音乐 App 扫码登录（登录态保存在服务端，浏览器不接触 cookie）。
4. 搜索、点歌即可；播放地址按需解析，5 分钟内复用缓存。

> 注意：把 API 端口暴露到公网前，建议用 nginx 反代到同源路径并加访问控制，避免他人滥用你的登录态。

## 安装

把本目录 `error/` 复制到酒馆的 `public/scripts/extensions/third-party/error/`，刷新页面。

> `auto_update` 已开启：酒馆检测到本仓库更新并拉取后，会自动刷新页面应用新版本。

## 使用

1. 点顶栏右侧音符按钮打开面板。
2. 在右侧「播放列表」粘贴音频直链，或点文件夹图标选择本地音频文件。
3. 点歌单里的歌即可播放；点删除图标移除。

## 更新记录

- **1.1.1**：修复扫码登录二维码不显示——部分版本 `qrimg` 已自带 `data:` 前缀，避免重复拼接。
- **1.1.0**：新增网易云源——搜索、扫码登录（NeteaseCloudMusicApi 后端）、320k 优先解析、同步歌词（当前句 + 翻译）；播放列表来源标识区分本地/直链/网易云。
- **1.0.1**：修复顶栏按钮位置——按钮改为与酒馆其它顶栏按钮同构（`.drawer` + `.drawer-icon`），并插入到按钮群 `#ai-config-button` 之后，不再被挤到右上角。
- **1.0.0**：首个版本——网易云风格界面（唱盘/唱针/歌单/控制条）、本地文件 + 直链 URL 播放、三种循环模式、手机全屏自适应、顶栏按钮。
