# HomeStream

A self-hosted LAN media server. Drop folders into a directory and instantly browse, view, and stream your photos and videos from any device on your network.

`media server` `home media server` `lan media server` `self-hosted` `photo gallery` `video streaming` `media browser` `media drop` `lan vault` `stream nest` `media gate` `home stream` `nas media` `local media server` `private media server` `photo viewer` `video player` `media manager` `file browser` `image gallery` `self-hosted gallery` `lan streaming` `media sharing` `network media` `family media server`

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
- **Pagination** — Configurable page sizes (50 / 100 / All)
- **Secure** — HTTPS with self-signed certs, JWT auth, opaque file IDs (real paths never exposed)
- **Live Reload** — File system changes detected in real-time via Chokidar
- **Zero Build Step** — Vanilla HTML/CSS/JS frontend, no bundler needed

## Screenshots

> _Add screenshots here_

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
