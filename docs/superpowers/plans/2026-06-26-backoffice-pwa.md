# 백오피스 PWA (Phase 1) 구현 계획

> **For agentic workers:** 본 계획은 Samhan-Public canonical 워크플로우(Codex 구현 → Opus↔Codex 듀얼리뷰 0수렴 → PM 자율머지)로 실행한다. spec=[2026-06-26-backoffice-pwa-design.md](../specs/2026-06-26-backoffice-pwa-design.md).

**Goal:** 데스크탑 백오피스 웹(`dist/web`)을 설치형 PWA로 — manifest·service worker(앱셸 precache)·아이콘·업데이트 prompt 통합. Electron 빌드 무영향.

**Architecture:** `vite-plugin-pwa`를 `vite.web.config.ts`(웹 빌드)에 full 적용, `electron.vite.config.ts` 렌더러에 `disable:true`로 적용(공유 `virtual:pwa-register` 모듈을 Electron서 no-op 해석). 앱셸 precache + `/api`·`/auth`·`/collab` NetworkOnly. 업데이트는 prompt(자동 reload 금지).

**Tech Stack:** Vite 5 · vite-plugin-pwa(Workbox) · React 19 · electron-vite · TypeScript.

## Global Constraints
- **데스크탑/Electron 무회귀**: PWA는 웹 빌드 한정. `npm run build`(electron-vite) 성공 + `out/renderer`에 SW/manifest 미주입.
- **오프라인=앱셸만**: `/api/**`·`/auth/**`·`/collab/**`=NetworkOnly(캐시 금지). 오프라인 데이터/쓰기 비범위.
- **업데이트=prompt**: `registerType:'prompt'`, `skipWaiting:false`, `clientsClaim:false`. 자동 reload 금지.
- **HTTPS 의존**: 실설치는 prod HTTPS(Phase 11). 본 계획=인프라+로컬(localhost) 검증.
- **FE only**: BE/Flyway 0. testid/핸들러 보존. 한국어 커밋, [FEAT]/[CHORE] prefix.
- 검증 명령은 `clients/desktop` cwd 기준.

## File Structure
- Modify `clients/desktop/package.json` — `vite-plugin-pwa` devDependency.
- Modify `clients/desktop/vite.web.config.ts` — VitePWA full(manifest+workbox).
- Modify `clients/desktop/electron.vite.config.ts:47` — renderer plugins에 `VitePWA({disable:true})`.
- Create `clients/desktop/src/renderer/vite-env.d.ts` — `virtual:pwa-register` 타입 참조.
- Create `clients/desktop/public/pwa-icon-source.svg` + 생성 `public/pwa-192.png`·`pwa-512.png`·`pwa-maskable-512.png`·`apple-touch-icon.png`.
- Modify `clients/desktop/src/renderer/index.html` — theme-color meta + apple-touch-icon link.
- Create `clients/desktop/src/renderer/components/common/PwaUpdatePrompt.tsx` — SW 등록 + 업데이트/오프라인 토스트.
- Modify `clients/desktop/src/renderer/main.tsx` — `<PwaUpdatePrompt/>` 마운트.

---

### Task 1: PWA 빌드 설정 (이중빌드 안전)

**Files:**
- Modify: `clients/desktop/package.json` (devDependencies)
- Modify: `clients/desktop/vite.web.config.ts`
- Modify: `clients/desktop/electron.vite.config.ts:47`
- Create: `clients/desktop/src/renderer/vite-env.d.ts`

**Interfaces:**
- Produces: `virtual:pwa-register`의 `registerSW`(웹=실동작, electron=no-op), `dist/web/{sw.js,manifest.webmanifest,workbox-*.js}`.

- [ ] **Step 1: 의존성 추가**

`clients/desktop` 에서: `npm install -D vite-plugin-pwa` (package.json devDependencies + package-lock 갱신).

- [ ] **Step 2: vite-env.d.ts 생성** (가상모듈 타입)

`clients/desktop/src/renderer/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
```

- [ ] **Step 3: vite.web.config.ts에 VitePWA 추가**

import 추가 `import { VitePWA } from 'vite-plugin-pwa'`. `plugins: [react()]` → 아래 추가:
```ts
plugins: [
  react(),
  VitePWA({
    registerType: 'prompt',
    injectRegister: null, // main.tsx에서 수동 등록
    includeAssets: ['pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png', 'apple-touch-icon.png'],
    manifest: {
      name: 'Samhan Public 백오피스',
      short_name: '삼한',
      lang: 'ko',
      description: '삼한 퍼블릭 사내 운영 백오피스',
      theme_color: '#2D77A8',      // --color-brand-500
      background_color: '#FFFFFF',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      icons: [
        { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      cleanupOutdatedCaches: true,
      skipWaiting: false,
      clientsClaim: false,
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/collab/],
      runtimeCaching: [
        {
          urlPattern: ({ url }) =>
            url.pathname.startsWith('/api/') ||
            url.pathname.startsWith('/auth/') ||
            url.pathname.startsWith('/collab/'),
          handler: 'NetworkOnly',
        },
      ],
    },
  }),
],
```

