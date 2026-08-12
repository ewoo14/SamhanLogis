# #910 + #935 클라이언트 자동 업데이트 정찰 (2026-08-13)

> 조사 전용. 구현 코드·공유 DB·AWS/GitHub 설정을 변경하지 않았다. `git fetch origin`과 읽기 전용 Git/GitHub 조회만 수행했다.

## 0. 결론

자동 업데이트는 백지가 아니다. **삼한 데스크톱과 아로로지스 데스크톱에는 `electron-updater` 확인→다운로드→설치 IPC가 이미 있고**, 모바일 3앱에는 `expo-updates`, 웹 3앱에는 버전 확인·사용자 선택 새로고침이 있다. 오늘 CI에서 본

```text
[auto-update] electron-updater 상세 오류(사용자 화면 비공개) Error: Cannot find channel latest at https://intranet.example/latest.yml
```

도 코드가 이미 있다는 증거에는 부합한다. 다만 `intranet.example/latest.yml`은 운영 설정이 아니라 오류 원문 비공개를 검증하는 **테스트 fixture**다(`clients/desktop/src/main/auto-update.test.ts:141`, `clients/desktop/playwright/909-auto-update-real-qa/luna-round-real-qa.spec.ts:20`). 실제 URL·`latest.yml`·게시 workflow는 확인되지 않았다.

정책도 대부분 이미 결정됐다. **공유 호스팅, 최종 S3, AWS 전 로컬 정적 피드 완전 검증, 자체 서명(비용 0), 전 앱 날짜형 개발 버전**을 다시 결정 요청하면 안 된다. 남은 것은 자격물·피드·실 installer E2E와 제품별 격리 방식의 이행이다.

앱 수는 기준 시점에 따라 다르다.

- 이 워크트리와 `origin/main`의 현재 tree: 기존 사용자 대면 배포 앱 **8개**.
- 오늘 추가된 `clients/internal-chat-desktop`: PR #1193의 원격 브랜치에만 있는 **9번째 독립 배포 앱**. 현재 PR은 OPEN이고 이 워크트리/main에는 아직 없다.
- 따라서 #910의 “8앱”은 당시에는 맞았지만, #1193이 머지되면 분모는 **9개**가 된다. `#935 아로로지스 데스크톱`은 원래 8개 안에 이미 포함된 앱이므로 “8 + 아로로지스 = 9”로 중복 계산하면 안 된다.
- 내부 채팅 데스크톱은 별도 Electron/NSIS 제품이므로 **자동 업데이트 대상에 포함하는 것이 기능 경계상 맞다**. 다만 그 포함 결정이 #910/#935 코멘트나 결정 문서에 기록된 것은 찾지 못했다.

## 1. 워크트리 최신성

2026-08-13 KST에 먼저 `git fetch origin`을 실행했다.

```text
branch  feat/910-935-client-auto-update
HEAD    0a9022e8aff2245ad8d90a141659cbf11d1fe4c4
remote  origin/feat/910-935-client-auto-update = 같은 SHA
HEAD...remote divergence = 0 0
status  clean
```

즉 **자기 원격 브랜치 기준 최신**이다. 그러나 `origin/main`은 `3fd8e6905`이고 `HEAD...origin/main = 2 15`다. 이 워크트리는 main 고유 커밋 15개를 아직 포함하지 않아 **현재 main 기준으로는 오래됐다**. 머지·rebase는 하지 않았다.

신규 채팅 앱 커밋 `5f66ad099`는 `origin/feat/894-internal-chat`에만 있고 PR #1193은 OPEN이다. `origin/main`에도 아직 `clients/internal-chat-desktop`은 없다.

## 2. 3축 대조

### 2.1 코드

찾은 것:

