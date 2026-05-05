# ⚡ VOLVIX POS v340 — QUICK START GUIDE

## 🚀 Start in 30 seconds

### 1️⃣ Open Terminal
```bash
cd "C:\Users\DELL\Downloads\verion 340"
node server.js
```

### 2️⃣ Open Browser
```
http://localhost:3006/login.html
```
(Port may be different - check server output)

### 3️⃣ Login with Test Account
```
Email: admin@volvix.test
Password: Volvix2026!
```

### 4️⃣ Use POS
- **F1**: Sales menu
- **F12**: Checkout
- All buttons fully functional

---

## 📧 Test Accounts

| Email | Password | Role | Tenant |
|-------|----------|------|--------|
| admin@volvix.test | Volvix2026! | superadmin | Abarrotes Don Chucho |
| owner@volvix.test | Volvix2026! | owner | Restaurante Los Compadres |
| cajero@volvix.test | Volvix2026! | cajero | Abarrotes Don Chucho |

---

## ✅ What's Integrated

✅ **Authentication**: Secure login with session management  
✅ **POS Interface**: Full SalvadoreX system with real data  
✅ **Database**: User accounts, products, tenants  
✅ **Offline-First**: Works without internet (localStorage)  
✅ **Multi-User**: Different roles and permissions  

---

## 📂 Key Files

| File | Purpose |
|------|---------|
| `server.js` | Backend (auth, API, file serving) |
| `login.html` | Login page |
| `salvadorex-pos.html` | POS system (3130 lines) |
| `auth-gate.js` | Session protection |
| `db/volvix.db.json` | User database |

---

## 🔍 Current Status

- **Server**: ✅ Running on port 3006
- **Database**: ✅ Active with 3 test users
- **POS**: ✅ Fully loaded with products
- **Sessions**: ✅ 1-hour expiry
- **Offline**: ✅ Ready to use

---

## 💡 Quick Tips

**To restart server:**
```bash
# Press Ctrl+C to stop
# Then run again:
node server.js
```

**To test another user:**
1. Click logout (or close browser)
2. Go to `/login.html`
3. Use different credentials from table above

**To check server port:**
Look at startup message in terminal (e.g., "http://localhost:3006")

---

## 📊 Live Demo Data

Current transaction in POS:
- Coca Cola 600ml: $25 × 2 = $50.00
- Pan dulce: $8.50 × 3 = $25.50
- Queso fresco: $120 × 1 = $120.00
- **Total: $195.50**

---

## ❓ Troubleshooting

**Port already in use?**
→ Server auto-detects next available port (3001, 3002, etc.)

**Login fails?**
→ Check spelling: `admin@volvix.test` (with period before "test")

**POS not loading?**
→ Clear browser cache: Ctrl+Shift+Del

---

**Status**: 🟢 **READY TO USE**

