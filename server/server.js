/**
 * SpendSafe — Stripe Payment Server
 * ─────────────────────────────
 * Endpoints:
 *   POST /create-payment-intent  — creates a $4.99 PaymentIntent, returns clientSecret
 *   POST /verify-payment         — verifies a PaymentIntent succeeded (called from success page)
 *   POST /webhook                — Stripe webhook for reliable post-payment fulfillment
 *
 * Setup:{# SpendSafe — Stripe Payment Flow

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

  "name": "spendsafe-server",
  "version": "1.0.0",# ─── Stripe ───────────────────────────────────────────────────────
# Get these from https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE

# Get this after creating a webhook at https://dashboard.stripe.com/webhooks
# Point it to: https://your-server.com/webhook
# Event to enable: payment_intent.succeeded
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# ─── App ──────────────────────────────────────────────────────────
# Your frontend URL (used for CORS + email links)
FRONTEND_URL=https://getspendsafe.app

# Server port (Railway/Render set this automatically)
PORT=3001

# ─── Email (SMTP) ─────────────────────────────────────────────────
# Recommended providers: Resend (resend.com), Postmark, or Amazon SES
# For Resend: HOST=smtp.resend.com, PORT=465, SECURE=true, USER=resend, PASS=your_api_key
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=re_YOUR_RESEND_API_KEY
SMTP_FROM=SpendSafe <noreply@getspendsafe.app>

  "description": "SpendSafe payment server — Stripe integration",
  "main": "server/server.js",
  "scripts": {
    "start": "node server/server.js",
    "dev": "nodemon server/server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "nodemailer": "^6.9.13",
    "stripe": "^15.12.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.4"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}

 *   1. npm install
 *   2. Copy .env.example → .env and fill in your keys
 *   3. node server.js
 *
 * Deploy to Railway, Render, or Fly.io in ~2 minutes (all have free tiers).
 */

require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const Stripe     = require("stripe");
const nodemailer = require("nodemailer");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const app    = express();

// ── CORS (allow your frontend domain) ────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "*", // e.g. "https://getspendsafe.app"
  methods: ["GET", "POST"],
}));

// ── Raw body for Stripe webhook signature verification ───────────────────────
app.use("/webhook", express.raw({ type: "application/json" }));

// ── JSON for all other routes ─────────────────────────────────────────────────
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// POST /create-payment-intent
// Called by checkout.html when user clicks Pay
// ─────────────────────────────────────────────────────────────────────────────
app.post("/create-payment-intent", async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email is required." });
  }

  try {
    // Find or create a Stripe customer so the email is attached to the payment
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({ email });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   499,          // $4.99 in cents
      currency: "usd",
      customer: customer.id,
      metadata: { email, product: "spendsafe_lifetime_v1" },
      description: "SpendSafe — Lifetime License",
      receipt_email: email,   // Stripe sends a receipt automatically
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("PaymentIntent error:", err.message);
    res.status(500).json({ error: "Failed to create payment. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /verify-payment
// Called by success.html to confirm the PaymentIntent status server-side
// ─────────────────────────────────────────────────────────────────────────────
app.post("/verify-payment", async (req, res) => {
  const { paymentIntentId } = req.body;

  if (!paymentIntentId) {
    return res.status(400).json({ success: false, status: "missing_id" });
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    res.json({
      success: pi.status === "succeeded",
      status:  pi.status,
      email:   pi.metadata?.email || null,
    });
  } catch (err) {
    console.error("Verify error:", err.message);
    res.status(500).json({ success: false, status: "error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhook
// Stripe calls this server-side after payment succeeds.
// This is the RELIABLE fulfillment path — always use this, not the client redirect.
// Set up at: https://dashboard.stripe.com/webhooks
// Event to listen for: payment_intent.succeeded
// ─────────────────────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "payment_intent.succeeded") {
    const pi    = event.data.object;
    const email = pi.metadata?.email || pi.receipt_email;

    console.log(`✓ Payment succeeded: ${pi.id} — ${email}`);

    // ── Send access email ──────────────────────────────────────────────────
    if (email) {
      await sendAccessEmail(email, pi.id);
    }

    // ── Optional: record purchase in DB ───────────────────────────────────
    // await db.purchases.create({ email, paymentIntentId: pi.id, createdAt: new Date() });
  }

  res.json({ received: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Email fulfillment
// Uses nodemailer — configure SMTP in .env (works with Resend, Postmark, Gmail)
// ─────────────────────────────────────────────────────────────────────────────
async function sendAccessEmail(email, orderId) {
  if (!process.env.SMTP_HOST) {
    console.log(`[DEV] Would send access email to ${email} — configure SMTP to enable`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const appUrl = `${process.env.FRONTEND_URL}/spendsafe/index.html`;

  await transporter.sendMail({
    from:    `"SpendSafe" <${process.env.SMTP_FROM || "noreply@getspendsafe.app"}>`,
    to:      email,
    subject: "◆ Your SpendSafe access is ready",
    html: `
      <div style="background:#060610;color:#e2e8f0;font-family:'Courier New',monospace;padding:48px 32px;max-width:520px;margin:0 auto;border-radius:16px">
        <div style="font-size:20px;font-weight:700;color:#8b5cf6;letter-spacing:0.15em;margin-bottom:32px">SpendSafe</div>
        <div style="font-size:28px;font-weight:700;margin-bottom:16px">Your lifetime license is ready.</div>
        <p style="color:#64748b;font-size:13px;line-height:1.75;margin-bottom:32px">
          Payment confirmed. You now have permanent access to SpendSafe — the privacy-first finance tracker that stores everything locally on your device.
        </p>
        <a href="${appUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;padding:16px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.08em">
          ◆ Launch SpendSafe →
        </a>
        <div style="margin-top:40px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.07);font-size:11px;color:#374151">
          Order ID: ${orderId}<br>
          Keep this email as your proof of purchase.<br><br>
          Questions? Reply to this email — we're real people.
        </div>
      </div>
    `,
    text: `Your SpendSafe lifetime license is ready.\n\nLaunch SpendSafe: ${appUrl}\n\nOrder ID: ${orderId}`,
  });

  console.log(`✓ Access email sent to ${email}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`SpendSafe server running on :${PORT}`));
