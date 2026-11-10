# 时光相册：Linux 发布说明（2026-11-04）

本版保留中轴翻书、随机飘落枫叶及夏季阳光／树影，不包含蝉。

## 发布文件

- `photowall-2026-11-04-linux.tar.gz`：已构建的 Java 后端、前端静态文件、部署配置。
- `photowall-data-2026-11-04.tar.gz`：本机当前账号、相册、文案、权限、照片原图及展示图的一致性快照。用于首次迁移，账号密码保持原样。
- `SHA256SUMS-2026-11-04.txt`：两个压缩包的完整性校验值。

数据包含私人照片和账号密码哈希，仅保存在可信位置，不要放到网站静态目录中。

## 1. 服务器准备

运行环境：Linux + systemd、Java 21、Nginx。无需在服务器安装 Node.js 或 Maven。
先执行 `java -version`，确认是 Java 21。Ubuntu 24.04 可使用：

```bash
sudo apt update
sudo apt install openjdk-21-jre-headless nginx
```

Debian、阿里云 Linux 等请使用对应发行版的软件源安装 Java 21 和 Nginx。
服务器安全组／防火墙需允许网站的 80、443 端口以及你正在使用的 SSH 端口。Java API 默认只监听本机 127.0.0.1:8080。

## 2. 上传和解包

本机 PowerShell（先按下方 SSH 配置建立 `photowall` 别名）：

```powershell
scp D:\CodexProject\PhotoWall\release\photowall-2026-11-04-linux.tar.gz photowall:/tmp/
scp D:\CodexProject\PhotoWall\release\photowall-data-2026-11-04.tar.gz photowall:/tmp/
ssh photowall
```

服务器上：

```bash
mkdir -p /tmp/photowall-release-2026-11-04
cd /tmp/photowall-release-2026-11-04
tar -xzf /tmp/photowall-2026-11-04-linux.tar.gz
tar -xzf /tmp/photowall-data-2026-11-04.tar.gz
cd photowall-2026-11-04-linux
sha256sum -c MANIFEST.sha256
```

## 3. 安装程序和迁移数据

以下为首次安装步骤。若服务器已有 PhotoWall，先备份服务器的数据，更新时只替换 `server/` 和 `web/dist/`，保留服务器自己的 `data/`，不要用本机快照覆盖已有数据。

```bash
id photowall || sudo useradd --system --home /opt/photowall --shell /usr/sbin/nologin photowall
sudo install -d /opt/photowall/server /opt/photowall/web
sudo install -m 644 server/photowall-server.jar /opt/photowall/server/photowall-server.jar
sudo cp -a web/dist /opt/photowall/web/
```

首次迁移数据前，确认 `/opt/photowall/data` 尚不存在。若已存在，先停止并备份旧服务后另行合并，跳过下面的复制命令。

```bash
if sudo test -e /opt/photowall/data; then
  echo '数据目录已存在，停止复制；请先检查旧站点数据。'
else
  sudo cp -a ../photowall-data-2026-11-04/data /opt/photowall/
fi
sudo chown -R photowall:photowall /opt/photowall/data
sudo chmod 700 /opt/photowall/data
sudo install -m 600 deploy/photowall.env.example /etc/photowall.env
sudo install -m 644 deploy/photowall.service.example /etc/systemd/system/photowall.service
sudo systemctl daemon-reload
sudo systemctl enable --now photowall
sudo systemctl status photowall --no-pager
curl -fsS http://127.0.0.1:8080/api/albums
```

迁移后仍使用本机原有账号和密码，不需要重新设置初始管理员。
如果选择全新空站点而不迁移数据，则先创建 `/opt/photowall/data` 并赋予服务用户权限，再在 `/etc/photowall.env` 添加 `PHOTOWALL_ADMIN_EMAIL` 和至少 12 位的 `PHOTOWALL_ADMIN_PASSWORD`，首次成功启动后删除初始密码并重启。

## 4. Nginx 和 HTTPS

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/photowall.conf
sudo nano /etc/nginx/conf.d/photowall.conf
```

将 `server_name photos.example.com` 改为实际域名，域名解析指向服务器。配置中的静态目录应为 `/opt/photowall/web/dist`，API 代理到 `127.0.0.1:8080`。

```bash
sudo nginx -t
sudo systemctl reload nginx
```

通过服务器控制台或证书工具为域名配置 HTTPS，然后访问 `https://你的域名`。
默认环境文件启用 `PHOTOWALL_SECURE_COOKIE=true`，需要 HTTPS 才能保持登录。如果仅用 HTTP/IP 临时验证，可将其暂设为 `false` 并重启 `photowall`；配置 HTTPS 后改回 `true` 并重启。

如看到 Nginx 默认欢迎页，检查其他默认站点是否抢占同一域名／IP。前端刷新深层路径由 `try_files ... /index.html` 处理。

## 5. 日常管理

```bash
sudo systemctl restart photowall
sudo journalctl -u photowall -n 100 --no-pager
```

备份时同时保留 SQLite 一致性副本、`data/originals` 和 `data/display`，数据目录必须持续保留在程序更新目录之外。升级前备份旧 JAR、静态资源和数据；回退程序时配套检查数据库版本。

地点页当前使用默认在线地图及本地全球轮廓备用数据。若需要中国网络下的街道细节，可按项目 README 配置天地图浏览器 Key 后重新构建前端，并在天地图控制台允许实际网站域名。上传照片解析时间、GPS 及附近城市不依赖外部地理编码服务。

## 在 ChatGPT 桌面端连接 SSH

在 Windows 的 `C:\Users\daijh\.ssh\config` 中添加（替换服务器信息和实际私钥路径）：

```sshconfig
Host photowall
  HostName 你的服务器IP
  User 你的SSH用户名
  Port 22
  IdentityFile C:/Users/daijh/.ssh/id_ed25519
  IdentitiesOnly yes
```

先在 PowerShell 执行 `ssh photowall` 验证连接；首次连接时核对服务器主机指纹。私钥保留在本机，不要粘贴到聊天里。
只上传和部署时，本机 Codex 可以通过 `ssh`／`scp` 使用该别名，无需在生产服务器安装 Codex。

如果想把 Codex 聊天的工作位置直接切换到服务器：在远程主机安装并登录 Codex，确保远程用户登录 Shell 能找到 `codex`；然后在 ChatGPT 桌面端打开“设置 → 连接 → SSH”，添加／启用 `photowall`，选择远程项目文件夹。

官方说明：
- https://learn.chatgpt.com/docs/remote-connections
- https://learn.chatgpt.com/docs/reference/commands
