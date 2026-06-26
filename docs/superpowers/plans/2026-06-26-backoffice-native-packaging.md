# 백오피스 네이티브 패키징 (Capacitor) Native Phase 1 — Implementation Plan

> **For agentic workers:** 본 레포는 canonical 워크플로우(Opus 기획 → Codex 구현 → 순차 듀얼리뷰 0수렴 → PM 머지)를 따른다. 본 plan은 Codex 구현 브리프 + PM 실행 스텝(스캐폴드 생성)으로 구성된다. 체크박스(`- [ ]`)로 추적.

**Goal:** desktop 백오피스 renderer 웹 빌드(`dist/web`)를 Capacitor 네이티브 셸(Android 우선)로 래핑하는 파운데이션을 구축한다 — 실 APK/스토어 배포는 빌드 env 확보 후(정직 deferral).

**Architecture:** "one renderer, multiple targets"(Electron · PWA-web · **Capacitor-native**) 패턴 확장. 같은 `clients/desktop` 렌더러를 4번째 vite config(`vite.capacitor.config.ts`, SW 미주입)로 `dist/capacitor`에 빌드 → Capacitor가 래핑. 인증은 기존 `authProvider` 추상화에 `capacitorAuthProvider`(Bearer + `@capacitor/preferences`, Electron 경로 미러) 분기를 추가.

**Tech Stack:** Capacitor 6.x+(`@capacitor/core`·`cli`·`android`·`preferences`), Vite 5, React 18, TypeScript 5.6, vitest.

## Global Constraints
- 변경 범위 = `clients/desktop`만. **Electron 빌드(`build`)·PWA-web 빌드(`build:web` 실 SW)·dev/mock(mock 회귀 hard gate) 전부 무회귀.**
- **백엔드 무변경** — Bearer 토큰은 Electron 경로가 이미 사용하는 검증된 경로(서버 변경 불필요).
- `dist/capacitor`는 `dist/web`(PWA, SW 포함)과 **별도 디렉토리**(SW 충돌 방지).
- 플랫폼 감지 우선순위: **Electron(`window.samhanAuth`) → Capacitor(`Capacitor.isNativePlatform()`) → Web(쿠키)**.
- **실 APK/IPA 빌드·에뮬 실행·스토어 배포·iOS 스캐폴드 = 본 Phase 비범위**(빌드 env 미확보 → 정직 보고, 가짜 빌드 주장 금지).
- 한국어 Javadoc/주석 의무. 신규 코드 함수 단위 문서화.
- 실행 분담: **PM이 `npm install`·`npx cap add android`·`npx cap sync` 대행**(네트워크/네이티브 도구 — Codex 샌드박스 제약). Codex는 config/provider/test/문서 코드.

---

### Task 1: Capacitor 설정 + capacitor 전용 web 빌드

**Files:**
- Modify: `clients/desktop/package.json` (deps + scripts)
- Create: `clients/desktop/capacitor.config.ts`
- Create: `clients/desktop/vite.capacitor.config.ts`
- Modify: `clients/desktop/.gitignore` (또는 레포 루트 — android 빌드 산출물·.gradle)

**Interfaces:**
- Produces: `npm run build:capacitor` → `clients/desktop/dist/capacitor/`(SW 없는 SPA). `capacitor.config.ts`의 `webDir='dist/capacitor'`.

- [ ] **Step 1 (PM): Capacitor deps 설치** — `clients/desktop`에서
```bash
cd clients/desktop
npm install --save @capacitor/core @capacitor/preferences
npm install --save-dev @capacitor/cli @capacitor/android
```
package.json `dependencies`에 `@capacitor/core`·`@capacitor/preferences`, `devDependencies`에 `@capacitor/cli`·`@capacitor/android` 추가 확인(lock 정합).

- [ ] **Step 2 (Codex): `capacitor.config.ts` 작성**
```ts
import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 네이티브 셸 설정 (Native Phase 1, Android 우선).
 * webDir = dist/capacitor (PWA dist/web 와 분리 — SW 미포함 빌드).
 * server.cleartext = 개발 중 LAN/localhost 게이트웨이(http) 허용. 실기기/실배포는
 * HTTPS 게이트웨이(Phase 11/N2) 필요 — 그때 cleartext 제거.
 */
const config: CapacitorConfig = {
  appId: 'com.samhanair.backoffice',
  appName: '삼한 백오피스',
  webDir: 'dist/capacitor',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
}

export default config
```

