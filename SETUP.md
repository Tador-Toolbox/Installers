# Installer Landing Page SaaS — Setup & Deploy Guide

## What You're Deploying

A multi-tenant SaaS platform where each intercom/security installer gets
a professional Hebrew RTL landing page at yoursite.com/their-name.

| URL | Who uses it |
|-----|-------------|
| `/` | Home |
| `/:slug` | Installer public landing page (e.g. `/israel-cohen`) |
| `/dashboard` | Installer logs in, edits profile, views leads |
| `/admin` | You — manage all installers, approve photos, view analytics |

---

## Step 1 — External Services (all free)

### MongoDB Atlas
1. Go to https://cloud.mongodb.com → Sign up free
2. Create a cluster → choose **M0 Free**
3. Create a **database user** (username + password — save these)
4. Under **Network Access** → Add IP → `0.0.0.0/0` (allow all)
5. Click **Connect** → **Drivers** → copy the connection string
   It looks like: `mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/`
   Replace `<password>` with your actual password and add the DB name:
   `mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/installer_saas`

### Cloudinary
1. Go to https://cloudinary.com → Sign up free
2. From the dashboard copy:
   - Cloud Name
   - API Key
   - API Secret

---

## Step 2 — GitHub

1. Create a new repo on https://github.com (e.g. `installer-landing`)
2. On your computer, inside the project folder:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/installer-landing.git
git push -u origin main
```

---

## Step 3 — Deploy on Render

1. Go to https://render.com → Sign up (connect with GitHub)
2. Click **New** → **Web Service**
3. Connect your GitHub repo
4. Fill in:
   - **Name:** installer-landing (or any name)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

5. Under **Environment Variables** add these:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | your Atlas connection string |
| `SESSION_SECRET` | any long random string (e.g. `xK9mP2qL8nR5vT3wY7zA1bC4dE6fG0h`) |
| `CLOUDINARY_CLOUD_NAME` | from Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | from Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | from Cloudinary dashboard |
| `ADMIN_USERNAME` | admin |
| `ADMIN_PASSWORD` | choose a strong password |

6. Click **Create Web Service** — Render builds and deploys automatically.
   Your URL will be something like: `https://installer-landing.onrender.com`

---

## Step 4 — First Login

1. Go to `https://your-app.onrender.com/admin`
2. Log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` you set
3. Click **➕ הוסף מתקין** to create your first installer account
4. The installer visits `https://your-app.onrender.com/dashboard` to log in

---

## Step 5 — Future Updates

Every time you push to GitHub, Render auto-deploys:

```bash
git add .
git commit -m "describe your change"
git push
```

---

## File Structure

```
/
├── server.js                   Main Express app
├── db.js                       MongoDB schemas (Installer, Lead, Admin, ClickEvent)
├── package.json
├── .env.example                Copy to .env for local dev
├── middleware/
│   └── auth.js                 Session guards
├── routes/
│   └── api.js                  All ~35 API endpoints
├── views/
│   ├── landing.ejs             Public installer page (SSR, RTL Hebrew, white design)
│   └── 404.ejs
└── public/
    ├── dashboard/index.html    Installer panel (profile, images, leads, etc.)
    └── admin/index.html        Admin panel (manage all installers + analytics)
```

---

## Admin Panel Features

- **Overview** — stat cards + click analytics (📞 calls, 💬 WhatsApp, 📋 quote buttons) per installer
- **Installers** — view all, toggle active/inactive, reset passwords, delete
- **Add Installer** — create new account with username/password/slug
- **Photo Approval** — approve or reject portfolio images before they go live
- **All Leads** — filterable by installer
- **Send Notification** — push a message to any installer's panel

## Installer Dashboard Features

- View public page link + copy it
- Edit full profile (name, business, phone, WhatsApp, tagline, about, services, areas, social links)
- Upload profile photo + hero/work photo
- Upload portfolio images (pending admin approval before going live)
- Add/delete testimonials with star ratings
- View all incoming leads
- View notifications from admin
- Change own password

## Landing Page Sections

1. **Nav** — logo + links + CTA button (sticky, glassmorphism)
2. **Hero** — name, business, tagline, 2 CTA buttons (quote + WhatsApp), trust bar
3. **Services** — compact 3-col grid (2-col on mobile)
4. **About** — image with gold frame + text + checkmarks
5. **Portfolio** — carousel with ←→ arrows, dots, swipe support, lightbox
6. **Testimonials** — star-rated cards
7. **Lead Form** — name, phone, service type, message → saved to DB
8. **Footer** — phone + social links + floating WhatsApp button

## Click Analytics

Every click on the landing page is tracked silently:
- Phone number links → `call`
- WhatsApp links → `whatsapp`  
- "Get a quote" buttons → `quote`

Visible in Admin → Overview as 3 stat cards + per-installer breakdown table.
