/**
 * google.script.run RPC 호환 endpoint.
 *
 * legacy index.html 의 11 RPC 호출 사이트 (line 8726/10084/12879/13218/13942/
 * 15049/15091/15228/15506/16434/16717) 가 사용하는 패턴:
 *
 *   google.script.run
 *     .withSuccessHandler(cb)
 *     .withFailureHandler(cb)
 *     .fnName(args)
 *
 * 클라이언트 측 shim (views/index.ejs 안 inline script) 이 위 패턴을 가로채
 * 본 endpoint 로 fetch POST 한다 — `POST /rpc/:fnName` body=`{ args: [...] }`.
 *
 * 본 라우터는 lib/code.js 의 export 된 함수를 dispatch 하고 결과를 JSON 응답.
 */

'use strict';

const express = require('express');
const code = require('../lib/code');
const { readCookie } = require('../lib/auth-context');

const router = express.Router();

router.post('/:fnName', async (req, res) => {
  const fnName = req.params.fnName;
  const args = Array.isArray(req.body && req.body.args) ? req.body.args : [];

  const fn = code[fnName];
  if (typeof fn !== 'function') {
    return res.status(404).json({
      ok: false,
      error: `Unknown RPC: ${fnName}`,
      available: Object.keys(code).filter((k) => typeof code[k] === 'function'),
    });
  }

  try {
    const identityBound = new Set(['saveQuoteSnapshot']);
    const authenticatedEmail = identityBound.has(fnName) ? readCookie(req.headers.cookie) : null;
    if (identityBound.has(fnName) && !authenticatedEmail) {
      return res.status(401).json({ ok: false, error: '인증된 사용자 세션이 필요합니다' });
    }
    const callArgs = authenticatedEmail ? [...args, authenticatedEmail] : args;
    const result = await Promise.resolve(fn.apply(null, callArgs));
    return res.json({ ok: true, result });
  } catch (err) {
    console.error(`[rpc] ${fnName} 에러:`, err);
    const upstreamStatus = Number(err && (err.statusCode || (err.response && err.response.status)));
    const status = Number.isInteger(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus < 600
      ? upstreamStatus : 500;
    return res.status(status).json({ ok: false, error: String(err.message || err) });
  }
});

module.exports = router;