- [ ] **Step 3 (Codex): `vite.capacitor.config.ts` 작성** — `vite.web.config.ts` 미러 + **VitePWA 제거**(SW 미주입) + `VITE_PLATFORM='capacitor'` + outDir `dist/capacitor`
```ts
/**
 * Capacitor 네이티브 셸용 Vite 빌드 — 웹 빌드(vite.web.config) 미러이되
 * vite-plugin-pwa(service worker) 미주입. 네이티브 WebView(capacitor://localhost)는
 * 자체 서빙하므로 SW 불요·간섭 위험(dev stub 과 동일 사유). dist/capacitor 산출.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, 'public'),
  base: '',
  resolve: { alias: { '@renderer': resolve(__dirname, 'src/renderer') } },
  define: {
    'import.meta.env.VITE_PLATFORM': JSON.stringify('capacitor'),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
      process.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080',
    ),
    'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'production'),
  },
  build: {
    outDir: resolve(__dirname, 'dist/capacitor'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
  },
})
```
> ⚠️ `base: ''`(상대경로) — capacitor://localhost 에서 절대경로(`/assets/...`)가 깨지지 않도록 상대 base 사용(웹은 `'/'`).

- [ ] **Step 4 (Codex): package.json 스크립트 추가**
```jsonc
"build:capacitor": "vite build --config vite.capacitor.config.ts",
"cap:sync": "npm run build:capacitor && cap sync android"
```

- [ ] **Step 5 (Codex): `.gitignore` — android 빌드 산출물 제외** (android 프로젝트 자체는 Task 4에서 커밋, 빌드 산출물만 제외)
```gitignore
# Capacitor / Android 빌드 산출물
clients/desktop/dist/capacitor/
clients/desktop/android/.gradle/
clients/desktop/android/app/build/
clients/desktop/android/build/
clients/desktop/android/local.properties
clients/desktop/android/.idea/
clients/desktop/android/app/src/main/assets/public/
```

- [ ] **Step 6 (PM): build:capacitor 검증**
```bash
cd clients/desktop && npm run build:capacitor
```
Expected: `dist/capacitor/index.html` + assets 생성, **`sw.js`/`workbox-*.js` 미생성**(SW 없음), `manifest.webmanifest` 미생성. 상대경로 asset 참조.

- [ ] **Step 7: Commit**
```bash
git add clients/desktop/package.json clients/desktop/package-lock.json clients/desktop/capacitor.config.ts clients/desktop/vite.capacitor.config.ts .gitignore
git commit -m "feat(native): Capacitor 설정 + capacitor 전용 web 빌드(dist/capacitor, SW 미주입)"
```

---

### Task 2: `capacitorAuthProvider` + 플랫폼 감지 (TDD)

**Files:**
- Create: `clients/desktop/src/renderer/auth/capacitorAuthProvider.ts`
- Modify: `clients/desktop/src/renderer/auth/authProvider.ts` (감지 + 셀렉터)
- Test: `clients/desktop/src/renderer/auth/__tests__/capacitorAuthProvider.test.ts`

**Interfaces:**
- Consumes: `AuthProvider`·`SessionInfo` (authProvider.ts), `LoginResponse` (api/auth).
- Produces: `createCapacitorAuthProvider(): AuthProvider`, `isCapacitorPlatform: boolean` (authProvider.ts export).

- [ ] **Step 1 (Codex): 실패 테스트 작성** `__tests__/capacitorAuthProvider.test.ts` — `@capacitor/preferences` mock
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LoginResponse } from '../../api/auth'

const store = new Map<string, string>()
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { store.set(key, value) }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => { store.delete(key) }),
  },
}))

import { createCapacitorAuthProvider } from '../capacitorAuthProvider'

const login: LoginResponse = {
  token: 'CAPJWT', userId: 'u-cap', role: 'MANAGER',
  displayName: '캡 매니저', partnerCode: 'P300',
  groups: [{ id: 'g-cap', name: '캡그룹', builtin: false }],
}