- 서버 정본은 기존 8개 식별자를 가진다(`migration/decisions/DECISIONS.md:3144`, `services/dashboard-service/src/main/java/com/samhanair/logis/dashboard/domain/AppClientType.java:10-18`, `V7__app_release_client_identity.sql:13-20`).
- Electron 2앱 모두 `electron-updater ^6.8.9`와 updater IPC를 가진다.
  - 삼한: `clients/desktop/package.json:46`, `src/main/auto-update.ts:68-119`.
  - 아로로지스: `clients/arologis-desktop/package.json:41`, `src/main/auto-update.ts:60-107`. 단, 삼한은 이를 `dependencies`에 두지만 아로로지스는 `devDependencies`에 둔다. 실제 packaged NSIS에 모듈이 포함되는지는 installer 미검증 때문에 확인되지 않았다.
- 두 앱 모두 자동 다운로드/종료 시 자동 설치는 끄고, update available 뒤 다운로드하며 사용자가 선택한 설치 경로에서 `quitAndInstall(true, true)`를 호출한다.
- 두 builder는 `provider: generic`, 서로 다른 URL 환경변수, 같은 `channel: latest`를 쓴다.
  - 삼한: `clients/desktop/electron-builder.yml:69-74` → `DESKTOP_UPDATE_URL`.
  - 아로로지스: `clients/arologis-desktop/electron-builder.yml:50-55` → `AROLOGIS_UPDATE_URL`.
- 모바일 3앱은 앱별 식별자로 `/app/version`을 조회하고 `expo-updates` fetch/reload 코드가 있다(`clients/*mobile*/src/version/otaUpdates.ts:10-27`). 현재 `EAS_PROJECT_ID` 기본값은 placeholder이고 `updates.enabled`는 false로 수렴한다(`app.config.js` 각 17-18/35-36 및 65/72/130).
- 웹 3앱은 버전 게이트와 사용자 선택 reload를 가진다. 주문·견적은 dirty 확인을 한다(`order-app/src/version/versionGate.ts:113`, `estimate-app/public/version-gate.js:69-70`).
- 기존 8앱 모두 버전 게이트는 기동/mount 1회다. 관련 코드에서 `setInterval`, `visibilitychange`, React Native `AppState` 재확인은 찾지 못했다. Electron도 `checkedRef` 1회 가드다(`desktop AppVersionGate.tsx:191,286-287`, `arologis AppVersionGate.tsx:76,115-116`).
- PR #1193의 내부 채팅 앱은 `@samhan/internal-chat-desktop 0.1.0`, 별도 NSIS/portable 패키지다. 그러나 `electron-updater`·`publish`·버전 게이트가 없고, `forceCodeSigning: false`이며 wrapper가 `--config.win.signAndEditExecutable=false`를 명시한다(원격 브랜치의 `package.json:17-25`, `electron-builder.yml:1-5`, `scripts/build-internal-chat-desktop-release.cjs:25-30`).

못 찾은 것:

- 실제 `DESKTOP_UPDATE_URL`/`AROLOGIS_UPDATE_URL` 값, 저장소의 `latest*.yml`, installer/blockmap 게시 workflow.
- `CSC_LINK`, `CSC_KEY_PASSWORD` 등 코드서명 repository secret/variable. 조회 시 repository secret은 `CLAUDE_CODE_OAUTH_TOKEN` 1개, repository variable은 0개였다.
- 인증서·개인키 파일과 서명된 installer 증거. 비밀키가 저장소에 없어야 하는 것은 정상이나, 외부 보관·주입이 완료됐다는 이름 수준의 배선도 확인되지 않았다.
- 실제 feed를 통한 `available → download → quitAndInstall → 새 버전 재기동` 증거.
- 아로로지스 packaged 앱에 `electron-updater` 런타임 모듈이 실제 포함된다는 증거. 소스/단위 테스트의 mock 통과와 installer 포함은 다른 문제다.
- 신규 `INTERNAL_CHAT_DESKTOP` 같은 9번째 서버 식별자.
- 사용 중 재감지와 모바일 reload 전 공통 dirty 보호.

### 2.2 이슈 본문·전체 코멘트와 연관 이슈

찾은 것:

