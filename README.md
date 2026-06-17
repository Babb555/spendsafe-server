[README.md](https://github.com/user-attachments/files/29029776/README.md)
# SpendSafe — Stripe Payment Flow

Complete payment system for the SpendSafe finance app. $4.99 one-time charge with
encrypted email delivery and Stripe webhook fulfillment.

---

## File Structure

```
spendsafe-stripe/
├── public/
│   ├── checkout.html     ← Payment form (Stripe Elements)
│   └── success.html      ← Post-payment delivery page
├── server/
│   └── server.js         ← Node.js + Express + Stripe
├── package.json
├── .env.example
└── README.md
```

---

## Setup in 5 Steps

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your real keys (see step 3 & 4).

### 3. Get Stripe keys

1. Go to https://dashboard.stripe.com/apikeys
2. Copy your **Secret key** → `STRIPE_SECRET_KEY`
3. Copy your **Publishable key** → paste into `public/checkout.html` line 1:
   ```js
   const STRIPE_PUBLISHABLE_KEY = "pk_live_...";
   ```

### 4. Set up Stripe webhook

1. Go to https://dashboard.stripe.com/webhooks
2. Click **Add endpoint**
3. URL: `https://your-server.com/webhook`
4. Events: select **`payment_intent.succeeded`**
5. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### 5. Configure email (Resend recommended — free up to 3,000/mo)

1. Sign up at https://resend.com
2. Add & verify your domain
3. Create an API key
4. Fill in the `SMTP_*` vars in `.env`

---

## Running locally

```bash
# Start server
npm run dev   # uses nodemon for auto-restart

# Test webhook locally with Stripe CLI
stripe listen --forward-to localhost:3001/webhook
```

---

## Deploying to production

### Option A: Railway (recommended, ~2 min)
1. Push this folder to a GitHub repo
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Set environment variables in Railway dashboard
4. Railway gives you a URL like `https://spendsafe-server.up.railway.app`
5. Update `API_BASE` in `checkout.html` and `success.html`

### Option B: Render (free tier available)
1. New Web Service → connect GitHub repo
2. Build command: `npm install`
3. Start command: `npm start`
4. Set env vars in Render dashboard

### Option C: Fly.io
```bash
fly launch
fly secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
fly deploy
```

---

## Payment Flow

```
User clicks "Pay $4.99"
       │
       ▼
checkout.html
  POST /create-payment-intent
       │
       ▼ (server creates PaymentIntent, returns clientSecret)
       │
  stripe.confirmCardPayment(clientSecret)
       │
       ▼ (Stripe processes card)
       │
  ┌────┴────────────────────┐
  │                         │
  ▼                         ▼
success.html           Stripe webhook
  GET /verify-payment    POST /webhook
  (client confirmation)  (server fulfillment)
                              │
                              ▼
                       sendAccessEmail()
                       (nodemailer → Resend)
```

**Important:** Always use the webhook for fulfillment — it fires reliably even
if the user's browser crashes or they close the tab. The success page is just
for immediate UX; the webhook is the source of truth.

---

## Going live checklist

- [ ] Replace `pk_test_` with `pk_live_` in checkout.html
- [ ] Replace `sk_test_` with `sk_live_` in .env
- [ ] Update webhook to use live mode endpoint in Stripe dashboard
- [ ] Verify your sending domain in Resend
- [ ] Set `FRONTEND_URL` to your real domain
- [ ] Test with a real card (Stripe has a test card: `4242 4242 4242 4242`)
- [ ] Add your domain to Stripe's allowed origins

---

## Test cards (Stripe test mode only)

| Card               | Result                     |
|--------------------|----------------------------|
| 4242 4242 4242 4242 | Success                   |
| 4000 0000 0000 0002 | Card declined             |
| 4000 0025 0000 3155 | 3D Secure authentication  |

Use any future expiry date and any 3-digit CVC.