describe('capacitorAuthProvider — Bearer + Preferences 저장', () => {
  beforeEach(() => store.clear())

  it('establishSession 저장 후 getAuthHeaders 는 Bearer, getSession 은 토큰 제외 식별정보', async () => {
    const p = createCapacitorAuthProvider()
    await p.establishSession(login)
    expect(await p.getAuthHeaders()).toEqual({ Authorization: 'Bearer CAPJWT' })
    const s = await p.getSession()
    expect(s).toMatchObject({ userId: 'u-cap', role: 'MANAGER', fullName: '캡 매니저', partnerCode: 'P300' })
    expect((s as Record<string, unknown>).token).toBeUndefined()
  })

  it('미저장 시 getAuthHeaders 빈 객체, getSession null', async () => {
    const p = createCapacitorAuthProvider()
    expect(await p.getAuthHeaders()).toEqual({})
    expect(await p.getSession()).toBeNull()
  })

  it('bootstrap 은 저장 세션을 복원한다', async () => {
    const p = createCapacitorAuthProvider()
    await p.establishSession(login)
    await expect(p.bootstrap()).resolves.toMatchObject({ userId: 'u-cap' })
  })

  it('clearSession 은 저장 토큰/세션을 비운다', async () => {
    const p = createCapacitorAuthProvider()
    await p.establishSession(login)
    await p.clearSession()
    expect(await p.getSession()).toBeNull()
    expect(await p.getAuthHeaders()).toEqual({})
  })
})
```

- [ ] **Step 2 (PM): 테스트 실패 확인**
```bash
cd clients/desktop && npx vitest run src/renderer/auth/__tests__/capacitorAuthProvider.test.ts
```
Expected: FAIL ("capacitorAuthProvider" 미존재).

- [ ] **Step 3 (Codex): `capacitorAuthProvider.ts` 구현** — electronAuthProvider Bearer 미러, 저장소만 Preferences
```ts
/**
 * Capacitor(네이티브 WebView) 인증 구현 — Bearer 토큰 + @capacitor/preferences 저장.
 *
 * 네이티브 WebView origin(capacitor://localhost)에서 :8080 게이트웨이로 httpOnly 쿠키가
 * cross-origin 전달되지 않으므로(특히 iOS WKWebView), 웹의 쿠키 경로 대신 **Electron 과
 * 동일한 Bearer 경로**를 사용한다. 토큰/식별정보는 Preferences 에 JSON 으로 저장한다.
 * (N4 에서 @capacitor-community/secure-storage 로 승격 예정.)
 */
import { Preferences } from '@capacitor/preferences'
import type { AuthProvider, SessionInfo } from './authProvider'
import type { LoginResponse } from '../api/auth'

const STORAGE_KEY = 'samhan.auth.snapshot'

interface CapacitorAuthSnapshot extends SessionInfo {
  token: string
}

async function readSnapshot(): Promise<CapacitorAuthSnapshot | null> {
  const { value } = await Preferences.get({ key: STORAGE_KEY })
  if (!value) return null
  try {
    return JSON.parse(value) as CapacitorAuthSnapshot
  } catch {
    return null
  }
}

function toSessionInfo(snap: CapacitorAuthSnapshot | null): SessionInfo | null {
  if (!snap) return null
  const { token: _token, ...session } = snap
  return session
}

/**
 * Capacitor 용 {@link AuthProvider} 를 생성한다(네이티브 플랫폼에서 선택).
 */
export function createCapacitorAuthProvider(): AuthProvider {
  return {
    async getSession(): Promise<SessionInfo | null> {
      return toSessionInfo(await readSnapshot())
    },

    async getAuthHeaders(): Promise<Record<string, string>> {
      const snap = await readSnapshot()
      return snap?.token ? { Authorization: `Bearer ${snap.token}` } : {}
    },

    async establishSession(login: LoginResponse): Promise<void> {
      const snapshot: CapacitorAuthSnapshot = {
        token: login.token,
        userId: login.userId,
        role: login.role,
        fullName: login.displayName,
        partnerCode: login.partnerCode,
        groups: login.groups,
      }
      await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(snapshot) })
    },

    async clearSession(): Promise<void> {
      await Preferences.remove({ key: STORAGE_KEY })
    },

    async bootstrap(): Promise<SessionInfo | null> {
      return toSessionInfo(await readSnapshot())
    },
  }
}
```

- [ ] **Step 4 (Codex): `authProvider.ts` — 감지 + 셀렉터 확장**
```ts
// import 추가
import { createCapacitorAuthProvider } from './capacitorAuthProvider'
import { Capacitor } from '@capacitor/core'

