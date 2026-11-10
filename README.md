# 时光相册 · PhotoWall

一个可自行部署的个人照片墙。访客可以按照片墙、季度时间线和地球地点浏览；管理员可以在手机或电脑上传、排序、写说明、设置公开范围，并生成相册邀请链接。

## 技术与目录

- `web/`：React、TypeScript、Vite；地点页使用 Three.js 与 React Three Fiber。
- `server/`：Java 21、Spring Boot、Spring Security、SQLite。
- `data/`：运行时 SQLite 数据库、原图和展示图。此目录不进入版本库。
- `design/`：本地设计参考图，不进入版本库。

所有照片文件保存在服务器本地。数据库只保存相册、照片说明、排序、地点和授权信息。展示图会去除原图元数据；原图下载仅管理员可用。

## 本地开发

需要 Java 21、Maven 3.9、Node.js 20+。首次启动后端前，设置管理员邮箱和至少 12 位密码：

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21.0.10'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:PHOTOWALL_ADMIN_EMAIL='you@example.com'
$env:PHOTOWALL_ADMIN_PASSWORD='replace-with-a-long-private-password'
cd server
mvn spring-boot:run
```

另开终端启动前端：

```powershell
cd web
npm install
npm run dev
```

打开 Vite 输出的本地地址。开发服务器会把 `/api` 转发到 Java 服务。首次创建管理员后，可以从环境中移除初始密码；之后的登录使用数据库中的密码哈希。

### 地点地图与中国网络

地点页默认使用 OpenFreeMap 的在线街道地图，支持从全球缩放至街道。地图 Worker 随前端本地打包，全球轮廓也保存在前端资源内；在线地图连接失败时会保留本地底图并显示重试提示。本地底图包含全球轮廓，不含离线街道数据。

需要使用国内天地图服务时，在天地图控制台创建浏览器应用 Key，把 `web/.env.example` 复制为 `web/.env.local` 并填写 `VITE_TIANDITU_KEY`，重启前端。生产部署需设置该变量后重新构建。配置后会使用天地图矢量底图和中文注记，不再请求 OpenFreeMap。Key 的来源域名限制应允许实际访问域名（本地开发使用 `127.0.0.1` 或 `localhost`）。

## 主要操作

成功登录后，同一浏览器会自动保留七天免登录凭证，关闭浏览器或服务重启后也能恢复身份。七天从密码登录成功时计算，恢复登录不会延长期限。主动退出会撤销该账号的免登录凭证，密码变更后原凭证也会失效。凭证通过 HttpOnly、SameSite=Lax Cookie 保存，HTTPS 部署使用 Secure 标记；浏览器不保存账号密码。升级到此功能后需重新登录一次以启用。

页面右上角的日间／夜间开关适用于照片墙、时间线、地点、相册、登录及管理页面。首次打开跟随系统配色；手动切换后会在当前浏览器保存选择，刷新和切换页面均保留。照片保持原色，地点地图也会同步切换配色。

日间时间线会按当前季度页的中间月份显示季节氛围：3—5 月为春季花瓣，6—8 月为夏季光斑和树影，9—11 月为秋季落叶，12—2 月为冬季雪花。判断依据为正在浏览的照片时间线，空白月份同样使用页面月份，不依赖当天日期。动效使用独立的全屏背景层，覆盖整个视口，位于照片、文案和导航按钮下层，不拦截点击。季节及日夜切换使用半秒淡入淡出，夜间和未激活季节会暂停动画。桌面端共 36 个飘落粒子，手机端减为 14 个，仍覆盖全屏；系统开启“减少动态效果”时，仅保留日间季节配色，并立即完成翻页。

1. 管理员登录，创建相册并设置公开或受邀可见。
2. 在“照片”页选择相册，批量上传 JPEG、PNG 或 GIF 动图。选择后会逐张预览解析出的拍摄日期、时刻、地点名称及 GPS 经纬度。照片可分别设置“所有访客公开”或“仅受邀访客”。私密相册中的照片始终仅受邀可见。
3. 时间线在桌面端每次展示连续两个月，手机端每次展示一个月。上传会读取 EXIF / XMP 拍摄时间（按照片当地时间保存）及 EXIF GPS，并优先读取 IPTC / XMP 地点名称。只有 GPS 时，使用服务内置的全球城市数据寻找 50 公里内最近的城镇，结果为附近城市估算；无匹配时保留坐标、名称留空。运行时不调用外部地理编码服务，适用于中国网络环境。没有元数据时不虚构时间或位置。上传表单中手动填写的字段优先，批量上传仍分别保留每张照片的自动信息。
   时间线中月份按从早到晚排列，每月照片集中在一个拼贴块中，点击缩略图可放大并左右切换。管理员登录后可在月份对侧点击“编辑文案”，保存当月标题和正文。文案独立保存在数据库中；访客仅能读取其可见照片所在月份的文案。
4. 在“邀请与权限”页输入访客邮箱并生成一次性邀请链接，手动发送给对方。系统不会自动发送邮件。已有访客账号会直接获得该相册权限。

目前支持 JPEG、PNG 和 GIF，每张不超过 25MB。GIF 展示文件保留画面、帧延时、透明度及循环，去掉注释等附加元数据；为控制播放资源，最多 1000 帧且累计帧像素不超过 2 亿。照片墙、时间线、地点及相册使用相同动画文件。暂不支持 Live Photo、动态 WebP 或 APNG。照片原图存于 `data/originals/`，展示图存于 `data/display/`，默认原图额度为 20GB。可通过 `PHOTOWALL_PHOTO_QUOTA_BYTES` 调整。

离线城市数据来源：[GeoNames](https://www.geonames.org/)，基于 cities15000，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可。来源说明见 `server/src/main/resources/geodata/NOTICE.txt`。城市匹配不会改变原始 WGS84 经纬度。

上传和编辑照片时，“地点（城市／区县）”支持搜索区县名、拼音或省市区县组合，例如“杭州 西湖区”。重名区县会展示完整省市名称，选择后保存完整地点名称和对应参考坐标，地点页按完整名称分别聚合。中国行政地名索引来自 GeoNames CN 数据中的省、市、区县记录，随服务离线提供，无需地图 Key；海外城市仍可搜索。按地名填入的是行政地区参考点，不代表真实拍摄位置，也不进行行政边界判定；有准确 GPS 时应保留或手动填写真实坐标。地名与参考点可能滞后于行政区划调整。

## Linux 单机部署

在服务器安装 Java 21、Nginx、Node.js 与 Maven；Node.js 和 Maven 只用于构建，也可以在本地构建后上传产物。建议目录：

```text
/opt/photowall/server/photowall-server.jar
/opt/photowall/web/dist/
/opt/photowall/data/
```

构建：

```bash
cd server && mvn -DskipTests package
cd ../web && npm ci && npm run build
```

将 JAR 复制为 `/opt/photowall/server/photowall-server.jar`，前端 `dist/` 放到上述目录。参考 `deploy/photowall.service.example` 创建 systemd 服务，参考 `deploy/nginx.conf.example` 配置 Nginx，然后为域名配置 HTTPS。生产环境在 `/etc/photowall.env` 中设置：

```text
PHOTOWALL_DATA_DIR=/opt/photowall/data
PHOTOWALL_ADMIN_EMAIL=you@example.com
PHOTOWALL_ADMIN_PASSWORD=replace-with-a-long-private-password
PHOTOWALL_SECURE_COOKIE=true
```

将 `/etc/photowall.env` 设置为仅服务管理员可读。首次启动并创建管理员后，删除其中的初始密码并重启服务。如果使用中国内地服务器向公众开放网站，需要先完成域名备案。

## 备份

照片和数据库在同一台服务器，必须定期备份到另一台设备。备份时使用 SQLite 的在线备份命令生成一致的数据库副本，同时复制 `data/originals/` 与 `data/display/`。恢复时先停止 Java 服务，再恢复数据库和两个照片目录。不要只备份 SQLite 文件。

40GB 磁盘建议保持默认 20GB 原图额度，并监控剩余空间。照片展示图、系统、日志和上传临时文件也会占用空间。