- #910 본문은 8앱, N1(사용 중 감지), N2(입력 손실 방지), N4(동시 요청 방지)를 정의한다.
- #910 코멘트는 모바일 3앱 OTA가 이미 구현됐음을 정정했고, 개발 버전 표기를 `YYYY/MM/DD-{번호}`로 확정했다.
- #928은 웹 3앱을 PR #934가 완료했고, 아로로지스 데스크톱은 #935/PR #981로 넘겼다고 닫혔다.
- #935 본문은 처음에는 아로로지스 updater가 없다고 기록하지만, **이후 머지 PR #981이 이미 구현**했다. 본문만 보면 현재 상태를 잘못 판정한다.
- #935 코멘트에는 공유 피드, 자체 서명, S3, 로컬 선검증, 전 앱 버전 형식 통일 결정이 모두 있다.
- #894/PR #1193은 내부 채팅이 본체 메뉴가 아니라 독립 패키징 Electron 앱이며 코드서명·installer release CI가 후속이라고 명시한다.

못 찾은 것:

- #910/#935/#894 코멘트 중 **내부 채팅 데스크톱을 기존 자동 업데이트 트랙의 9번째 식별자로 편입한다는 명시 결정**.
- 공유 호스팅 안의 제품 격리 수단을 “경로 prefix”와 “channel” 중 하나로 최종 지명한 개발책임자 원문. 다만 두 제품이 서로의 산출물을 읽지 않아야 한다는 불변식은 확정됐고, 현재 코드는 별도 URL + 같은 `latest`로 경로 분리 쪽을 구현해 두었다.
- 자체 서명 루트의 발급 주체·보관 위치·사내 PC 배포 완료 기록.

### 2.3 기존 결정·핸드오프 문서와 머지 PR

찾은 것:

- `migration/decisions/DECISIONS.md:3144-3147`에 기존 8식별자, 앱별 unique 축, `YYYY/MM/DD-{번호}` 정책 정본이 기록돼 있다.
- `docs/dev-reports/2026-07-23-desktop-auto-update.md:75-84`는 generic HTTPS 정적 피드를 채택하고 private GitHub Releases를 토큰 노출 때문에 제외했다.
- 같은 문서 `:88-100`은 `publisherName`만으로 서명되지 않으며 `forceCodeSigning: true`, 실제 인증서/피드/clean-machine E2E가 필요하다고 기록한다.
- PR #927은 8식별자와 날짜형 정책, PR #934는 웹 3앱 사용자 선택 reload, PR #981은 아로로지스 `electron-updater` 배선을 머지했다.
- PR #981 원문은 “**실제 installer 검증을 하지 못했습니다. `AROLOGIS_UPDATE_URL`과 코드서명 인증서가 없습니다**”라고 한정한다. 같은 사실이 `docs/dev-reports/2026-07-29-928-version-check-s2.md:10-14,60-62`에도 있다.
- `docs/tracks/2026-08-12-910-935-client-auto-update.md:11-12`의 “#910 8앱 / #935 아로로지스”는 두 이슈의 범위를 나란히 쓴 것이지 앱 수 9를 뜻하지 않는다.

못 찾은 것:

- `DECISIONS.md`에 #935의 **공유 피드·자체 서명·S3·로컬 선검증** 결정이 정식 D-번호로 이관된 기록. 이 결정의 정본은 현재 이슈 코멘트다.
- 머지된 PR에서 서명된 NSIS와 실제 `latest.yml`을 사용한 설치·재기동 완료 기록.
- PR #1193은 아직 머지되지 않았으므로 신규 앱을 기존 8식별자 결정에 반영한 머지 기록.

## 3. 이미 결정된 사항 — 다시 묻지 말 것

