// Shared fixtures / helpers for Volvix POS E2E
const USERS = {
  admin:  { email: 'admin@volvix.test',  password: 'Volvix2026!', role: 'admin'  },
  owner:  { email: 'owner@volvix.test',  password: 'Volvix2026!', role: 'owner'  },
  cajero: { email: 'cajero@volvix.test', password: 'Volvix2026!', role: 'cajero' },
};

async function login(page, user) {
  await page.goto('/login.html');
  // Stable selectors: prefer name/id/data-testid, fallback to type
  const emailSel = 'input[name="email"], input#email, input[type="email"], [data-testid="login-email"]';
  const passSel  = 'input[name="password"], input#password, input[type="password"], [data-testid="login-password"]';
  const submit   = 'button[type="submit"], [data-testid="login-submit"], button:has-text("Iniciar")';
  await page.locator(emailSel).first().fill(user.email);
  await page.locator(passSel).first().fill(user.password);
  await page.locator(submit).first().click();
}

async function getStoredToken(page) {
  return await page.evaluate(() => {
    const keys = ['token', 'auth_token', 'volvix_token', 'access_token', 'jwt'];
    for (const k of keys) {
      const v = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (v) return v;
    }
    return null;
  });
}

module.exports = { USERS, login, getStoredToken };
