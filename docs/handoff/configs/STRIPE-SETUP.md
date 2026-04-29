# Stripe Setup
1. dashboard.stripe.com → API keys → copy test (pk_test_, sk_test_)
2. Products → Create plans (Starter $0, Pro $29/mo, Enterprise)
3. Webhooks → Add endpoint: https://volvix-pos.vercel.app/api/billing/webhook
   Events: checkout.session.completed, invoice.paid, subscription.deleted
4. Copy webhook signing secret (whsec_...)
5. Vercel env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
