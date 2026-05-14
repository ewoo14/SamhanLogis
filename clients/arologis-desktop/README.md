# arologis-desktop

> 아로로지스 (배차 도메인) 전용 Electron 데스크톱 앱.
> Samhan Public 의 `clients/desktop` 과 분리된 별도 운영 단위 (D-AX-03).

---

## 빌드

```bash
cd clients/arologis-desktop
npm install
npm run build           # main + preload + renderer 번들 (out/)
npm run build:win       # NSIS installer + portable .exe (release/)
```

## 환경 변수

| 변수 | 용도 |
|---|---|
| `VITE_AROLOGIS_API_BASE` | renderer axios baseURL (예: `https://api.arologis.samhan-air.com`). 미지정 시 dev fallback. |
| `ELECTRON_RENDERER_URL` | electron-vite dev server URL (자동 주입). |

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

## UUID 비공개 가드

화면 어디에도 UUID 노출 금지. 사용자 노출 식별자 = `loginId` / `driverCode` / 거래처명 / 슬립번호.
