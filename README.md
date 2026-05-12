# Installer Landing Page SaaS

A multi-tenant SaaS platform for intercom/security installers to get professional landing pages.

## Project Structure

```
/
├── server.js              # Express app entry point
├── db.js                  # MongoDB schemas & connection
├── middleware/auth.js     # Session auth guards
├── routes/api.js          # All API routes
├── views/
│   ├── landing.ejs        # Public installer landing page (SSR, RTL Hebrew)
│   └── 404.ejs            # 404 page
├── public/
│   ├── admin/index.html   # Admin panel
│   └── dashboard/index.html  # Installer dashboard
└── .env.example           # Environment variables template
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in your values:

```
PORT=3000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/installer_saas
SESSION_SECRET=your_super_secret_key

CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_admin_password
```

### 3. Run locally

```bash
npm run dev
```

### 4. Deploy to Render

1. Push to GitHub
2. Create a new **Web Service** on Render
3. Connect your repo
4. Set environment variables in Render dashboard
5. Build command: `npm install`
6. Start command: `npm start`

## URLs

| URL | Description |
|-----|-------------|
| `/` | Home |
| `/admin` | Admin panel (manage all installers) |
| `/dashboard` | Installer dashboard (login required) |
| `/:slug` | Public installer landing page |

## Admin Panel Features

- View all installers + stats (leads, logins, status)
- Create new installer accounts
- Toggle installer active/inactive
- Reset installer passwords
- Approve/reject portfolio photos before publishing
- View all leads (filterable by installer)
- Send notifications to individual installers
- Analytics overview (top installers, login activity)

## Installer Dashboard Features

- View public page link
- Edit all profile information
- Upload profile image & hero image (instant publish)
- Upload portfolio photos (requires admin approval)
- Manage testimonials (add/delete)
- View incoming leads
- View notifications from admin
- Change own password

## Landing Page Sections

1. **Hero** — Name, business name, tagline, 2 CTA buttons (quote + WhatsApp)
2. **Services** — Grid of service cards
3. **About** — Text + image + trust checklist
4. **Portfolio** — Photo grid with lightbox (approved images only)
5. **Testimonials** — Star-rated review cards
6. **Lead Form** — Name, phone, service type, message
7. **Footer** — Phone link + social buttons + floating WhatsApp button

## Notes

- Portfolio images uploaded by installers are **pending** by default
- Admin must approve each photo before it appears on the public page
- Landing pages are server-side rendered (EJS) for SEO
- All sessions stored in MongoDB via connect-mongo
- Images stored on Cloudinary
