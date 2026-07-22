# 데스크톱 자동 업데이트 — DS-4 활성화 게이트 해제의 선행 (2026-07-23)

> 📌 **개발책임자 결정 (2026-07-23)** — *"자동 업데이트 선행 후 DS-4 활성화"*
> #908 DS-4 는 `ADVANCED_ACTIVATION_GATE_ENABLED` 게이트를 두고 마감했다. **이 슬라이스가 그 게이트의 해제 조건**이다.
> 🚫 개발책임자 지시로 신규 이슈를 만들지 않으므로 결정 경위는 `docs/handoff/CURRENT-WORK.md` 에 기록돼 있다.

## 1. 왜 필요한가

DS-4 가 schema v2 에 신규 요소(`DETAIL`/`IMAGE`)를 추가했는데, **이미 배포된 구버전 Electron** 은 unknown 타입을 거부하고 `normalize()` 가 null 로 내려 **기본 양식을 조용히 인쇄**한다. 사용자는 다른 양식이 나간 것을 모른다.
**자동 업데이트가 없어 구버전을 강제로 바꿀 수단이 없다** — 그래서 DS-4 는 활성화를 막아 둔 상태다.

## 2. 🔑 PM 사전 조사 — **버전 확인 계층은 이미 완성돼 있다**

| 구성요소 | 상태 | 근거 |
|---|---|---|
| BE `/app/version` | ✅ **정상 동작** | `dashboard-service` `AppReleaseController:37` |
| 게이트웨이 라우트 | ✅ 존재 | `api-gateway/application.yml:469` `Path=/app/version` |
| FE 클라이언트 | ✅ 존재 | `appVersion.ts` `getAppVersion` · `listAppReleases` |
| 강제 수준 | ✅ 존재 | `AppForceLevel = NONE \| MINOR \| MAJOR \| CRITICAL` |
| 릴리스 admin CRUD | ✅ 존재 | `AppReleaseController` (DEV-1, `edc7befb3`) |
| **`electron-updater`** | ❌ 없음 | `package.json` 미도입 |
| **`publish` 타깃** | ❌ 없음 | `electron-builder.yml:59` `publish: null` |

⚠️ **PM 이 두 번 헛다리를 짚었다가 규명한 것** — 로컬 `/app/version` 이 404 라 "라우팅/stale 배포" 를 의심했는데, dashboard-service 를 재배포하고 응답 **본문**을 보니:
```
HTTP 404
{"code":"NOT_FOUND","message":"등록된 앱 릴리스가 없습니다: DESKTOP"}
```
**비즈니스 404 였다.** 엔드포인트는 완전히 정상이고 로컬 DB 에 DESKTOP 릴리스 레코드가 없을 뿐이다.
🔑 *"상태 코드만 보지 말고 응답 본문을 읽는다"* — 이 세션에서 반복된 교훈이 또 적용됐다.

⟹ **새로 만들 것은 실제 updater 뿐**이다. 버전 확인 API·강제 수준·릴리스 관리는 재사용한다.

## 3. 범위

| | 항목 |
|---|---|
| **A** | `electron-updater` 도입 + `publish` 타깃 설정(배포처 결정 필요 — §5) |
| **B** | 기존 `forceLevel`(NONE/MINOR/MAJOR/CRITICAL)을 **실제 차단/안내 동작**에 배선 |
| **C** | 업데이트 실패·오프라인·롤백 시 **사용자가 겪는 것**을 정의하고 구현 |

🚫 **범위 밖**: 릴리스 CI 파이프라인 자동화 · 코드사이닝 인증서 신규 발급 · 모바일/웹 클라이언트 · DS-4 게이트 해제(이 슬라이스가 서면 별도로 판단)

## 4. 불변식

| # | 불변식 |
|---|---|
| **U1** | **구버전이 새 양식을 만나기 전에 업데이트된다** — 그게 이 슬라이스의 존재 이유다 |
| **U2** | **강제 수준이 실제로 강제한다.** `CRITICAL` 인데 사용자가 계속 쓸 수 있으면 그 값은 거짓말이다 |
| **U3** | **업데이트 실패가 앱을 못 쓰게 만들지 않는다** — 네트워크 단절·서버 장애에서 기존 기능은 계속 동작한다(단, `CRITICAL` 은 예외로 정의할 수 있음. 정의하고 근거를 남길 것) |
| **U4** | **업데이트 여부·진행·실패를 사용자가 안다.** 조용히 실패하지 않는다 |
| **U5** | 기존 `/app/version` 계약과 릴리스 admin 을 **깨지 않는다** — 재사용이지 재작성이 아니다 |

