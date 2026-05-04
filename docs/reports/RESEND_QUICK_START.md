# Resend OTP Integration - Quick Start Guide

## 30-Second Setup

### 1. Get API Key (1 minute)
```bash
# Visit https://resend.com → Sign up → API Keys → Copy key
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 2. Add to Environment
```bash
# Add to .env or .env.local
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com  # optional
```

### 3. Restart Server
```bash
npm run dev  # or yarn dev
```

### 4. Test It
```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

**Response:**
```json
{
  "ok": true,
  "message": "OTP enviado a tu email",
  "expires_in": 600,
  "provider": "resend"
}
```

## What Changed

| File | Change |
|------|--------|
| `src/api/index.js` | Enhanced sendEmail() + Resend support |
| `src/api/customer-portal.js` | New POST /api/auth/send-otp endpoint |
| `src/.env.example` | Added RESEND_* variables |
| `test-otp-resend.js` | Test suite (NEW) |

## Key Endpoints

### Request OTP
```
POST /api/auth/send-otp
{ "email": "user@example.com" }
Response: { "ok": true, "expires_in": 600 }
```

### Verify OTP (Existing)
```
POST /api/customer/otp/verify
{ "email": "user@example.com", "otp": "123456" }
Response: { "ok": true, "token": "..." }
```

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `RESEND_API_KEY` | No | (none) | Resend API key (starts with `re_`) |
| `RESEND_FROM_EMAIL` | No | `noreply@resend.dev` | Custom sender email |
| `SENDGRID_API_KEY` | No | (none) | Fallback email provider |

## Features

- ✅ 6-digit OTP codes (1M combinations)
- ✅ 10-minute expiration
- ✅ Rate limiting (5 requests per 15 min)
- ✅ HTML email templates
- ✅ Database persistence
- ✅ Audit logging
- ✅ Provider fallback (Resend → SendGrid)

## Testing

```bash
# Without real email (development)
node test-otp-resend.js

# With Resend (production test)
RESEND_API_KEY=re_xxxxx node test-otp-resend.js test@example.com

# Check test results
# ✅ OTP Request
# ✅ Email Structure
# ✅ Rate Limiting
# ✅ Invalid Email Handling
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "RESEND_API_KEY missing" | Set `RESEND_API_KEY` in .env |
| Email not received | Check spam folder, verify email is real |
| 429 Rate Limited | Wait 15 minutes or use different IP |
| 400 Invalid Email | Ensure email has @ and domain |
| Not using Resend | Add `RESEND_API_KEY` to environment |

## Database Tables

**customer_otps** - Stores OTP codes (hashed)
```sql
SELECT * FROM customer_otps WHERE email = 'test@example.com';
```

**email_log** - Delivery audit trail
```sql
SELECT * FROM email_log WHERE template = 'otp_resend' LIMIT 10;
```

## Documentation

- **Full Guide:** `RESEND_OTP_INTEGRATION.md`
- **Implementation:** `RESEND_IMPLEMENTATION_SUMMARY.md`
- **Code:** `src/api/index.js` (sendEmail function)
- **Code:** `src/api/customer-portal.js` (send-otp endpoint)

## Support

- Resend Docs: https://resend.com/docs
- Status: https://status.resend.com
- Logs: Check `email_log` table for delivery status

---

**Status:** ✅ Ready to use
**Last Updated:** 2026-04-28
