# Production Deployment Checklist

This document covers everything needed to safely publish the Poster Webstore to production on Replit.

---

## 1. Required Environment Variables

Set all of these as **Secrets** in the Replit deployment panel before publishing.

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Replit DB) | `postgresql://user:pass@host/db` |
| `STRIPE_SECRET_KEY` | Stripe **live** secret key (starts with `sk_live_`) | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret for production endpoint | `whsec_...` |
| `APP_BASE_URL` | Full public URL of your app (no trailing slash) | `https://yourstore.com` |
| `RESEND_API_KEY` | Resend API key for transactional email | `re_...` |
| `EMAIL_FROM` | Verified sender address in Resend | `orders@yourstore.com` |
| `EMAIL_PROVIDER` | Email provider identifier | `resend` |
| `ADMIN_API_TOKEN` | Long random secret for admin login (≥ 32 chars) | `openssl rand -hex 32` |
| `ADMIN_ORDER_NOTIFICATION_EMAIL` | Email address for new order admin notifications | `you@yourstore.com` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `https://yourstore.com,https://www.yourstore.com` |


> **Note:** The server will refuse to start in production if any of the above are missing.

The following variable is optional but strongly recommended for production:

| Variable | Description | Example |
|---|---|---|
| `ALLOWED_IMAGE_HOSTS` | Comma-separated hostnames allowed in Stripe checkout images. In production, images are omitted from Stripe if this is unset. | `images.example.com,cdn.yourstore.com` |
| `STRIPE_ALLOW_ALL_IMAGE_HOSTS` | Set to `true` to explicitly allow all image hosts in production (escape hatch — use only when you trust all image URLs in your database). | `true` |

---

## 2. Generating a Secure Admin Token

Run this command locally or in the Replit shell to generate a strong token:

```bash
openssl rand -hex 32
```

Paste the output as the `ADMIN_API_TOKEN` secret. Store it somewhere safe — you will need to enter it each time you log in to the admin panel.

---

## 3. Stripe Production Setup