/**
 * Capacitor 네이티브 플랫폼 여부 — @capacitor/core 런타임 감지.
 * 웹/Electron 에서는 false(웹=쿠키, Electron=IPC 우선).
 */
export const isCapacitorPlatform: boolean =
  typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform()

// getAuthProvider() 셀렉터 교체 (electron → capacitor → web)
export function getAuthProvider(): AuthProvider {
  if (cachedProvider) return cachedProvider
  cachedProvider = isElectronPlatform
    ? createElectronAuthProvider()
    : isCapacitorPlatform
      ? createCapacitorAuthProvider()
      : createWebAuthProvider()
  return cachedProvider
}
```

- [ ] **Step 5 (PM): 테스트 통과 확인**
```bash
cd clients/desktop && npx vitest run src/renderer/auth/__tests__/capacitorAuthProvider.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**
```bash
git add clients/desktop/src/renderer/auth/
git commit -m "feat(native): capacitorAuthProvider(Bearer+Preferences) + 플랫폼 감지(Electron→Capacitor→Web)"
```

---

### Task 3: `api/client.ts` — Capacitor 분기 (withCredentials·401 리다이렉트)

**Files:**
- Modify: `clients/desktop/src/renderer/api/client.ts`
- Test: `clients/desktop/src/renderer/api/__tests__/client.authheaders.test.ts` (기존 — capacitor 케이스 추가)

**Interfaces:**
- Consumes: `isElectronPlatform`·`isCapacitorPlatform` (authProvider.ts).

- [ ] **Step 1 (Codex): client.ts 수정** — 쿠키는 웹만, native(Electron|Capacitor)는 hash 리다이렉트
```ts
// import 에 isCapacitorPlatform 추가
import { getAuthProvider, isElectronPlatform, isCapacitorPlatform } from '../auth/authProvider'

// 공용 native 판정(쿠키 미사용 + hash 라우터)
const isNativePlatform = isElectronPlatform || isCapacitorPlatform

// 요청 인터셉터: withCredentials 는 웹(쿠키)만
config.withCredentials = !isNativePlatform   // 기존: !isElectronPlatform

// 401 응답 핸들러: native(Electron/Capacitor)=HashRouter, 웹=BrowserRouter
if (typeof window !== 'undefined') {
  if (isNativePlatform) {
    window.location.hash = '#/login'
  } else {
    window.location.replace('/login')
  }
}
```
> 근거: capacitor 빌드는 `VITE_PLATFORM='capacitor'` → `routes/index.tsx` 가 자동으로 HashRouter 선택(`isWebDeploy=false`). 따라서 401 도 hash 리다이렉트라야 정합.

- [ ] **Step 2 (Codex): 기존 테스트에 capacitor 케이스 추가** `api/__tests__/client.authheaders.test.ts` — `isCapacitorPlatform=true` 시 `withCredentials=false` + Bearer 부착 단언(기존 테스트 구조 따름; authProvider mock 으로 capacitor provider 주입).

- [ ] **Step 3 (PM): 테스트 + typecheck**
```bash
cd clients/desktop && npx vitest run src/renderer/api/__tests__/client.authheaders.test.ts && npm run typecheck
```
Expected: PASS + typecheck 0.

- [ ] **Step 4: Commit**
```bash
git add clients/desktop/src/renderer/api/
git commit -m "feat(native): client.ts Capacitor 분기 — withCredentials(웹만)·401 hash 리다이렉트(native)"
```

---

### Task 4: Android 네이티브 스캐폴드 + sync

**Files:**
- Create: `clients/desktop/android/` (cap add android 생성 — PM)
- Modify: `clients/desktop/tsconfig.node.json` (capacitor.config.ts·vite.capacitor.config.ts 포함 확인)

- [ ] **Step 1 (PM): Capacitor 초기화 + Android 추가**
```bash
cd clients/desktop
npx cap init "삼한 백오피스" com.samhanair.backoffice --web-dir dist/capacitor   # capacitor.config.ts 이미 있으면 skip/확인
npm run build:capacitor
npx cap add android
npx cap sync android
```
Expected: `clients/desktop/android/` Gradle 프로젝트 생성, `cap sync` 가 `dist/capacitor` 자산을 `android/app/src/main/assets/public/` 로 복사(빌드 산출물은 .gitignore).

