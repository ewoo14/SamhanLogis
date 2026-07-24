# #870 — 세션 전환 시 권한 캐시 누출 + freshness 개편 (기획 · OPUS 4.8)

> 상태: 기획 확정 (2026-07-24) · 기획 정찰(T5) 근거 기반 · main `15a6310dd`
> 성격: **FIX (도달 가능한 결함)** — 사용자 오류 + 권한 누출 축
> 규모: 소스 10~14파일 / 300~480줄 (호출부 수정 아님 · choke point 3곳 추가)

---

## 1. 결함 정의 (2건 · 둘 다 라이브 재현됨)

### A — 401 경로가 렌더러 권한 캐시를 지우지 않는다 (핵심)

토큰 만료(401) → 로그인 화면 자동 이동 → **직전 세션의 gcTime(기본 5분) 이내에 다른 계정으로 재로그인**하면, React Query `['permissions','my']` 캐시가 **이전 사용자 것 그대로** 남아 새 사용자에게 렌더된다.

**라이브 재현 (T5 · 실서버 :8080 · 실 계정 · Electron 분기)**:
```
dev_master 로그인 → 401 → dev_warehouse 재로그인
  → 권한 재조회 0회 (delta=0) → 사이드바 9그룹·개발 그룹 O·"새 판매전표" 활성
VERDICT {"permFetchTotal":1,"permFetchDeltaAfterRelogin":0,"staleLeak":true}

대조군(로그아웃 버튼 경로 = #860 fix 적용 구간):
  dev_warehouse 재로그인 → 권한 재조회 1회 → 5그룹·개발 그룹 X  ← 정상
```

- **정방향** — 하위 권한자(WAREHOUSE)가 상위(MASTER) 메뉴를 보고 클릭 → 403/빈 화면 (오류 체감)
- **역방향(더 치명적)** — 상위 권한자가 하위 권한 메뉴만 보임 = **기능 도달 불가**(BE 가 막아주지 않는 방향, 순수 손실). `DashboardPage.tsx:76,93` `canAccess('sales.slip.create','create')` 로 "새 판매전표" 활성 여부가 갈림 — 스크린샷 실측.
- **자가치유 안 됨** — 캐시가 fresh 라 refetch 자체가 안 걸린다.

**원인 — clearAuthState() 가 QueryClient 를 손대지 않는다** (`stores/session.ts:115-120`):
```
1. getAuthProvider().clearSession()   // Electron IPC clear / 웹 POST /auth/logout
2. set({ auth: null })
→ QueryClient 미접근
```
`api/client.ts:114` 401 인터셉터도 `clearAuthState()` 만 부른다. `#836/PR #860` 은 로그아웃 버튼(`AppLayout.tsx:455`)·비번변경(`PasswordChangePage.tsx:76`) **2곳만** `removeQueries(['permissions','my'])` 를 넣었고, **401 경로와 로그인 성공 경로는 비었다**.

**플랫폼 한정 (스펙 필수 반영)** — `client.ts:117-121` `isNativePlatform` 분기 때문에 **Electron 데스크톱 + Capacitor 모바일 빌드에서만** 재현된다. 웹은 `window.location.replace('/login')` = 풀 리로드라 캐시가 자연 소멸한다. 시간창 = 세션 종료 후 gcTime(5분) 이내 재로그인 = **토큰 만료 직후 바로 다시 로그인하는 실사용 패턴과 정확히 일치**.

**정답 패턴이 이미 사내에 있다** — 아로로지스 desktop 은 **로그인 시점에** `['permissions','my']` 를 제거한다(`arologis-desktop/.../login/LoginPage.tsx:91,114` + `AppLayout.tsx:61`). 삼한 desktop 이 계열 내 유일한 outlier.

### B — freshness-critical 쿼리가 전역 staleTime 5분을 상속

`App.tsx:21-28` 전역 `staleTime 5분`. `usePermissions.ts:46` 은 이를 명시 상속하고 `refetchOnWindowFocus:false` 라, **한 화면에 머무르면 권한 변경이 무기한 미반영**.

**라이브 실측 (T5 · 쓰기 0)**:
```
로그인 후 한 화면 6분 30초 유지(focus/blur 13회) → 권한 재조회 0회
staleTime 경과(>5분) 후 PermissionGuard 라우트 진입 → 재조회 1회
```
⟹ 권한 부여/회수가 **① 5분 경과 ② PermissionGuard 라우트로 네비게이션** 둘 다 있어야 반영. 관리자가 권한을 바꿔도 대상자가 화면에 머물면 최대 5분+네비 지연.

---

## 2. 불변식 (fix 가 반드시 만족 — *수단은 구현자 재량*)

> PM 은 불변식만 규정한다. 아래를 만족하는 한 구현 수단(clear vs removeQueries, registry vs export 등)은 CODEX LUNA 가 고른다.

