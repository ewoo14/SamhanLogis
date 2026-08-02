/**
 * GET / — 종합견적서 진입.
 *
 * Apps Script `doGet()` 호환 — bootstrap data 모두 prefetch 후 EJS render.
 * legacy 는 server-side template 안에서 `<?= var ?>` / `<?!= var ?>` 로
 * 직접 출력했으므로, EJS 도 동일한 시점에 inline JSON 으로 주입한다.
 */

'use strict';

const express = require('express');
const code = require('../lib/code');
const { resolveBuildAppVersion } = require('../lib/version-check');
const { readCookie, cookieHeader } = require('../lib/auth-context');

const currentAppVersion = resolveBuildAppVersion();
const versionApiBaseUrl = (process.env.SAMHAN_VERSION_API_BASE_URL || process.env.SAMHAN_API_BASE_URL || 'http://localhost:8080')
  .replace(/\/+$/, '');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const sessionEmail = readCookie(req.headers.cookie);
    const userEmail = sessionEmail || req.query.email || process.env.DEFAULT_USER_EMAIL || 'dev@samhan-air.com';
    const bootstrap = await code.bootstrap(userEmail);
    const authData = JSON.parse(bootstrap.authData || '{}');
    if (!sessionEmail && authData.authorized === true) {
      res.append('Set-Cookie', cookieHeader(userEmail));
    }
    res.render('index', { ...bootstrap, currentAppVersion, versionApiBaseUrl });
  } catch (e) {
    next(e);
  }
});

router.get('/healthz', (req, res) => {
  res.json({ ok: true, app: 'estimate-app', version: '2.0.0' });
});

module.exports = router;