| 결정 | 원문 | 출처 |
|---|---|---|
| 피드 호스팅 공유 | “**피드는 공유**” | #935 코멘트: https://github.com/ewoo14/Samhan-Public/issues/935#issuecomment-5081193208 |
| 모든 클라이언트 개발 버전 형식 통일 | “**삼한뿐 아니라 버전도 모두 같은 방식**” 및 `YYYY/MM/DD-{번호}` | #935 코멘트: https://github.com/ewoo14/Samhan-Public/issues/935#issuecomment-5081214375, #910 코멘트: https://github.com/ewoo14/Samhan-Public/issues/910#issuecomment-5077842541, `DECISIONS.md:3147` |
| 코드서명 방식 | “**자체 서명으로 진행하도록 하자. 가급적 비용이 안 들어가야 해**” | #935 코멘트: https://github.com/ewoo14/Samhan-Public/issues/935#issuecomment-5081804079 |
| 데스크톱 설치 대상 | “**데스크탑 버전의 경우 모두 사내PC이긴해**” | #935 정정 코멘트: https://github.com/ewoo14/Samhan-Public/issues/935#issuecomment-5081845682 |
| 최종 피드 | “**S3 (Phase 11 AWS 연계)**” | #935 코멘트: https://github.com/ewoo14/Samhan-Public/issues/935#issuecomment-5082020911 |
| 이행 순서 | “**AWS는 아직 안했어. 로컬에서 완벽하게 테스트하고 나서 추후 AWS 배포할 계획이야.**” | #935 코멘트: https://github.com/ewoo14/Samhan-Public/issues/935#issuecomment-5082148030 |
| GitHub Releases 제외·generic HTTPS | “generic HTTPS 사내 정적 호스팅을 선택”, private release 토큰 노출 위험 | `docs/dev-reports/2026-07-23-desktop-auto-update.md:73-84` |
| 웹 입력 보호 | 자동 reload 없이 사용자 선택, dirty이면 추가 확인 | `DECISIONS.md:3154-3155`, PR #934 |

주의: “공유 피드”는 **같은 `latest.yml` 하나를 모든 Electron 앱이 읽는다**는 뜻이 아니다. #935 코멘트는 공유 호스팅 안에서도 제품별 경로/채널로 서로의 installer를 읽지 않아야 한다고 못 박았다.

## 4. 앱 전수 목록과 현재 상태

| # | 앱 / 서버 식별자 | 경로·배포 | 현재 구현 | 실운영에 없는 것 | 대상 판단 |
|---:|---|---|---|---|---|
| 1 | 삼한 데스크톱 / `DESKTOP` | `clients/desktop`, Electron NSIS/portable | `electron-updater`, `/app/version`, generic `${DESKTOP_UPDATE_URL}`, `latest`, `forceCodeSigning: true` | 실제 URL/feed/서명/E2E, 사용 중 재감지 | 기존 대상 |
| 2 | 아로로지스 데스크톱 / `AROLOGIS_DESKTOP` | `clients/arologis-desktop`, Electron NSIS/portable | PR #981로 updater·게이트·`${AROLOGIS_UPDATE_URL}`·`latest`·`forceCodeSigning: true` | 실제 URL/feed/서명/E2E, 사용 중 재감지. updater가 `devDependencies`라 packaged 포함도 미증명 | 기존 8앱 안의 대상이며 #935 대상 |
| 3 | 삼한 모바일 / `SAMHAN_MOBILE` | `clients/mobile`, Expo | `/app/version`, `expo-updates` fetch/reload | 실제 EAS project 주입, 사용 중 재감지, reload 전 입력 보호 | 기존 대상 |
| 4 | 직원 모바일 / `SAMHAN_MOBILE_STAFF` | `clients/mobile-staff`, Expo | 위와 동일 | 위와 동일 | 기존 대상 |
| 5 | 아로로지스 모바일 / `AROLOGIS_MOBILE` | `clients/arologis-mobile`, Expo | 위와 동일, 아로로지스 API 사용 | 위와 동일 | 기존 대상 |
| 6 | 주문 웹 / `SAMHAN_ORDER_WEB` | `clients/web/order-app`, Vite Web | 버전 안내, 사용자 선택 reload, dirty confirm | 사용 중 재감지 | 기존 대상 |
| 7 | 종합견적 웹 / `SAMHAN_ESTIMATE_WEB` | `clients/web/estimate-app`, Web | 버전 안내, 사용자 선택 reload, dirty confirm | 사용 중 재감지 | 기존 대상 |
| 8 | 모바일 퍼블릭 웹 / `SAMHAN_MOBILE_PUBLIC_WEB` | `clients/web/mobile-public`, Vite Web | 버전 안내, 사용자 선택 reload, 서명 dirty UI | 사용 중 재감지 | 기존 대상 |
| 9 | 사내 메신저 데스크톱 / **식별자 없음** | `clients/internal-chat-desktop`, Electron NSIS/portable, PR #1193 OPEN | 독립 앱 셸·release wrapper만 있음 | updater·게이트·publish·식별자·서명·feed 전부 없음. 현재 `forceCodeSigning: false`/서명 비활성 | **독립 배포 앱이므로 포함 대상. 단 PR #1193 머지 후 별도 슬라이스 필요** |

