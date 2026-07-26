import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
// _local 격리(2026-07-27 재수렴 4차 X1 — qa/playwright 트리 관할 편입).
const outDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/d-ax-13-auth-contract/screenshots'));

await fs.mkdir(outDir, { recursive: true });

const styles = `
  :root {
    --bg: #eef4f3;
    --surface: #ffffff;
    --panel: #f8fbfa;
    --ink: #142124;
    --muted: #52666b;
    --line: #cfe0dd;
    --brand: #2a9d8f;
    --brand-dark: #147569;
    --blue: #1d4ed8;
    --blue-soft: #dbeafe;
    --green: #047857;
    --green-soft: #d1fae5;
    --amber: #b45309;
    --amber-soft: #fef3c7;
    --red: #b91c1c;
    --red-soft: #fee2e2;
    --code: #0f172a;
    --code-text: #d1fae5;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    width: 1200px;
    height: 820px;
    background: var(--bg);
    color: var(--ink);
    font-family: "Malgun Gothic", "Pretendard", Arial, sans-serif;
  }
  .frame {
    width: 1200px;
    height: 820px;
    padding: 44px;
    display: grid;
    grid-template-columns: 410px 1fr;
    gap: 34px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 18px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, .12);
  }
  .summary {
    padding: 32px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 18px;
  }
  .detail {
    padding: 30px;
    overflow: hidden;
  }
  .badge {
    display: inline-flex;
    width: max-content;
    padding: 7px 12px;
    border-radius: 999px;
    color: var(--brand-dark);
    background: #e3f4f0;
    font-size: 16px;
    font-weight: 800;
  }
  h1 {
    margin: 0;
    font-size: 36px;
    line-height: 1.22;
    letter-spacing: 0;
  }
  h2 {
    margin: 0 0 18px;
    font-size: 25px;
    line-height: 1.28;
    letter-spacing: 0;
  }
  p {
    margin: 0;
    color: var(--muted);
    font-size: 19px;
    line-height: 1.55;
  }
  .kv {
    display: grid;
    gap: 12px;
  }
  .row {
    display: grid;
    grid-template-columns: 170px 1fr;
    gap: 14px;
    align-items: start;
    padding: 12px 0;
    border-bottom: 1px solid #e2ece9;
    font-size: 18px;
  }
  .row:last-child { border-bottom: 0; }
  .key { color: #667a7f; font-weight: 700; }
  .value { color: var(--ink); font-weight: 800; }
  .pill {
    display: inline-flex;
    align-items: center;
    width: max-content;
    padding: 6px 10px;
    border-radius: 7px;
    color: var(--blue);
    background: var(--blue-soft);
    font-weight: 800;
    font-size: 15px;
  }
  .pill.green { color: var(--green); background: var(--green-soft); }
  .pill.amber { color: var(--amber); background: var(--amber-soft); }
  .pill.red { color: var(--red); background: var(--red-soft); }
  .code {
    margin-top: 18px;
    padding: 20px;
    border-radius: 12px;
    background: var(--code);
    color: var(--code-text);
    font-family: Consolas, "D2Coding", monospace;
    font-size: 19px;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .mini {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 16px;
  }
  .mini-title {
    font-size: 17px;
    font-weight: 800;
    margin-bottom: 8px;
  }
  .mini p { font-size: 16px; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 17px;
  }
  th, td {
    text-align: left;
    padding: 12px 10px;
    border-bottom: 1px solid #e2ece9;
    vertical-align: top;
  }
  th {
    color: #43565b;
    background: #edf6f4;
    font-size: 16px;
  }
  td strong { color: var(--ink); }
  .checklist {
    margin-top: 18px;
    display: grid;
    gap: 12px;
  }
  .check {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 13px 14px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 17px;
  }
  .mark {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    color: #fff;
    background: var(--green);
    font-weight: 900;
  }
`;