- [ ] **Step 4: electron.vite.config.ts 렌더러에 disable PWA** (가상모듈 no-op)

import `import { VitePWA } from 'vite-plugin-pwa'`. renderer `plugins: [react()]`(L47) → `plugins: [react(), VitePWA({ disable: true })]`. (SW 미생성, `virtual:pwa-register` 해석만 제공.)

- [ ] **Step 5: 웹 빌드 검증**

Run: `npm run build:web`
Expected: 성공 + `dist/web/manifest.webmanifest`·`dist/web/sw.js` 생성. 확인: `ls dist/web/sw.js dist/web/manifest.webmanifest`.

- [ ] **Step 6: Electron 빌드 무회귀 검증** (이중빌드 핵심)

Run: `npm run build` (= build:legacy + electron-vite build)
Expected: 성공(`virtual:pwa-register` 미해석 에러 없음). 확인: `out/renderer`에 `sw.js` 부재 — `ls out/renderer/sw.js` → No such file.

- [ ] **Step 7: typecheck + 커밋**

Run: `npm run typecheck` → EXIT 0.
```bash
git add clients/desktop/package.json clients/desktop/package-lock.json clients/desktop/vite.web.config.ts clients/desktop/electron.vite.config.ts clients/desktop/src/renderer/vite-env.d.ts
git commit -m "[FEAT] PWA 빌드 설정 — vite-plugin-pwa(웹 full + electron disable) 이중빌드 안전"
```

---

### Task 2: PWA 아이콘 + index.html 메타

**Files:**
- Create: `clients/desktop/public/pwa-icon-source.svg`, `pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`, `apple-touch-icon.png`
- Modify: `clients/desktop/src/renderer/index.html`

**Interfaces:**
- Consumes: Task1 manifest의 `icons`/`includeAssets` 파일명.

- [ ] **Step 1: 정사각 placeholder SVG 소스 생성**

`clients/desktop/public/pwa-icon-source.svg` (512×512, 브랜드색 rounded-rect + 흰색 "삼한" — print-logo 컨벤션대로 실 로고 교체 가능 주석):
```svg
<?xml version="1.0" encoding="UTF-8"?>
<!-- PWA placeholder 아이콘. 실 회사 로고 교체 시 동일 파일명 PNG 재생성. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#2D77A8"/>
  <text x="256" y="320" font-family="'Apple SD Gothic Neo','Malgun Gothic',sans-serif" font-size="200" font-weight="800" fill="#FFFFFF" text-anchor="middle">삼한</text>
</svg>
```

- [ ] **Step 2: PNG 192/512/maskable/apple-touch 생성**

소스 SVG → PNG. `sharp` 가용 시 1회 스크립트:
```js
// scratch (커밋 불요): node -e
const sharp = require('sharp'); const s='clients/desktop/public/pwa-icon-source.svg';
(async()=>{ for (const [out,size] of [['pwa-192',192],['pwa-512',512],['pwa-maskable-512',512],['apple-touch-icon',180]])
  await sharp(s).resize(size,size).png().toFile(`clients/desktop/public/${out}.png`); })();
```
sharp 미가용 시: ImageMagick `convert -background none -resize 512x512 pwa-icon-source.svg pwa-512.png`(192/180 동일). maskable=동일 512(rect가 이미 safe-zone). 확인: `ls clients/desktop/public/pwa-*.png clients/desktop/public/apple-touch-icon.png`.

- [ ] **Step 3: index.html 메타 추가**