제외:

- `clients/web/design-system`: 배포 앱이 아닌 라이브러리.
- `clients/web/legacy-quantity-golden`: package가 없는 fixture.
- `clients/desktop`의 Web/Capacitor 변형: 현재 서버 정책상 별도 제품이 아니라 `DESKTOP` 제품 경계의 변형이다. 별도 앱으로 다시 세지 않았다.

## 5. 업데이트 서버·`latest.yml`

현재 Electron 2앱은 `electron-builder`의 `generic` provider다. 릴리스 빌드 때 주입된 base URL 아래에서 `channel: latest`에 해당하는 `latest.yml`을 `electron-updater`가 찾고, manifest가 가리키는 NSIS installer/blockmap을 받는 구조다.

```text
Samhan Public       DESKTOP_UPDATE_URL/<latest.yml 및 installer/blockmap>
Arologis Desktop    AROLOGIS_UPDATE_URL/<latest.yml 및 installer/blockmap>
```

정확한 실제 URL/prefix는 **모른다**. 값과 파일이 없기 때문이다. 저장소에서 확인되는 것은 환경변수 자리와 `latest` 채널뿐이다. `latest.yml`은 소스 파일이 아니라 electron-builder가 릴리스 산출물과 함께 생성·게시해야 하는 feed manifest다. 현재 이를 어디에 업로드하는지 정한 workflow는 찾지 못했다.

최종 목적지는 이미 S3로 결정됐지만, 현재 단계는 로컬 정적 HTTP(S) feed로 완전 검증한 뒤 URL만 S3로 바꾸는 순서다. S3 bucket/prefix·접근 통제는 Phase 11 이식 슬라이스의 미확정 구현 항목이다.

## 6. 결정 필요 항목 — 선택지와 결과

아래에서 **정책 방향이 이미 결정된 항목은 다시 선택을 요구하지 않는다**. 선택지는 현재안과 대가를 보이기 위한 대조다. 실제로 열려 있는 것은 제품 격리 수단과 자격물 운영 세부다.

### 6.1 배포처

| 후보 | 결과 | 기존 결정과의 관계 |
|---|---|---|
| A. 로컬 정적 generic feed 완전 검증 → Phase 11에서 S3 이식 | 지금 AWS 자격 없이도 signed installer E2E 가능. 이후 base URL만 바꾸고, S3 접근 통제·게시 자동화는 별도 검증 | **이미 결정됨** |
| B. S3를 지금 먼저 구축 | 운영과 같은 환경을 일찍 검증하지만 Phase 11/AWS 자격·비용·접근 통제 설계가 선행되고 “로컬 완전 검증 후” 순서와 어긋남 | 기존 방침을 뒤집을 때만 가능 |
| C. private GitHub Releases | 별도 S3 없이 배포 가능하지만 private asset 접근 토큰을 클라이언트에 배포해야 하는 문제가 있음 | `2026-07-23-desktop-auto-update.md:80`에서 **이미 제외** |

따라서 개발책임자가 새로 정할 배포처 선택은 현재 없다. 실행팀이 정해야 할 세부는 로컬 feed root/port, 산출물 승격·보존·롤백 절차, S3 이식 시 bucket/prefix와 접근 통제다.

### 6.2 코드서명

현재 상태:

- 삼한·아로로지스: `forceCodeSigning: true`, `publisherName: Samhan Air Systems Co., Ltd.`. 인증서 없이는 fail-closed다.
- 사내 메신저(PR #1193): `forceCodeSigning: false`, wrapper가 서명을 명시적으로 끈다. 자동 업데이트 대상에 넣기 전에 기존 두 앱과 같은 fail-closed 계약으로 바뀌어야 한다.
- 실제 인증서/secret/서명 artifact는 확인되지 않았다.

| 후보 | 결과 | 기존 결정과의 관계 |
|---|---|---|
| A. 자체 서명 + 사내 PC 신뢰 루트 배포 + 공개 TSA timestamp | 비용 0. 인증서 subject와 `publisherName` 일치, 키 외부 보관, GPO/수동 루트 1회 배포, 갱신 절차가 필요 | **이미 결정됨** |
| B. 상용 CA 인증서 | 사내 루트 배포 부담은 줄지만 인증서 비용·발급/갱신 운영이 생김 | 기존 비용 0 결정을 뒤집을 때만 가능 |
| C. unsigned / 서명 검증 약화 | 준비는 빠르지만 SmartScreen·업데이트 무결성·게시자 검증을 약화하고 현재 `forceCodeSigning: true` 안전장치와 충돌 | 자동 업데이트 배포안으로 부적합 |

열린 세부는 인증서 발급/보관 주체, `CSC_LINK`/`CSC_KEY_PASSWORD` 주입 위치, 신뢰 루트 배포 방식(GPO와 도메인 미가입 사내 PC 수동 설치), 인증서 만료·교체 runbook이다. 루트 미신뢰 PC에서 updater가 내는 실제 오류와 사용자 안내는 **모른다**. #935가 실측을 요구했지만 완료 증거를 찾지 못했다.

### 6.3 제품별 channel/feed 격리

| 후보 | 결과 | 정합성 |
|---|---|---|
| A. 공유 S3/origin + 제품별 prefix/base URL + 각 prefix의 `channel: latest` | `desktop/latest.yml`, `arologis-desktop/latest.yml`, `internal-chat-desktop/latest.yml`처럼 격리. 동일 버전 문자열이어도 충돌하지 않음. 현재 `DESKTOP_UPDATE_URL`/`AROLOGIS_UPDATE_URL` 구조를 그대로 확장 가능 | 현재 코드와 가장 가까우나, 내부 채팅까지 포함한 최종 명명은 미결정 |
| B. 공유 base URL + 제품별 channel 이름 | 파일명/channel 규약으로 격리. updater의 channel 전환·prerelease 의미와 운영 도구를 추가 검증해야 하고 잘못된 channel 설정이 다른 제품 manifest를 읽을 위험이 있음 | 가능하지만 현재 코드 변경이 큼 |
| C. 공유 base URL + 단일 `latest.yml` | 마지막 게시 앱이 manifest를 덮거나 다른 제품 installer를 가리킬 수 있음 | #935의 “서로 오염시키지 않는다” 결정과 **불일치** |

즉 “호스팅 공유”와 “manifest 공유”는 다르다. 현재 두 앱은 **같은 channel 이름을 쓰되 base URL을 나눈 A형**이다. A/B 중 최종 운영 규약을 문서화할 필요는 있지만 C는 기존 결정상 후보가 아니다.

## 7. 독립 머지 슬라이스 제안

아래 순서는 의존성을 표시한 것이며 각 항목은 자체 테스트와 리뷰가 가능한 머지 단위다.

| 슬라이스 | 범위 | 무엇이 되면 끝인가 |
|---|---|---|
| S0. 기준선 재정합 | origin/main 15개 차이와 PR #1193 상태를 반영해 9앱 분모·의존성을 확정 | **실행 기준 SHA에서 앱 목록과 서버 식별자 분모가 한 표로 재현되면 끝** |
| S1. 로컬 feed 계약 | 제품별 prefix/base URL, 정적 서버, manifest/installer/blockmap 게시·검증 스크립트와 rollback 규약 | **두 기존 Electron 앱이 같은 서버의 서로 다른 prefix에서 자기 `latest.yml`만 읽으면 끝** |
| S2. 자체 서명 자격·신뢰 배포 | 자체 서명 인증서 발급(키는 repo 밖), TSA timestamp, secret 주입 계약, GPO/수동 루트 설치 runbook, 미신뢰 실측 | **신뢰/미신뢰 Windows에서 서명 검증 결과와 사용자 안내가 실제 installer로 기록되면 끝** |
| S3. 삼한 데스크톱 signed E2E | 기존 updater 코드에 S1/S2를 연결하고 clean machine 설치→업데이트→재기동 검증 | **구버전 signed NSIS가 로컬 feed의 신버전을 받아 설치하고 새 버전으로 재기동하면 끝** |
| S4. 아로로지스 signed E2E | PR #981 배선을 아로로지스 prefix에서 같은 방식으로 검증 | **삼한 installer를 절대 읽지 않으면서 아로로지스 신버전으로 재기동하면 끝** |
| S5. 내부 채팅 9번째 제품 편입 | PR #1193 머지 후 `INTERNAL_CHAT_DESKTOP` 식별자·관리 UI·버전 게이트·updater·fail-closed signing·전용 prefix 추가 | **사내 메신저 릴리스가 다른 8앱에 영향 없이 그 앱만 업데이트하면 끝** |
| S6. 웹 3앱 사용 중 재감지 | jitter가 있는 visibility/focus 재확인, 기존 dirty 사용자 선택 계약 유지 | **앱을 재기동하지 않고 새 릴리스를 알며 저장 안 한 입력은 사용자 동의 전 유지되면 끝** |
| S7. Expo 3앱 재감지 + N2 | AppState 복귀/지터 재확인과 dirty 보호를 OTA 활성화와 같은 슬라이스에서 구현 | **실 EAS update를 감지하되 작성 중 입력을 묻지 않고 `reloadAsync()` 하지 않으면 끝** |
| S8. Electron 3앱 사용 중 재감지 | 기존 2앱 + 내부 채팅의 focus/주기 재확인, N4 jitter, nonblocking 안내 | **앱 실행 중 배포된 새 릴리스를 재기동 없이 감지하고 사용자 선택으로만 설치하면 끝** |
| S9. CI 패키징·승격 | signed installer와 manifest를 제품별로 생성하고 검증 통과 artifact만 로컬/스테이징 feed로 승격 | **한 제품 release job이 다른 제품 prefix를 쓰거나 덮으면 CI가 실패하면 끝** |
| S10. Phase 11 S3 이식 | S1의 동일 path 계약을 S3에 옮기고 접근 통제·캐시·롤백·관측을 검증 | **URL 교체만으로 세 Electron 앱 E2E가 재통과하고 bucket 공개 범위가 승인 정책과 일치하면 끝** |

병렬 가능 범위: S1과 S2는 독립 진행 가능하다. S3/S4는 S1+S2 뒤, S5는 PR #1193과 S1+S2 뒤다. S6은 독립 가능하고, S7은 실제 EAS 자격/프로젝트가 필요하다. S8은 S5 머지 전에는 기존 2앱만 먼저 분리할 수 있다.

## 8. 모르는 것

- 실제 로컬 feed 주소와 S3 bucket/prefix.
- 자체 서명 인증서가 저장소 밖 어딘가에 이미 발급돼 있는지. GitHub secret/variable과 저장소에서는 못 찾았다.
- 사내 PC 중 AD 가입/미가입 대수와 루트 인증서 배포 완료 여부.
- 루트 미신뢰 PC에서 `electron-updater 6.8.9`가 이 앱 설정으로 내는 실제 설치 결과.
- Expo 3앱의 실제 EAS project/production update channel 존재 여부. 저장소 기본 설정은 placeholder다.
- `clients/internal-chat-desktop`을 #910/#935 트랙에 편입하라는 개발책임자 명시 결정. 독립 배포 앱이라는 코드 사실로 대상이라고 판단했으나, 정책 기록은 없다.

추정으로 채우지 않았다.

## 9. 라운드 종료 점검

최종 실측: **삭제된 추적 파일 0개 · `tools/.s24-build-only/build/deep/tracked-writer.mjs` 존재 및 추적 확인 · 이 워크트리를 사용하는 임시 Node/Java/Electron/브라우저 프로세스 0개**.