### a. Switch to Live Keys
- In the [Stripe Dashboard](https://dashboard.stripe.com), go to **Developers → API Keys**.
- Copy the **Live mode** secret key (`sk_live_...`).
- Set it as `STRIPE_SECRET_KEY` in your deployment secrets.

### b. Create a Production Webhook
1. In the Stripe Dashboard, go to **Developers → Webhooks → Add endpoint**.
2. Set the endpoint URL to: `https://yourstore.com/api/stripe/webhook`
3. Select these events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.payment_failed`
4. Copy the **Signing secret** (`whsec_...`) and set it as `STRIPE_WEBHOOK_SECRET`.

> Webhook signature validation is enforced in production. Requests without a valid `stripe-signature` header are rejected.

### c. Configure Image Host Allowlist

Stripe Checkout requires product images to be served from publicly accessible, HTTPS URLs. The server validates every image URL against the `ALLOWED_IMAGE_HOSTS` allowlist before passing it to Stripe.

Set `ALLOWED_IMAGE_HOSTS` to a comma-separated list of hostnames that host your poster images:

```
ALLOWED_IMAGE_HOSTS=images.yourcdn.com,storage.googleapis.com,cdn.yourstore.com
```

**Behavior by environment:**

| Condition | Result |
|---|---|
| Development (`NODE_ENV` ≠ `production`) | All image hosts are allowed (no filtering) |
| Production — `ALLOWED_IMAGE_HOSTS` is set | Only images from listed hosts are passed to Stripe |
| Production — `ALLOWED_IMAGE_HOSTS` unset | Images are **omitted** from Stripe line items (fail-closed). Orders still succeed but no thumbnail appears in the Stripe checkout UI. A warning is logged. |
| Production — `STRIPE_ALLOW_ALL_IMAGE_HOSTS=true` | All hosts allowed explicitly (opt-in override; use only when all image URLs in the database are trusted) |

---

## 4. Resend Email Setup

1. Log in to [Resend](https://resend.com) and verify your sending domain.
2. Create an API key with **Send access** and set it as `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to a verified sender address on your domain (e.g. `orders@yourstore.com`).
4. Send a test order through the store to confirm delivery.

---

## 5. Custom Domain Setup

### In Replit
1. Go to your Deployment → **Custom domains**.
2. Add your domain (e.g. `yourstore.com`).
3. Copy the CNAME or A record Replit provides.

### In your DNS provider
1. Add the record Replit gave you.
2. Wait for propagation (usually under 30 minutes).
3. Replit will automatically provision a TLS certificate.

### After connecting the domain
- Set `APP_BASE_URL=https://yourstore.com` in your deployment secrets.
- Set `ALLOWED_ORIGINS=https://yourstore.com,https://www.yourstore.com`.
- Update the Stripe production webhook URL to match your new domain.

---

## 6. Replit Deployment Steps

1. Open your project and go to the **Deploy** tab.
2. Select **Autoscale** or **Reserved VM** as appropriate.
3. Ensure all secrets listed in Section 1 are set.
4. Click **Deploy**.
5. The server validates required environment variables on startup and will fail fast if any are missing — check the deployment logs if startup fails.

---

## 7. CORS Configuration

In production, only origins listed in `ALLOWED_ORIGINS` are permitted to make cross-origin requests to the API. The value should be a comma-separated list of your public domain(s):

```
ALLOWED_ORIGINS=https://yourstore.com,https://www.yourstore.com
```

During development on Replit, all origins are allowed automatically (development fallback only).

---

## 8. Smoke Test Checklist (After Deployment)

Run through these manually after each production deployment:

- [ ] Homepage loads correctly at your custom domain
- [ ] A poster detail page loads and shows correct images and pricing
- [ ] Adding to cart and proceeding through checkout works
- [ ] Stripe test checkout redirects to Stripe and returns to success page
- [ ] Order confirmation email arrives at the customer email address
- [ ] Admin order notification email arrives at `ADMIN_ORDER_NOTIFICATION_EMAIL`
- [ ] Admin panel is accessible at `/admin` and requires login
- [ ] Newsletter subscription form works and inserts into DB
- [ ] `/__mockup` returns 403 (blocked in production)
- [ ] `/api/health` returns `{ ok: true }`
- [ ] Stripe production webhook fires and marks order as paid (check Stripe Dashboard → Events)

---

## 9. Admin Access

The admin panel at `/admin` uses a session-cookie-based login. To access it:

1. Navigate to `https://yourstore.com/admin`
2. Enter the value of `ADMIN_API_TOKEN` when prompted
3. The server issues an `httpOnly` session cookie that lasts 8 hours
4. Log out via the "Log out" button in the admin header — this invalidates the server-side session

**Security notes:**
- The admin session is stored server-side (in-memory). Restarting the server invalidates all active admin sessions, requiring a fresh login.
- The `admin_session` cookie is `httpOnly` (inaccessible to JavaScript), `sameSite=lax`, and `secure` in production.
- The token is never stored in `localStorage` or exposed to the frontend.
- Rate limiting applies to admin login and all admin routes (100 requests per 15 minutes per IP).
- Treat `ADMIN_API_TOKEN` like a password. Rotate it if compromised (update the secret and redeploy).
- For multi-instance deployments, consider replacing the in-memory session store with a shared Redis session store so all instances share the same session state.

---

## 10. Security Hardening Summary

The following hardening measures are active in production:

| Measure | Status |
|---|---|
| CORS restricted to `ALLOWED_ORIGINS` | ✅ |
| Rate limiting on auth routes (20 req/15 min) | ✅ |
| Rate limiting on checkout routes (30 req/15 min) | ✅ |
| Rate limiting on newsletter (10 req/hour) | ✅ |
| Rate limiting on admin routes (100 req/15 min) | ✅ |
| Stripe webhook signature verification | ✅ |
| Payment status verified server-side with Stripe | ✅ |
| Admin session: httpOnly cookie, server-side store | ✅ |
| Admin token never stored in localStorage | ✅ |
| Stripe image URLs validated against `ALLOWED_IMAGE_HOSTS` | ✅ |
| Session cookies: httpOnly, secure, sameSite=lax | ✅ |
| bcrypt password hashing (10 rounds) | ✅ |
| Minimum password length: 8 characters | ✅ |
| Auth errors do not reveal email existence | ✅ |
| `/__mockup` blocked in production | ✅ |
| Required env vars validated on startup | ✅ |
| ADMIN_API_TOKEN minimum 32 chars enforced | ✅ |

---

## 11. Known Remaining Risks / Future Improvements

- **In-memory admin sessions:** Admin sessions are stored in process memory. On multi-instance deployments, sessions created on one instance will not be recognized by others. Use a Redis session store for horizontal scaling.
- **No multi-tenant RBAC:** All admins share a single token. Consider per-user admin accounts with proper roles for multi-admin setups.
- **Rate limiter storage:** The default rate limiter uses in-memory storage. If you run multiple instances, consider using a Redis store for shared rate limiting.
- **CSRF (Cross-Site Request Forgery):** The `admin_session` cookie uses `sameSite=lax`, which blocks cookie transmission in cross-site form POSTs and sub-resource requests. This is meaningful protection for the common CSRF attack surface. However, `lax` does allow cookies on top-level cross-site navigations (e.g., a link click). For defence-in-depth on admin write routes, consider adding server-side `Origin` header validation (`req.headers.origin` must match your domain) or a double-submit CSRF token once the admin panel is exposed to a broader audience.
