# arologis-desktop

> 아로로지스 (배차 도메인) 전용 Electron 데스크톱 앱.
> Samhan Public 의 `clients/desktop` 과 분리된 별도 운영 단위 (D-AX-03).

---

## 빌드

```bash
cd clients/arologis-desktop
npm install
npm run build           # main + preload + renderer 번들 (out/)
  npm run build:win       # 명시 버전·피드·코드서명 검증 후 NSIS installer + portable .exe
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_AROLOGIS_API_BASE` | `http://localhost:8097` | renderer axios baseURL (예: `https://api.arologis.samhan-air.com`). 미지정 시 localhost:8097 fallback. |
| `VITE_VERSION_API_BASE_URL` | `http://localhost:8080` | dashboard-service 공개 `/app/version` 조회 base URL. |
| `VITE_APP_VERSION` | `0.1.0-dev`(개발) | 릴리스 빌드가 요구하는 `YYYY/MM/DD-{번호}` 버전 주입값. |
| `AROLOGIS_UPDATE_URL` | 없음 | 코드서명된 아로로지스 전용 HTTPS generic updater 피드. `build:win` 필수. |
| `ELECTRON_RENDERER_URL` | (electron-vite 자동 주입) | dev 모드에서 electron-vite 가 자동 설정. 수동 지정 불필요. |

## 디렉토리 구조

```
clients/arologis-desktop/
├── electron-builder.yml    (appId: com.samhanair.arologis.desktop)
├── electron.vite.config.ts (main / preload / renderer 3 entry)
├── package.json            (@samhan/arologis-desktop, 별도 의존성)
├── src/
│   ├── main/               (Electron main 프로세스 + 인증 IPC)
│   │   ├── index.ts
│   │   ├── ipc/auth-token.ts
│   │   └── store/auth-store.ts (electron-store name = `arologis-auth`)
│   ├── preload/index.ts    (window.arologisAuth contextBridge)
│   └── renderer/
│       ├── api/            (auth / arologis / partner / notification axios)
│       ├── components/     (AppLayout / ProtectedRoute)
│       ├── routes/
│       │   ├── login/      (loginId + password)
│       │   ├── dispatches/ (F2 git mv from clients/desktop/routes/arologis)
│       │   └── drivers/    (phoneNumber 사전 등록 — F4)
│       └── stores/authStore.ts (zustand 기반)
└── README.md
```

## 인증 흐름

1. 부팅 시 `useAuthStore.bootstrap()` 가 메인 프로세스 토큰 IPC 조회.
2. 토큰이 있으면 `/dispatches`, 없으면 `/login` 으로 라우팅 (`ProtectedRoute`).
3. 로그인 = `POST /auth/admin/login` (loginId + password) → JWT + refreshToken 영속.
4. `accessToken` 만료 시 응답 인터셉터가 `POST /auth/refresh` 로 rotation.
5. 로그아웃 = `POST /auth/logout` + 메인 프로세스 토큰 클리어.

## 권한 게이팅 (page-code canAccess)

백오피스 admin 화면(`/admin/*`)의 접근/메뉴/CRUD 버튼은 **롤이 아니라 page-code 권한**으로 게이트한다 (PR #569, [[fe-canaccess-pagecode-be-match]]).

1. `usePermissions()` 가 `GET /admin/arologis/permissions/my` 를 react-query(5분)로 조회 → 본인 effective `arologis.*` page-code/action 맵. 캐시 null = `canAccess` false (fail-closed).
2. 라우트 = `<PermissionGuard pageCode="arologis.hr.employees" action="view">`, 사이드바/버튼 = `canAccess(pageCode, action)`. page-code/action 은 BE `@RequirePermission` 과 정확 일치.
3. 진실원 = 중앙 `role_page_permissions`(MASTER 가 `권한 관리` 매트릭스로 관리). 매트릭스 grant/revoke 가 FE 메뉴/접근에 즉시 반영된다.
4. 보안: `/my` 는 raw `X-User-Role` 헤더가 아니라 서명 JWT claim 기반 `ROLE_AROLOGIS_*` authority 로 롤을 판정(헤더 위조 차단). 로그인/로그아웃 시 권한 캐시 제거(세션 간 누출 방지).
5. 예외: `canGrantMaster`(MASTER 롤 부여 옵션)는 page-code 아닌 롤-부여 정책이라 롤 기반 유지.

## UUID 비공개 가드

화면 어디에도 UUID 노출 금지. 사용자 노출 식별자 = `loginId` / `driverCode` / 거래처명 / 슬립번호.