## 5. ⚠️ 착수 전 확인해야 할 것 (구현자 판단 → PM 이 필요하면 개발책임자께)

1. **배포처** — GitHub Releases(레포가 private 이면 토큰 필요) vs 사내 호스팅. `electron-builder.yml:59` 주석이 두 안을 이미 적어 뒀다. **비용·보안·운영 부담**을 비교해 결론을 낼 것
2. **코드사이닝** — 현재 `publisherName: Samhan Air Systems Co., Ltd.` 만 있고 실제 서명 여부가 불분명하다. **서명 없이 자동 업데이트가 성립하는지**(Windows SmartScreen·electron-updater 요구사항) 확인 필요
3. **롤백** — 잘못된 릴리스를 되돌리는 수단이 있는가

## 6. 검증 방침

- **RED-first** + **뮤테이션 RED**
- 🚨 **라이브QA 는 "설정이 들어갔다" 가 아니라 "실제로 업데이트가 일어난다" 를 봐야 한다.** 이 세션에서 *mock/설정 green 인데 실 경로가 깨진* 사례가 **5회** 나왔다
- `forceLevel` 은 **각 수준별로** 실제 동작을 확인한다(NONE 은 통과·CRITICAL 은 차단 등)
- 로컬 DB 에 **DESKTOP 릴리스 레코드를 넣어야** `/app/version` 이 의미 있는 응답을 준다(현재 0건) — QA 시 필요하며 **throwaway 로 만들고 정리**할 것

## 7. 워크플로우

캐논 준수 — OPUS 기획(본 PR) → CODEX LUNA 5.6 구현 → OPUS 적대리뷰 + PM 라이브QA → CODEX SOL 5.6 리뷰 → 도달가능 0 수렴 → CI green → PM 머지.

## 8. CODEX LUNA 구현 결론 (2026-07-23)

### 8.1 배포처

**generic HTTPS 사내 정적 호스팅을 선택한다.** `electron-builder.yml`의
`publish.provider=generic`과 `DESKTOP_UPDATE_URL` 빌드 환경변수로 피드 주소를 주입한다.

| 안 | 비용·보안·운영 부담 | 판정 |
|---|---|---|
| private GitHub Releases | 저장소 비용은 낮지만 private release 읽기 토큰을 클라이언트에 넣을 수 없어 토큰 노출 위험이 있다. | 제외 |
| 사내 HTTPS 호스팅 | 기존 사내 정적 파일/오브젝트 호스팅 비용만 들고, 인증서·네트워크 경계를 사내에서 통제할 수 있다. `latest.yml`, NSIS 설치본, blockmap 업로드 운영은 필요하다. | 채택 |

`/app/version`은 force 정책과 릴리스 노트의 권위로 그대로 재사용한다. 바이너리 피드는
electron-builder/electron-updater 계약으로 분리해 기존 BE 응답과 admin CRUD를 변경하지 않았다.

### 8.2 코드사이닝

현재 `publisherName`만으로는 Windows 실행 파일이 서명되지 않는다. unsigned 배포는
SmartScreen 경고와 업데이트 무결성 검증 실패를 일으킬 수 있으므로 `forceCodeSigning: true`를
추가해 인증서(`CSC_LINK`/`CSC_KEY_PASSWORD` 등)가 없는 빌드를 실패시킨다.

신규 인증서 발급은 이 슬라이스 범위 밖이다. 현재 작업 환경에는 인증서 환경변수가 없고,
`npm run build:win`은 `winCodeSign` 캐시의 심볼릭 링크 권한 오류로 패키징 단계에서 중단되어
서명된 산출물과 실제 다운로드/설치까지는 검증하지 못했다. 따라서 **업데이트 코드 경로와
빌드 안전장치는 구현했지만, 인증서와 피드가 준비되기 전에는 운영 자동 업데이트가 성립했다고
주장하지 않는다.**

