# Deploying to a fresh Ubuntu VPS

Assumes a fresh Ubuntu 22.04/24.04 VPS, root or sudo SSH access, and a domain
already pointed at the VPS's IP (an `A` record, e.g. `api.yourdomain.com → 1.2.3.4`).

Run all commands over SSH on the VPS unless marked "(local)".

## 1. Basic server setup

```bash
sudo apt update && sudo apt upgrade -y

# Firewall — only allow SSH, HTTP, HTTPS. App itself (port 4000) stays
# internal, only reachable via Nginx's reverse proxy.
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 2. Install Node.js (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should print v22.x
```

## 3. Install & configure MySQL

```bash
sudo apt install -y mysql-server
sudo mysql_secure_installation   # set a root password, answer the prompts

sudo mysql -u root -p
```
Inside the MySQL prompt:
```sql
CREATE DATABASE marketing_portal CHARACTER SET utf8mb4;
CREATE USER 'marketing_portal_app'@'localhost' IDENTIFIED BY 'choose-a-strong-password-here';
GRANT ALL PRIVILEGES ON marketing_portal.* TO 'marketing_portal_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 4. Get the code onto the VPS

Either clone from your git remote, or upload from your machine:

```bash
# Option A — git (recommended)
sudo mkdir -p /var/www/marketing-portal
sudo chown $USER:$USER /var/www/marketing-portal
git clone <your-repo-url> /var/www/marketing-portal
cd /var/www/marketing-portal

# Option B — upload from your local machine instead (local), then SSH in:
# rsync -avz --exclude node_modules --exclude dist --exclude .env \
#   /Users/ashirarif/marketing-portal/ user@your-vps-ip:/var/www/marketing-portal/
```

## 5. Configure environment

```bash
cd /var/www/marketing-portal
cp .env.example .env
nano .env   # or vim
```

Fill in:
- `NODE_ENV=production`
- `DATABASE_URL="mysql://marketing_portal_app:choose-a-strong-password-here@localhost:3306/marketing_portal"`
- `JWT_SECRET` → generate: `openssl rand -hex 32`
- `TOKEN_ENCRYPTION_KEY` → generate: `openssl rand -hex 32`
- `META_OAUTH_REDIRECT_URI=https://api.yourdomain.com/api/v1/meta-accounts/oauth/callback`
- `FRONTEND_URL=https://yourdomain.com` (or your real client portal)
- `ALLOWED_ORIGINS=https://yourdomain.com` (comma-separate if more than one)
- `SENTRY_DSN=` — leave blank, or fill in if you have a Sentry project

**Important**: after this is live, go back into your Meta App Dashboard and
update "Valid OAuth Redirect URIs" and "Deauthorize Callback URL" to the
`https://api.yourdomain.com/...` versions — they currently point at localhost.

## 6. Install deps, build, migrate

```bash
npm install
npm run build              # compiles TypeScript → dist/
npx prisma generate
npx prisma migrate deploy  # production-safe migration runner (not `migrate dev`)
```

## 7. Run with PM2 (keeps the app alive, restarts on crash/reboot)

```bash
sudo npm install -g pm2
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd        # follow the printed command (run it with sudo)
```

Useful PM2 commands:
```bash
pm2 status
pm2 logs marketing-portal
pm2 restart marketing-portal
```

## 8. Nginx reverse proxy + SSL

```bash
sudo apt install -y nginx

sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/marketing-portal
sudo nano /etc/nginx/sites-available/marketing-portal   # replace api.yourdomain.com with your real domain

sudo ln -s /etc/nginx/sites-available/marketing-portal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Now get a free SSL cert (Certbot rewrites the Nginx config to add HTTPS automatically):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

## 9. Verify

```bash
curl https://api.yourdomain.com/health
# {"success":true,"data":{"status":"ok"}}
```

## Redeploying after code changes

```bash
cd /var/www/marketing-portal
git pull
npm install
npm run build
npx prisma migrate deploy   # only does anything if there are new migrations
pm2 restart marketing-portal
```

## Security checklist before going live

- [ ] `.env` is **not** committed to git and has real, unique secrets (not the placeholders from `.env.example`)
- [ ] MySQL user has access only from `localhost`, not `0.0.0.0`
- [ ] `ufw status` shows only SSH/80/443 open — port 4000 is not externally reachable
- [ ] Meta App's OAuth Redirect URI and Deauthorize Callback URL point at the real HTTPS domain
- [ ] `ALLOWED_ORIGINS` / client `portalUrl`s only list real frontend domains
- [ ] `pm2 startup` configured so the app survives a VPS reboot
