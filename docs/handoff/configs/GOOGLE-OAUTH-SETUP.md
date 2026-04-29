# Google OAuth Setup
1. console.cloud.google.com → New Project "Volvix POS"
2. APIs & Services → OAuth consent screen → External → fill
3. Credentials → Create OAuth 2.0 Client ID → Web app
4. Authorized redirect: https://volvix-pos.vercel.app/api/auth/google/callback
5. Vercel env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
