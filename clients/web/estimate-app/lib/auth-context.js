'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'estimate_auth';
// 운영에서는 모든 estimate-app 인스턴스에 동일한 ESTIMATE_AUTH_SECRET을 주입한다.
// 미설정 로컬 실행은 프로세스별 무작위 키를 사용해 소스에 알려진 위조 키를 만들지 않는다.
const AUTH_SECRET = process.env.ESTIMATE_AUTH_SECRET || crypto.randomBytes(32).toString('hex');

function sign(value) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('base64url');
}

function serialize(email) {
  const value = Buffer.from(String(email).trim(), 'utf8').toString('base64url');
  return `${value}.${sign(value)}`;
}

function deserialize(raw) {
  if (!raw) return null;
  const [value, signature] = String(raw).split('.');
  if (!value || !signature) return null;
  const expected = sign(value);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length
      || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  const email = Buffer.from(value, 'base64url').toString('utf8').trim();
  return email || null;
}

function readCookie(header, name = COOKIE_NAME) {
  const item = String(header || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return item ? deserialize(item.slice(name.length + 1)) : null;
}

function cookieHeader(email) {
  return `${COOKIE_NAME}=${serialize(email)}; Path=/; HttpOnly; SameSite=Lax`;
}

module.exports = { COOKIE_NAME, readCookie, cookieHeader };
