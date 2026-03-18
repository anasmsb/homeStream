# HomeStream

**Your photos and videos, on your network, under your control.**

HomeStream is a self-hosted media server designed for homes, families, and small teams. Drop your folders into a directory and instantly browse, view, and stream everything from any device on your local network — phones, tablets, laptops, smart TVs.

No cloud subscriptions. No upload limits. No third-party access to your memories. Just your files, served securely over your own LAN.

`media server` `home media server` `lan media server` `self-hosted` `photo gallery` `video streaming` `media browser` `media drop` `lan vault` `stream nest` `media gate` `home stream` `nas media` `local media server` `private media server` `photo viewer` `video player` `media manager` `file browser` `image gallery` `self-hosted gallery` `lan streaming` `media sharing` `network media` `family media server` `photo backup` `video backup` `family photos` `memory vault` `home gallery` `private cloud` `media organizer` `self hosted photo gallery` `self hosted video server`

---

### Who is this for?

- **Families** who want a private place to store and share vacation photos, birthday videos, and everyday memories — accessible from every device at home
- **Photographers & videographers** who need a quick way to preview and organize large media libraries on their local network
- **Home lab enthusiasts** looking for a lightweight, no-nonsense media server without the bloat of Plex or Jellyfin
- **Small teams & studios** who want to share project assets internally without uploading to the cloud
- **Anyone** who just wants to plug in a hard drive, run one command, and have a beautiful media browser

---

## Features

- **Drop & Browse** — Place media folders in the media directory and they appear instantly in the web UI
- **Image Viewer** — Fullscreen viewer with keyboard/swipe navigation, preloading, and file info
- **Video Player** — Stream videos with full seek support (HTTP Range), keyboard shortcuts, and animated preview thumbnails on hover
- **Multi-User** — Three roles: `admin` (full access), `uploader` (view + upload), `viewer` (view only)
- **Folder Permissions** — Admins assign which folders each user can see
- **Favorites** — Per-user favorites saved in the database
- **Search** — Search by filename with "Go to Folder" navigation
- **Upload** — Upload files or entire folders with drag-and-drop, preserving folder structure
- **Soft Delete** — Admin can delete files (moved to trash, auto-purged after configurable days)
- **Thumbnails** — Auto-generated thumbnails for images (Sharp) and videos (FFmpeg)
- **Video Previews** — Animated preview clips generated on hover
- **Pagination** — 50 / 100 per page, or infinite scroll
- **Secure** — HTTPS with self-signed certs, JWT auth, opaque file IDs (real paths never exposed)
- **Live Reload** — File system changes detected in real-time via Chokidar
- **Zero Build Step** — Vanilla HTML/CSS/JS frontend, no bundler needed
- **Dark Theme** — Easy on the eyes, responsive across all screen sizes

## Screenshots

![Login](screenshots/login.png)

![Main Browser](screenshots/main.png)