`clients/desktop/src/renderer/index.html` `<head>`에 (manifest link는 VitePWA 자동 주입):
```html
<meta name="theme-color" content="#2D77A8" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

- [ ] **Step 4: 빌드 검증 + 커밋**

Run: `npm run build:web` → `dist/web`에 아이콘 4종 복사 + manifest icons 참조 확인 (`grep -o 'pwa-512.png' dist/web/manifest.webmanifest`).
```bash
git add clients/desktop/public/pwa-icon-source.svg clients/desktop/public/pwa-192.png clients/desktop/public/pwa-512.png clients/desktop/public/pwa-maskable-512.png clients/desktop/public/apple-touch-icon.png clients/desktop/src/renderer/index.html
git commit -m "[FEAT] PWA 아이콘(정사각 placeholder)+index.html theme-color/apple-touch-icon"
```

---

### Task 3: SW 등록 + 업데이트 prompt UI

**Files:**
- Create: `clients/desktop/src/renderer/components/common/PwaUpdatePrompt.tsx`
- Modify: `clients/desktop/src/renderer/main.tsx`

**Interfaces:**
- Consumes: `virtual:pwa-register`의 `registerSW`(Task1).
- Produces: `<PwaUpdatePrompt/>` 전역 토스트(새 버전 새로고침 / 오프라인 준비).

- [ ] **Step 1: PwaUpdatePrompt 컴포넌트 생성**

`clients/desktop/src/renderer/components/common/PwaUpdatePrompt.tsx`:
```tsx
/**
 * PWA service worker 등록 + 업데이트 prompt 토스트.
 * 새 버전(새 SW) 감지 시 자동 reload 금지 — 사용자가 안전 시점에 "새로고침" 클릭(폼 미저장 손실 방지).
 * Electron 빌드에선 VitePWA disable → registerSW no-op이라 토스트 미노출.
 */
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() { setNeedRefresh(true) },
      onOfflineReady() { setOfflineReady(true) },
    })
    setUpdateSW(() => update)
  }, [])

  if (!needRefresh && !offlineReady) return null
  return (
    <div role="status" className="pwa-toast" style={{ position: 'fixed', insetInlineEnd: 16, insetBlockEnd: 16, zIndex: 9999, background: 'var(--surface-card,#fff)', border: '1px solid var(--color-border,#D6DCE3)', borderRadius: 8, padding: '12px 16px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', display: 'flex', gap: 12, alignItems: 'center', maxWidth: 360 }}>
      <span style={{ fontSize: 13 }}>
        {needRefresh ? '새 버전이 있습니다.' : '오프라인에서 사용할 수 있습니다.'}
      </span>
      {needRefresh ? (
        <button type="button" onClick={() => updateSW?.(true)} style={{ fontWeight: 700, color: 'var(--color-brand-500,#2D77A8)' }}>새로고침</button>
      ) : null}
      <button type="button" aria-label="닫기" onClick={() => { setNeedRefresh(false); setOfflineReady(false) }}>✕</button>
    </div>
  )
}
```

- [ ] **Step 2: main.tsx에 마운트**

`clients/desktop/src/renderer/main.tsx`의 render를 수정 (App 옆 형제):
```tsx
import { PwaUpdatePrompt } from './components/common/PwaUpdatePrompt'
// ...
createRoot(container).render(
  <StrictMode>
    <App />
    <PwaUpdatePrompt />
  </StrictMode>,
)
```

- [ ] **Step 3: typecheck + 빌드 검증**

Run: `npm run typecheck` → EXIT 0. `npm run build:web` 성공 + `npm run build`(electron) 성공(no-op registerSW). 확인: 두 빌드 green.

- [ ] **Step 4: 커밋**

```bash
git add clients/desktop/src/renderer/components/common/PwaUpdatePrompt.tsx clients/desktop/src/renderer/main.tsx
git commit -m "[FEAT] PWA SW 등록 + 업데이트 prompt 토스트(자동 reload 금지)"
```

---

### Task 4: 라이브 PWA QA + Electron 무회귀 검증

**Files:** (검증 전용, 코드 변경 없음 — 결함 발견 시 해당 Task 보강)

- [ ] **Step 1: 로컬 PWA preview 기동**

Run: `npm run build:web` 후 `npx vite preview --config vite.web.config.ts --port 5175`. (localhost=secure context → SW 동작.)

- [ ] **Step 2: Lighthouse PWA / 설치 가능성**

Chrome로 `http://localhost:5175` → DevTools Application 탭: Manifest 유효(name/icons/display)·Service Worker 등록(activated)·"설치 가능" 확인. (또는 `npx lighthouse http://localhost:5175 --only-categories=pwa --quiet` installable PASS.)

- [ ] **Step 3: 오프라인 앱셸**

DevTools Network offline 토글 → 새로고침 → **앱 셸 로드(흰화면 아님)** + 데이터 호출은 실패(network-only 의도) 확인.

- [ ] **Step 4: Electron 무회귀 (핵심)**

Run: `npm run build` → 성공. 확인: `out/renderer`에 `sw.js`/`workbox-*` 부재. (PWA 웹 한정.) 가능하면 Electron 앱 기동해 정상 동작 1컷.

- [ ] **Step 5: 결과 기록**

QA 결과(Lighthouse PWA·설치·오프라인 앱셸·Electron 무회귀) PR에 게시. 캡처 가능 시 SendUserFile.

---

## Self-Review (계획 vs spec)
- **spec §2 아키텍처**(vite-plugin-pwa 웹 전용·NetworkOnly) → Task1 ✓. **이중빌드**(electron disable) → Task1 Step4 ✓.
- **§3 컴포넌트**(manifest/SW/등록+prompt/index.html) → Task1·2·3 ✓.
- **§4 prompt 업데이트**(skipWaiting:false·자동 reload 금지) → Task1 Step3 + Task3 ✓.
- **§5 HTTPS 제약**(로컬 검증) → Task4 ✓.
- **§6 아이콘**(정사각 placeholder) → Task2 ✓.
- **§7 테스트**(Lighthouse/설치/오프라인/Electron 무회귀) → Task4 ✓.
- **§8 비범위**(오프라인데이터·푸시·Capacitor·버전팝업) → 계획 미포함 ✓.
- 타입 일관: `registerSW`(virtual:pwa-register)·`PwaUpdatePrompt` 명칭 Task1/3 정합.
- 플레이스홀더: 없음(설정·코드 전부 구체). 아이콘 PNG 생성은 sharp/ImageMagick 대안 명시.