운영 활성화 조건은 (1) 코드서명 인증서/CI 비밀값 준비, (2) `DESKTOP_UPDATE_URL` HTTPS 피드에
NSIS 설치본·`latest.yml`·blockmap 업로드, (3) clean machine에서
`available → downloading → downloaded → quitAndInstall` 실증이다.

### 8.3 롤백

electron-updater는 semver 기준으로 자동 다운그레이드하지 않는다. 문제 릴리스의
`latest.yml`/설치 파일 제공을 중지하고 수정된 더 높은 patch 버전을 새 릴리스로 발행한다.
BE admin `unpublish`는 `/app/version` 정책을 되돌리지만 이미 설치된 바이너리를 되돌리지는
않는다. 파일 덮어쓰기나 강제 다운그레이드는 하지 않는다.

### 8.4 구현 동작

- `NONE`: 기존 기능을 계속 사용하고 updater 상태가 없으면 안내하지 않는다.
- `MINOR`: 기존 버전별 안내 배너를 유지하며 다운로드 진행·실패·완료를 표시한다.
- `MAJOR`: 세션 내 닫을 수 있는 필수 업데이트 모달을 유지하고 앱 사용을 허용한다.
- `CRITICAL`: 다운로드 완료 전 사용을 차단하고 실패 시 재시도만 허용한다. schema v2 미지원
  구버전의 잘못된 결재문서 인쇄 위험 때문에 U3의 명시적 CRITICAL 예외로 정의했다.
- updater 실패는 `error` 상태와 한국어 메시지로 표시한다.

### 8.5 변경 파일

- `clients/desktop/package.json`, `package-lock.json`: `electron-updater` 도입
- `clients/desktop/electron-builder.yml`: generic HTTPS publish, `forceCodeSigning`
- `clients/desktop/src/main/auto-update.ts`, `src/main/index.ts`: updater 이벤트·IPC·설치 위임
- `clients/desktop/src/preload/index.ts`, `src/renderer/types/electron.d.ts`: 안전한 updater 브리지
- `clients/desktop/src/renderer/version/desktopUpdatePolicy.ts`, `AppVersionGate.tsx`: 정책·상태 UI
- `clients/desktop/src/main/auto-update.test.ts`, `packaging-invariants.test.ts`,
  `desktopUpdatePolicy.test.ts`: IPC·패키징·forceLevel 회귀 테스트

### 8.6 U1~U5 대응

- **U1**: packaged Electron이 부팅 후 updater를 확인하고 available 즉시 다운로드하며, CRITICAL은 다운로드 완료 전 결재문서 기능을 차단한다.
- **U2**: 네 수준을 각각 테스트하고 `CRITICAL=false`, `MAJOR/MINOR` 비차단, `NONE` 무안내를 실제 정책 함수와 UI에 연결했다.
- **U3**: 일반 수준의 실패는 기존 기능을 유지하고, 잘못된 양식 인쇄 위험 때문에 CRITICAL만 명시적으로 차단한다.
- **U4**: checking/downloading/downloaded/error를 renderer 배너와 모달에 표시한다.
- **U5**: `/app/version`, `forceLevel`, admin CRUD를 수정하지 않고 그대로 사용한다.

### 8.7 검증 기록

RED-first 정책 테스트(구현 전):

```text
Error: Failed to load url ./desktopUpdatePolicy ... Does the file exist?
```

GREEN 관련 테스트:

```text
Test Files  5 passed (5)
Tests       24 passed (24)
```

전체 Desktop Vitest:

```text
Test Files  145 passed (145)
Tests       1152 passed (1152)
Duration    28.92s
```

`npm run typecheck`, production `npm run build`, 관련 lint도 exit 0이다. Windows
`npm run build:win`은 코드서명 인증서 검증 전에 `winCodeSign` 캐시 심볼릭 링크 권한 오류로
중단됐다.

Mutation RED (`CRITICAL canContinue=false`를 true로 변경):

```text
Test Files  1 failed (1)
Tests       1 failed | 5 passed (6)
Expected canContinue: false / Received canContinue: true
```

전체 mock Playwright와 공유 Docker DB 쓰기/throwaway 릴리스 생성은 수행하지 않았다.