![Video Player](screenshots/player.png)

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [PostgreSQL](https://www.postgresql.org/) running locally or on your network
- FFmpeg (auto-downloaded during setup)

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/homestream.git
cd homestream

# 2. Install dependencies
npm install

# 3. Run setup (creates database, admin user, SSL certs, downloads FFmpeg)
npm run setup

# 4. Start the server
npm start
```

Open `https://localhost:3000` in your browser (accept the self-signed certificate).

To access from other devices on your network, use your machine's local IP: `https://192.168.x.x:3000`

## Configuration

All settings are in `.env` (created during setup):

| Variable | Default | Description |
|---|---|---|
| `DB_URL` | `postgresql://postgres:password@localhost:5432/mediaserver` | PostgreSQL connection string |
| `JWT_SECRET` | _(auto-generated)_ | Secret key for JWT tokens |
| `PORT` | `3000` | HTTPS server port |
| `MEDIA_DIR` | `./media` | Path to your media folders |
| `MAX_FILE_SIZE_MB` | `5120` | Max upload file size in MB |
| `MAX_FILES_PER_UPLOAD` | `500` | Max files per upload batch |
| `JWT_EXPIRY` | `24h` | Token expiration time |
| `SOFT_DELETE_DAYS` | `30` | Days before trashed files are permanently deleted |

## Usage

### Adding Media

Drop any folder containing images or videos into the `media/` directory (or your configured `MEDIA_DIR`). HomeStream detects changes automatically — no restart needed.

```
media/
├── Vacation 2024/
│   ├── photo1.jpg
│   ├── photo2.png
│   └── video.mp4
├── Family Photos/
│   ├── birthday/
│   │   └── cake.jpg
│   └── portrait.jpg
└── Clips/
    └── funny.mp4
```

### User Roles

| Role | Browse | Upload | Delete | Admin Panel |
|---|---|---|---|---|
| `admin` | All folders | Yes | Yes (soft delete) | Yes |
| `uploader` | Permitted folders | Yes | No | No |
| `viewer` | Permitted folders | No | No | No |

### Admin Panel

Access at `https://localhost:3000/admin` (admin users only):

- Create, edit, and delete users
- Assign roles and folder permissions
- View and manage trashed files (restore or permanently delete)

### Keyboard Shortcuts

**Image Viewer:**
| Key | Action |
|---|---|
| `←` `→` | Previous / Next image |
| `Escape` | Close viewer |

**Video Player:**
| Key | Action |
|---|---|
| `←` `→` | Seek -10s / +10s |
| `↑` `↓` | Previous / Next video |
| `Space` | Play / Pause |
| `Escape` | Close player |

## Security Notice

> **HomeStream is designed for local network (LAN) use only. Exposing it to the public internet is at your own risk.**

If you still plan to make it publicly accessible, do so at your own risk.

| Risk | Details | Recommendation |
|---|---|---|
| **No rate limiting** | Login and API endpoints have no request throttling. An attacker can brute-force passwords. | Add a reverse proxy (Nginx, Caddy) with rate limiting, or use a module like `express-rate-limit`. |
| **Self-signed certificates** | Browsers will show warnings. Not trusted by external clients. | Use a proper TLS certificate from Let's Encrypt (free) behind a reverse proxy. |
| **No file type validation on upload** | Any file type can be uploaded. A malicious user with upload access could upload harmful files. | Restrict uploads to known media MIME types if exposed publicly. |
| **Token in URL** | Media streaming passes JWT tokens as query parameters, which can appear in server logs and browser history. | Acceptable on LAN; on public internet, use cookie-based auth or signed URLs with short expiry. |
| **No CSP headers** | Content Security Policy is disabled to allow inline styles. Increases XSS risk. | Enable CSP with a strict policy if facing the internet. |
| **No account lockout** | Failed login attempts are not tracked. No lockout after repeated failures. | Implement account lockout or CAPTCHA for public-facing deployments. |

**Our recommendation:** If you need external access, put HomeStream behind a **VPN** (WireGuard, Tailscale) rather than exposing it directly. This gives you remote access with LAN-level security — no extra hardening needed.

## Tech Stack

- **Backend:** Node.js, Express, PostgreSQL
- **Frontend:** Vanilla HTML/CSS/JS (dark theme, responsive)
- **Auth:** bcrypt + JWT
- **Thumbnails:** Sharp (images), FFmpeg (videos)
- **File Watching:** Chokidar

## Project Structure

```
├── server.js           # HTTPS server entry point
├── setup.js            # One-time setup wizard
├── db/
│   ├── index.js        # PostgreSQL connection pool
│   └── schema.sql      # Database schema
├── lib/
│   ├── scanner.js      # Media directory scanner
│   ├── ids.js          # Opaque ID mapping
│   ├── thumbs.js       # Thumbnail generation
│   └── ffmpeg.js       # FFmpeg auto-download
├── middleware/
│   ├── auth.js         # JWT authentication
│   └── admin.js        # Admin role guard
├── routes/
│   ├── auth.js         # Login endpoint
│   ├── folders.js      # Folder browsing
│   ├── media.js        # Streaming, thumbnails, previews
│   ├── search.js       # File search
│   ├── favorites.js    # Per-user favorites
│   ├── upload.js       # File/folder upload
│   ├── delete.js       # Soft delete & trash
│   └── admin.js        # User & permission management
└── public/
    ├── index.html      # Login page
    ├── browse.html     # Main app
    ├── admin.html      # Admin panel
    ├── css/style.css   # Styles
    └── js/             # Frontend modules
```

## License

MIT