- **I-1** 세션 S 에서 캐시된 어떤 쿼리도 세션 S′(다른 계정 로그인) 전환 후에 **읽히지 않는다**. 판정 대상 최소 = `['permissions','my']`, `['me','executive-office']`.
- **I-2** 세션 전환 지점 = **① 401 인터셉터** ② **로그인 성공** 둘 다. (로그아웃·비번변경 2경로는 #860 로 이미 충족 — 회귀 금지.)
- **I-3** I-1 fix 가 **import 순환을 만들지 않는다** (`client.ts` 가 QueryClient 에 접근하되 `client.ts ← api ← App.tsx ← queryClient` 사이클 회피).
- **I-4** freshness — 관리자가 권한을 바꾸면 대상자가 **화면을 떠나지 않아도** 합리적 시간 내(≤ 수십 초 또는 창 포커스 복귀 시) 반영된다.
- **I-5** freshness fix 가 **모든 라우트 이동마다 `/auth/admin/permissions/my` 를 유발하지 않는다** (PermissionGuard 291·usePermissions 80 호출부 — fetch 폭주 금지).
- **I-6** 세션 *내부*의 비-사용자귀속 캐시(창고 목록 등)는 매 렌더/네비마다 불필요하게 재요청되지 않는다(과도 무효화 금지).
- **I-7** 웹 플랫폼의 풀 리로드 경로는 영향받지 않는다.

## 3. PM 설계 결정 (튜닝 — 정책 아님)

1. **I-1 충족 기준 approach = 세션 전환 시 QueryClient 전체 초기화(`clear()`) 권장.** 근거: 사용자귀속 키를 개별 열거하면 누락 위험(정찰: 렌더러 670키 중 user-id 를 key 에 담은 것 0개 → A-4/5/6 같은 개별 누출을 개별로 잡아야 함). 전체 clear 는 **계열 전수(A-1~A-9)를 한 지점에서 만족**하고, 비용은 다음 사용 시 1회 refetch 뿐. `App.tsx:19` 주석이 이미 *"권한/토큰 변경 시 `queryClient.clear()` 로 초기화 가능"* 이라 의도를 명시(호출부만 0). → **주석을 실장으로 전환.** (LUNA 가 targeted removeQueries 를 택할 근거가 있으면 I-1 판정 키 전부 + 계열을 커버해야 함.)
2. **freshness = `usePermissions` 에 `staleTime: 30_000` + `refetchOnWindowFocus: true`.** `staleTime:0 + refetchOnMount:'always'` 는 **비채택** — 291 PermissionGuard 라우트 이동마다 fetch 를 유발(I-5 위반). 30초 + 포커스 복귀 refetch + 세션전환 강제 clear 3중이면 I-4 를 fetch 폭주 없이 충족.
3. **모듈 전역 `permissionsApi._permissionsCache`(A-7)** = clear 지점에서 함께 무효화(현재 sync `canAccess` importer 0 = 잠복이나, belt-and-suspenders).

## 4. 범위

**수정 (choke point 3곳 + 정책 1곳)**
- `api/client.ts:114` — 401 분기에서 세션 캐시 초기화 (I-1·I-2·I-3)
- `routes/LoginPage.tsx:70` — 로그인 성공 시 초기화 (I-2, 아로로지스 패턴 이식)
- `stores/session.ts:115-120` 또는 신규 `queryClientRegistry.ts` — QueryClient 접근 지점(순환 회피, I-3)
- `hooks/usePermissions.ts:46` — freshness 정책 (I-4·I-5)
- `App.tsx:19` — 주석↔실장 정합

**계열 참고(범위 내 · clear 로 자동 커버)**: A-4 `['me','executive-office']` · A-5 `['notifications','my']` · A-6 `['auth','session']`.

**범위 밖(명시)**
- 렌더러 670키 전체에 user-id 를 key 에 넣는 일반형 리팩터(A-9 근본) — 별도.
- arologis-desktop·mobile·order-app·estimate-app — 권한 캐시 없음/이미 안전(정찰 확인).
- 서버측 권한 push/실시간 무효화(SP-D5 이연 항목 `sp-d4-...:152`) — 별도.

## 5. 테스트 설계 (🚨 mock false-green 함정 회피 — 정찰 확증)

**브라우저 mock Playwright 는 이 결함을 재현하지 못한다** — 웹 분기가 풀 리로드라 fix 전후 모두 green(false-green). RED-first 성립 조건 둘 중 하나:
- **(a)** `page.addInitScript` 로 `window.samhanAuth` 를 주입해 Electron 분기를 강제(정찰 하네스와 동일), 또는
- **(b)** vitest 에서 기존 `client.authheaders.test.ts` 의 `platform` mock 을 재사용, 공유 QueryClient 에 `['permissions','my']` 를 심고 401 후 `getQueryData` 가 `undefined` 인지 단언.

**RED-first 필수** — 결함 재현 실패 테스트를 먼저 쓰고 RED 원문 제출 후 고친다. `playwright.config.ts` 가 `playwright/**` 를 자동 게이트하므로 신규 mock 스펙은 자동 편입(`-real-qa` 접미사 아님).

## 6. 회귀 울타리 (표면 명시)

1. **로그아웃 버튼 경로**(#860) — 여전히 캐시 clear (역회귀 금지)
2. **비번변경 → 로그아웃**(#860) — 정상
3. **세션 내부 비-사용자 캐시**(창고 목록 등) — 세션 중 유지, 매 네비 재요청 안 함 (I-6)
4. **로그인 → 올바른 권한 렌더** — 아로로지스 parity
5. **웹 플랫폼 풀 리로드** — 무영향 (I-7)

## 7. 라이브QA (실서버 · 매 라운드)

정찰 재현 절차 그대로: `dev_master` 로그인 → 401 → **5분 이내** `dev_warehouse` 재로그인 → 사이드바·"새 판매전표" 활성 상태를 스크린샷. 대조군(로그아웃 버튼)과 A/B. Electron 분기는 `window.samhanAuth` shim(토큰은 실서버 발급분).

## 8. 하네스 지표

수렴비 `c`(도달가능 ÷ 직전) < 0.45 목표. 매 라운드 `c`·`r`(fix-유발률)을 PR 기록.
