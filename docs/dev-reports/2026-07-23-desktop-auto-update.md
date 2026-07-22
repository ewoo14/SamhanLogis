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