const pages = [
  {
    file: '01-contract-overview.png',
    badge: 'D-AX-13 / Contract',
    title: '/auth/me와 login 응답의 공개 식별자 계약을 한 번에 정렬',
    summary: 'UUID 는 내부 저장용으로만 유지하고, 화면에는 admin loginId/fullName 또는 driver driverCode/phoneNumber 만 쓰도록 BE/FE 계약을 맞췄습니다.',
    detail: `
      <h2>변경 전후 계약 비교</h2>
      <table>
        <thead><tr><th>Endpoint</th><th>변경 전</th><th>변경 후</th></tr></thead>
        <tbody>
          <tr><td><strong>POST /auth/admin/login</strong></td><td>token, role, expiresAt</td><td>token, role, expiresAt, <strong>loginId, fullName</strong></td></tr>
          <tr><td><strong>POST /auth/driver/login</strong></td><td>token, role, expiresAt</td><td>token, role, expiresAt, <strong>driverCode, phoneNumber</strong></td></tr>
          <tr><td><strong>POST /auth/refresh</strong></td><td>token, role, expiresAt</td><td>회전 후에도 공개 식별자 보존</td></tr>
          <tr><td><strong>GET /auth/me</strong></td><td>userId, role</td><td>role 별 공개 식별자 포함</td></tr>
        </tbody>
      </table>
      <div class="checklist">
        <div class="check"><span class="mark">✓</span><span>Desktop LoginPage 가 fullName undefined 를 저장하지 않음</span><span class="pill green">PASS</span></div>
        <div class="check"><span class="mark">✓</span><span>Mobile PhoneLoginScreen 이 driverCode/phoneNumber 를 즉시 저장 가능</span><span class="pill green">PASS</span></div>
        <div class="check"><span class="mark">✓</span><span>UUID 는 화면 식별자로 확장하지 않음</span><span class="pill green">GUARD</span></div>
      </div>
    `,
  },
  {
    file: '02-admin-login-response.png',
    badge: 'Admin Login',
    title: '관리자 로그인 응답에 loginId/fullName 포함',
    summary: '데스크톱은 로그인 직후 token 을 임시 저장하고 /auth/me 를 호출합니다. login 응답도 같은 identity 를 제공해 refresh와 fallback 흐름이 안정적입니다.',
    detail: `
      <h2>POST /auth/admin/login 응답 예시</h2>
      <div class="code">{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "opaque.refresh",
  "role": "AROLOGIS_MASTER",
  "expiresAt": "2026-05-15T12:30:00Z",
  "loginId": "itadmin",
  "fullName": "IT Admin",
  "driverCode": null,
  "phoneNumber": null
}</div>
      <div class="grid2" style="margin-top:18px;">
        <div class="mini"><div class="mini-title">Desktop 저장값</div><p>loginId = itadmin<br>fullName = IT Admin<br>role = AROLOGIS_MASTER</p></div>
        <div class="mini"><div class="mini-title">UUID 노출 정책</div><p>userId 는 /auth/me 로만 받아 내부 저장에 사용하고 화면에는 표시하지 않습니다.</p></div>
      </div>
    `,
  },
  {
    file: '03-auth-me-admin.png',
    badge: 'GET /auth/me',
    title: '관리자 /auth/me는 DB에서 현재 공개 프로필을 재조회',
    summary: 'JwtFilter 가 주입한 X-User-Id/X-User-Role 을 기준으로 AdminUser 를 조회해 role mismatch와 삭제 사용자를 차단합니다.',
    detail: `
      <h2>Admin /auth/me 응답</h2>
      <div class="code">{
  "userId": "internal-uuid",
  "role": "AROLOGIS_MASTER",
  "loginId": "itadmin",
  "fullName": "IT Admin",
  "driverCode": null,
  "phoneNumber": null
}</div>
      <div class="kv" style="margin-top:20px;">
        <div class="row"><span class="key">조회 경계</span><span class="value">AuthIdentityService -> AdminUserRepository.findById</span></div>
        <div class="row"><span class="key">보호 조건</span><span class="value">DB role 과 JWT role 불일치 시 401</span></div>
        <div class="row"><span class="key">클라이언트 영향</span><span class="value">LoginPage setAuth 에 undefined 유입 차단</span></div>
      </div>
    `,
  },
  {
    file: '04-driver-login-response.png',
    badge: 'Driver Login',
    title: '기사 passwordless 로그인 응답에 driverCode/phoneNumber 포함',
    summary: '모바일은 로그인 성공 직후 driverCode 를 dashboard, GPS, signature 후속 흐름의 공개 식별자로 사용합니다.',
    detail: `
      <h2>POST /auth/driver/login 응답 예시</h2>
      <div class="code">{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "opaque.refresh",
  "role": "AROLOGIS_DRIVER",
  "expiresAt": "2026-05-15T12:30:00Z",
  "loginId": null,
  "fullName": null,
  "driverCode": "ITD001",
  "phoneNumber": "01011112222"
}</div>
      <div class="grid2" style="margin-top:18px;">
        <div class="mini"><div class="mini-title">Mobile 저장값</div><p>driverCode = ITD001<br>phoneNumber = 01011112222</p></div>
        <div class="mini"><div class="mini-title">후속 화면</div><p>Dashboard / GPS / signature 전송에서 UUID 대신 driverCode 를 사용합니다.</p></div>
      </div>
    `,
  },
  {
    file: '05-auth-me-driver.png',
    badge: 'GET /auth/me',
    title: '기사 /auth/me도 driverCode/phoneNumber 계약을 공유',
    summary: 'driver 토큰의 sub UUID 로 Driver 를 다시 조회해 공개 식별자를 채웁니다. 삭제된 기사는 repository 경계에서 제외됩니다.',
    detail: `
      <h2>Driver /auth/me 응답</h2>
      <div class="code">{
  "userId": "internal-uuid",
  "role": "AROLOGIS_DRIVER",
  "loginId": null,
  "fullName": null,
  "driverCode": "ITD001",
  "phoneNumber": "01011112222"
}</div>
      <div class="kv" style="margin-top:20px;">
        <div class="row"><span class="key">조회 경계</span><span class="value">AuthIdentityService -> DriverRepository.findById</span></div>
        <div class="row"><span class="key">화면 식별자</span><span class="value">driverCode / phoneNumber</span></div>
        <div class="row"><span class="key">UUID 정책</span><span class="value">응답에는 userId 가 있으나 화면 표시는 금지</span></div>
      </div>
    `,
  },
  {
    file: '06-refresh-rotation-identity.png',
    badge: 'Refresh',
    title: 'refresh rotation 후에도 공개 식별자 보존',
    summary: 'access/refresh token 회전 시 admin과 driver 모두 현재 DB row에서 식별자를 다시 채워 내려줍니다.',
    detail: `
      <h2>회전 응답 보장</h2>
      <div class="grid2">
        <div class="mini">
          <div class="mini-title">Admin refresh</div>
          <p>role = AROLOGIS_MANAGER<br>loginId = admin<br>fullName = DB name</p>
        </div>
        <div class="mini">
          <div class="mini-title">Driver refresh</div>
          <p>role = AROLOGIS_DRIVER<br>driverCode = D001<br>phoneNumber = 01012345678</p>
        </div>
      </div>
      <div class="code">RefreshTokenServiceTest
✓ normal_rotation_revokes_old_and_issues_new
✓ driver_rotation_keeps_public_driver_identity</div>
    `,
  },
  {
    file: '07-frontend-store-flow.png',
    badge: 'FE Store',
    title: 'desktop/mobile refresh 저장 흐름도 새 필드를 보존',
    summary: 'refresh 응답이 identity 를 주면 최신값을 반영하고, null이면 기존 store 값을 유지하도록 조정했습니다.',
    detail: `
      <h2>클라이언트 저장 로직</h2>
      <table>
        <thead><tr><th>Client</th><th>변경 파일</th><th>보장</th></tr></thead>
        <tbody>
          <tr><td><strong>arologis-desktop</strong></td><td>api/auth.ts<br>api/client.ts<br>LoginPage.tsx</td><td>loginId/fullName fallback + refresh 반영</td></tr>
          <tr><td><strong>arologis-mobile</strong></td><td>api/auth.ts<br>api/client.ts</td><td>driverCode/phoneNumber 타입화 + refresh 보존</td></tr>
        </tbody>
      </table>
      <div class="checklist">
        <div class="check"><span class="mark">✓</span><span>@samhan/arologis-desktop typecheck</span><span class="pill green">PASS</span></div>
        <div class="check"><span class="mark">✓</span><span>@samhan/arologis-mobile typecheck</span><span class="pill green">PASS</span></div>
      </div>
    `,
  },
  {
    file: '08-verification-matrix.png',
    badge: 'Verification',
    title: 'D-AX-13 검증 매트릭스',
    summary: '테스트는 RED 단계에서 새 필드 누락 컴파일 실패를 확인한 뒤, 구현 후 unit/IT/typecheck를 순서대로 통과시켰습니다.',
    detail: `
      <h2>실행한 검증</h2>
      <div class="checklist">
        <div class="check"><span class="mark">✓</span><span>RED: AuthTokenResponse/MeResponse 새 필드 메서드 없음으로 compileTestJava 실패</span><span class="pill amber">CONFIRMED</span></div>
        <div class="check"><span class="mark">✓</span><span>AdminLoginServiceTest / DriverLoginServiceTest / RefreshTokenServiceTest</span><span class="pill green">PASS</span></div>
        <div class="check"><span class="mark">✓</span><span>ArologisAdminAuthIT / ArologisDriverAuthIT</span><span class="pill green">PASS</span></div>
        <div class="check"><span class="mark">✓</span><span>clients/arologis-desktop npm run typecheck</span><span class="pill green">PASS</span></div>
        <div class="check"><span class="mark">✓</span><span>clients/arologis-mobile npm run typecheck</span><span class="pill green">PASS</span></div>
      </div>
    `,
  },
];

function html(page) {
  return `<!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <style>${styles}</style>
      </head>
      <body>
        <main class="frame">
          <section class="summary card">
            <span class="badge">${page.badge}</span>
            <h1>${page.title}</h1>
            <p>${page.summary}</p>
          </section>
          <section class="detail card">${page.detail}</section>
        </main>
      </body>
    </html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 1 });

for (const item of pages) {
  await page.setContent(html(item), { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(outDir, item.file), fullPage: false });
}

await browser.close();

console.log(`Generated ${pages.length} D-AX-13 auth contract screenshots in ${outDir}`);
