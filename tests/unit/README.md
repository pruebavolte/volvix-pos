# Unit tests

Pure-Node, no frameworks. Uses `node:assert` and a tiny custom runner.

## Run

```bash
node tests/unit/run.js
```

## Coverage

| File | Tests |
|------|-------|
| `auth.test.js` | `signJWT` / `verifyJWT`, `verifyPassword` (scrypt, bcrypt-reject, legacy), `requireAuth` middleware (401/403/role check) |
| `validation.test.js` | `isUuid`, `isInt`, `pickFields` (whitelist sanitization, prototype-pollution safe) |
| `rate-limit.test.js` | `rateLimit` 5 OK / 6th rejected, isolation per key, window reset |
| `cors.test.js` | allowlist echo, unlisted origin rejected, credentials, missing origin |
| `security-headers.test.js` | `setSecurityHeaders` inserts the 6 headers (HSTS / X-Frame / CSP / Referrer / Permissions / nosniff) |

## How it works

`run.js` sets `NODE_ENV=test` plus required env vars (`JWT_SECRET`, `SUPABASE_SERVICE_KEY`,
`SUPABASE_URL`, `ALLOWED_ORIGINS`) **before** requiring `api/index.js`. The API module
exposes a `module.exports.__test` object only when `NODE_ENV === 'test'`, giving the
suite access to internal functions without spinning up the HTTP server.

`describe()` and `test()` are registered as globals; each `*.test.js` file just calls
them at top level. The runner discovers `*.test.js` siblings, awaits each test, and
exits with code 1 on any failure.

## Add a new test file

```js
'use strict';
const assert = require('node:assert/strict');
const { __test } = require('../../api/index.js');

describe('my feature', () => {
  test('does the thing', () => {
    assert.equal(1 + 1, 2);
  });
});
```

Save as `tests/unit/<name>.test.js`. The runner picks it up automatically.