- [ ] **Step 2 (Codex): tsconfig.node.json 점검** — `vite.capacitor.config.ts`·`capacitor.config.ts` 가 node tsconfig include 범위에 들어가 typecheck 되는지 확인(기존 vite.web.config.ts 와 동일 처리). 누락 시 include 추가.

- [ ] **Step 3 (PM): cap sync 재확인 + typecheck**
```bash
cd clients/desktop && npm run typecheck
```
Expected: typecheck 0(capacitor config/provider 포함).
> ⚠️ **네이티브 APK 빌드(`cd android && ./gradlew assembleDebug`)는 Android SDK 필요 → 본 Phase 비범위.** 실행 가능하면 시도하되, 불가 시 "빌드 env 미확보 — APK 빌드 deferral" 정직 명시(가짜 성공 금지).

- [ ] **Step 4: Commit** (android 스캐폴드 — 빌드 산출물 제외)
```bash
git add clients/desktop/android clients/desktop/tsconfig.node.json
git commit -m "feat(native): Android 네이티브 프로젝트 스캐폴드 + cap sync(dist/capacitor)"
```

---

### Task 5: 문서 (README + dev-report)

**Files:**
- Modify: `clients/desktop/README.md` (네이티브 패키징 섹션)
- Create: `docs/dev-reports/2026-06-26-backoffice-native-packaging.md`

- [ ] **Step 1 (Codex): desktop README 섹션 추가** — 4-target 표(Electron/PWA-web/Capacitor-native/dev), `build:capacitor`·`cap sync`·`cap open android`, capacitorAuthProvider(Bearer) 설명, 제약(실 빌드/스토어/iOS=후속·HTTPS Phase11).
- [ ] **Step 2 (Codex): dev-report 작성** — 단계 분해(N1~N5) 재게시, 인증 전략(쿠키 불가→Bearer), dist 분리, 무회귀, 정직 deferral(빌드 env), 교훈.
- [ ] **Step 3: Commit**
```bash
git add clients/desktop/README.md docs/dev-reports/2026-06-26-backoffice-native-packaging.md
git commit -m "docs(native): 백오피스 네이티브 패키징 N1 — README 4-target + dev-report"
```

---

## 최종 검증 (머지 전, PM)
- [ ] `npm run build:capacitor` green (dist/capacitor, SW 없음).
- [ ] `npm run typecheck` 0.
- [ ] `npx vitest run` (capacitor provider + client + 기존 무회귀) green.
- [ ] **무회귀**: `npm run build`(Electron) + `npm run build:web`(실 sw.js) + dev/mock(**mock 회귀 hard gate** CI) green.
- [ ] `npx cap sync android` 자산 복사 성공.
- [ ] (가능 시) Android APK 빌드 — 불가 시 정직 deferral 명시.

## 워크플로우 (canonical)
조기 PR(spec+plan) → Codex 구현(Task 1~5 코드, PM 스캐폴드 대행) → ④Opus 5차원+fix+로컬 QA ↔ ⑤Codex 0수렴 → ⑥PM 종합 → ⑦CI green(mock 회귀 hard gate=무회귀) → ⑧PM 자율머지 → 핸드오프. 각 단계 ScheduleWakeup 자각.

## Self-Review (작성자 점검)
- **Spec 커버리지**: spec §3(config)→T1, §4(인증)→T2/T3, §5 컴포넌트 1~6→T1~T5, §6 QA→최종검증. ✅ 누락 없음.
- **Placeholder 스캔**: 모든 코드 스텝에 실제 코드 포함. T3 Step2 테스트는 "기존 구조 따름"으로 기술(기존 파일 패턴 재사용 — 코드 골격은 authProvider.test.ts 참조). ✅
- **타입 정합**: `createCapacitorAuthProvider`·`isCapacitorPlatform`·`isNativePlatform`·`STORAGE_KEY`·`CapacitorAuthSnapshot` 명칭 T2/T3 일관. `AuthProvider` 인터페이스 기존 계약 준수. ✅
