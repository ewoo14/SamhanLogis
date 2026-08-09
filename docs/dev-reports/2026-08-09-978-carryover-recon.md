# #978 신속경로 이월 배치 정찰

- 정찰일: 2026-08-09 KST
- 작업 브랜치/HEAD: `feat/978-fast-path-carryover` / `e54a8d43d9f7c678d17912d5c9f21580ae0ec157`
- 최신 판정 기준: 로컬에 이미 존재하는 `origin/main` 객체. main 체크아웃·merge·pull 없이 `git show origin/main:...`와 `git grep origin/main`으로 읽었다.
- 제약: 코드 수정·DB write·Docker 재배포·이슈 생성 없음. 자격값은 출력하지 않았다.

## 요약 표

| 출처 | 이월 항목 | 판정 | 슬라이스 | 경로 |
|---|---|---|---|---|
| #957 | A-1 경로 표기 형태별 10사본 판정표 | 이미해결 | - | - |
| #957 | A-2 Linux Node·pwsh 실행 | 판정불가 | - | - |
| #957 | A-3 `net use` 매핑 드라이브 | 판정불가 | - | - |
| #957 | A-4 라인엔딩 수정 후 완전격리 전체 스위트 | 판정불가 | - | - |
| #957 | A-5 `operational-validation.ps1` 항목 4 `Join-Path` 배열 인자 | **유효** | **A** | **신속** |
| #967 | B-1 일곱 번째 수량 계열 존재 여부 | 판정불가 | - | - |
| #967 | B-2 같은 함수의 조용한 skip 4곳 | 이미해결 | - | - |
| #968 | C-1 문서양식 이미지 다섯 번째 표면 | 이미해결 | - | - |
| #968 | C-2 SOL 2차의 미검증 환경·표면 | 판정불가 | - | - |
| #958 | D-1 `syncTab` 롤백 뒤 `lastKnownRowHash` 잔존 | **유효** | **B** | **정밀** |
| #958 | D-2a 게이트웨이 경유 전 경로 | 판정불가 | - | - |
| #958 | D-2b 데스크톱·웹 화면 | 판정불가 | - | - |
| #958 | D-2c 이카운트 임포트 경로 | 판정불가 | - | - |
| #978 | E-1 SA 키가 컨테이너 재생성을 견디지 못함 | **유효** | **C** | **정밀** |

## 먼저 바로잡을 배경

1. `#957·#967·#968·#958`은 GitHub 객체상 이슈가 아니라 병합된 PR이다. 연결 원 이슈는 각각 `#851·#963·#965·#896`이다.
2. #978의 GitHub 생성 시각은 `2026-07-28T21:06:10Z`, 즉 KST `2026-07-29 06:06:10`이다. 2026-08-09 기준 약 11일이므로 “2주가 지났다”는 문장은 정확하지 않다. 저장소 개설 문서의 `2026-07-28 등록`은 UTC 날짜를 사용한 것으로 보인다.
3. #978 본문의 “전부 신속 경로·금액 비접촉”도 현행 판정과 다르다. D-1은 가격/단가 영속 무결성이고, E-1은 자격·배포 무결성이므로 정밀 경로가 맞다.

## (a) 원문에서 무엇을 남기고 닫았는가

### #957 — QA 증거 오염 가드

[마지막 머지 코멘트](https://github.com/ewoo14/Samhan-Public/pull/957#issuecomment-5106490600)의 원문:

> **경로 표기 형태별 10사본 판정표** — 1·2차 타임아웃의 주원인이라 3차에서 제외  
> **다른 OS 컨테이너**(Linux · pwsh 7) 실행  
> **`net use` 매핑 드라이브** 별도 RED/GREEN  
> 라인엔딩 수정 후 완전격리 전체 스위트  
> 선재 `operational-validation.ps1` 항목4 `Join-Path` 배열 건 — 관찰만

이를 #978 본문이 A-1~A-5로 옮겼다. A-1은 PR #989에서 소진됐고 A-2~A-5는 #978의 [진행 코멘트](https://github.com/ewoo14/Samhan-Public/issues/978#issuecomment-5120276804)에도 잔여로 명시됐다.

### #967 — 레거시 GAS 수량

[#967 동결 코멘트](https://github.com/ewoo14/Samhan-Public/pull/967#issuecomment-5104863910):

> **일곱 번째 계열이 있는지 확인하지 않았습니다.** SOL 재검증을 돌리지 않고 멈춥니다  
> SOL 2차 보고서의 *"보지 않은 것"* 항목 이월

[#967 마지막 머지 코멘트](https://github.com/ewoo14/Samhan-Public/pull/967#issuecomment-5105745185)는 한 항목을 더 구체화했다.

> 같은 함수의 **조용한 skip 4곳** — 구현자가 발견해 보고했으나 이번 범위 밖으로 두었습니다

원 네 곳은 당시 보고서와 #978 코멘트에 다음처럼 기록됐다.

```text
order-app/index.html:5651  const row = COMMULTI.find(...); if(!row) return;
order-app/index.html:5666  const row = COMMULTI.find(...); if(!row) return;
order-app/index.html:5686  if(!COMMULTI.find(...)) continue;
order-app/index.html:5720  const row = COMMULTI.find(...); if(!row) return;
```

### #968 — 문서양식 이미지

[#968 마지막 머지 코멘트](https://github.com/ewoo14/Samhan-Public/pull/968#issuecomment-5105631680):

> **다섯 번째 표면이 있는지 확인하지 않았습니다.** 마지막 fix 이후 SOL 재검증을 돌리지 않았습니다  
> SOL 2차 보고서의 *"이 라운드가 보지 않은 것"* 항목 이월

SOL 2차 보고서가 원문으로 열거한 미검증 표면은 물리 프린터, Safari/WebKit/Firefox, 네트워크 URL 이미지, 수백 개 이미지 부하, native Ctrl+ 확대, 실제 스크린리더 음성, `APPROVAL_GRID` BODY/FOOTER 비사용 조합, 공유 실데이터다. 별도로 `ApprovalDocView` 실행 증거, CMYK JPEG 계열, Electron 패키지 실기동도 미확인으로 기록돼 있다.

### #958 — 수량 동기화

[#958 마지막 머지 코멘트](https://github.com/ewoo14/Samhan-Public/pull/958#issuecomment-5106865062):

> 게이트웨이 경유 전 경로 재현(라우트 존재는 PM 이 별도 확인)  
> 데스크톱/웹 화면 — BE 전용 슬라이스  
> 이카운트 임포트 경로 — 정적 확인만  
> `syncTab` 의 `@Transactional` 전환이 만드는 롤백 시 `lastKnownRowHash` 잔존 시나리오 — **정적 관찰, 미확정**  
> SOL 2차 보고서의 *"보지 않은 것"* 이월

### #978 — SA 키 영구화

#978 본문 E-1 원문:

> **구글 SA 키가 컨테이너 재생성을 견디지 못함** — `docker compose up --force-recreate` 하면 `/etc/samhan/sa-key.json` 이 사라져 시트 동기화가 죽습니다. 현재 `docker cp` 로 직접 설치한 상태라 compose 볼륨 마운트가 필요합니다.

#978의 [2026-07-29 코멘트](https://github.com/ewoo14/Samhan-Public/issues/978#issuecomment-5111282170)는 회사PC에서 로컬 override로만 해소했으며 “PC마다 따로 해야 함”, “저장소 차원의 영구화는 아직 안 함”이라고 명시했다.

## (b) 현행 판정 근거

### A-1 — 이미해결

- 지목: PR [#989](https://github.com/ewoo14/Samhan-Public/pull/989), merge commit `722f16792ca930dc80fc00eddf359c16d7dc0a9e`.
- 최종 원문: 47 tests / 47 pass / 0 fail, CI 42/42, 다른 checkout의 `docs/qa` 차단 실행 확인.
- 따라서 A-1은 백로그에서 제거한다.

### A-2 — 판정불가

현재 PC에는 Docker Desktop과 `node:20-bookworm`, `mcr.microsoft.com/powershell:lts-ubuntu-22.04` 이미지가 있다. 읽기 전용 bind mount와 read-only container로 확인했다.

```text
pwsh Linux:
PWSH_OUTSIDE=/tmp/978-a2-outside
PWSH_COMMITTED=BLOCKED
PWSH_LINUX_EXIT=0

Node Linux:
Error: Cannot find module 'typescript'
tests 1 / pass 0 / fail 1
NODE_LINUX_EXIT=1
hostDesktopTypescript=False
```

pwsh resolver 표본 1건은 정상이나, Node 전체 가드와 10사본 OS 행렬은 의존성 부재로 실행하지 못했다. 일부 PASS를 전체 해결로 확대하지 않고 판정불가로 둔다.

### A-3 — 판정불가

```text
net use: There are no entries in the list.
netUseExit=0
mappedDriveCount=0
```

발화 표본이 0개다. 새 네트워크 매핑을 만드는 것은 이 정찰의 쓰기·자격 범위를 넘으므로 “결함 0”으로 세지 않는다.

### A-4 — 판정불가

- 현행 가드에는 UTF-16 resolver의 committed blob/checkout 바이트 동일성을 검사하는 N-1 테스트가 존재한다.
- 현 checkout의 두 UTF-16 PowerShell 파일은 BOM `FFFE`로 확인됐다.
- 그러나 완전격리 전체 스위트는 A-2와 같은 `typescript` 의존성 부재로 실행하지 못했다. 요구가 “전체 스위트”이므로 부분 정적 확인만으로 해결 판정하지 않는다.

### A-5 — 유효

#1127의 [PM 정찰 코멘트](https://github.com/ewoo14/Samhan-Public/pull/1127#issuecomment-5223851219)는 “그 파일에 `Join-Path`가 한 곳도 없음 → 해소”라고 했지만 현행과 다르다.

현행 계수:

```text
infrastructure/scripts/operational-validation.ps1 Join-Path = 30회
항목 4의 $csvSearchPaths = @(...) 안 Join-Path 호출 = 4회
```

항목 4 표현식을 그대로 최소 실행한 원문:

```text
resultCount=0
errorCount=1
Cannot convert 'System.Object[]' to the type 'System.String' required by parameter 'ChildPath'.
```

재현 절차:

1. PowerShell에서 항목 4의 네 `Join-Path` 호출과 쉼표를 그대로 `@(...)`로 평가한다.
2. 결과 배열 수와 `$Error.Count`를 센다.
3. 기대 4경로와 달리 결과 0, 오류 1을 확인한다.

발화 조건은 항목 4 실행 1곳이며 현재 1/1 재현된다.

### B-1 — 판정불가

이 항목은 특정 결함이 아니라 “아직 발견하지 않은 일곱 번째 계열이 있는가”라는 미수행 적대검증이다. 완전한 계열 모집단/oracle이 원문에도 정의돼 있지 않아 발화 조건의 분모를 만들 수 없다. 이후 PR/커밋 검색에서도 B-1을 소진했다는 기록은 없었다. “못 찾음”을 “없음”으로 바꾸지 않고 판정불가로 둔다.

### B-2 — 이미해결

- 지목: PR [#987](https://github.com/ewoo14/Samhan-Public/pull/987), merge commit `dda7e1e849c934d3e9991f169383cbfd917e81ca`.
- 원 네 위치는 `requireCommCatalogRow_`와 사용자 가시 경고로 전환됐다.
- PR 최종 합류 검증: order-app 18 files / 210 tests, typecheck exit 0, 실서버 bootstrap 기반 라이브QA에서 수량 0 누락은 경고 0, 필요한 호스 양쪽 누락은 경고 표시, 정상 카탈로그는 경고 0.
- 현행 order-app의 `if(!row) return` 한 곳은 바로 앞에서 `requireCommCatalogRow_`가 `missingModels`에 적재하고 함수 끝에서 `renderCommCatalogWarnings(missingModels)`를 호출하므로 원래의 “조용한 skip”이 아니다.

참고 발견: estimate-app에는 일반 모델 누락 시 `return null`로 끝나고 두 특수 모델만 throw하는 비대칭이 남아 있다. 다만 원 B-2 네 곳은 order-app이었고, 현재 실 카탈로그 drift 표본을 쓰기 없이 만들 수 없으므로 이 별도 관찰을 신규 유효 결함이나 이슈로 승격하지 않는다.

### C-1 — 이미해결

- 지목: PR [#990](https://github.com/ewoo14/Samhan-Public/pull/990), merge commit `8e55d2c012b71421bb974ebdc1162c2bc09921fe`.
- 다섯 번째 표면 정찰에서 실제 결함(형식별 data URL 접두사 차이로 안내한 JPEG가 저장 차단됨)을 찾아 수정했다.
- 최종 경계: PNG 48,129B, JPEG/WebP 48,126B 통과, 각 1B 초과 차단; 관련 Vitest 42/42와 schema 계열 47/47.
- 따라서 C-1은 백로그에서 제거한다.

### C-2 — 판정불가

원문이 남긴 환경 중 이 PC/정찰 범위에서 확보된 표본은 Chrome 계열뿐이다. 물리 프린터, Safari/WebKit/Firefox, 실제 스크린리더, 대규모 네트워크 이미지 부하 표본은 0이며 공유 실데이터 write도 금지돼 있다. PR #990은 C-1의 업로드 한계 안내를 고쳤을 뿐 이 환경 행렬을 소진했다고 기록하지 않았다.

### D-1 — 유효

주의: PR [#1139](https://github.com/ewoo14/Samhan-Public/pull/1139), merge commit `cdbbde4f43bbd13dad1157e420a18484a1f5f2e2`는 `ProductLookupSheetSyncService`의 별도 `lastKnownRowHash`를 제거했다. 원문이 지목한 클래스는 `ProductSheetSyncService`이므로 같은 이름의 다른 캐시를 고친 것이다.

최신 `origin/main` 실행 조회 원문:

```text
ProductSheetSyncService.java:177  private final Map<String, String> lastKnownRowHash = new ConcurrentHashMap<>();
ProductSheetSyncService.java:1161 @Transactional
ProductSheetSyncService.java:1284 lastKnownRowHash.put(modelCode, rowHash);
ProductSheetSyncService.java:1352 lastKnownRowHash.put(modelCode, rowHash);
ProductSheetSyncService.java:1360 lastKnownRowHash.put(modelCode, rowHash);
matching rollback/hash tests for this class = 0
```

세 `put` 뒤에도 `upsertSheetExposure`, `loadSpecsForProduct`, `syncBeforeIncreasePriceHistory`, soft-delete DB 작업이 이어져 예외 시 전체 트랜잭션은 롤백되지만 JVM map은 롤백되지 않는다. 다음 실행은 `prevHash == rowHash`로 판단해 DB에 반영되지 않은 행을 unchanged로 건너뛸 수 있다.

재현 절차(코드 경로, DB write 금지 때문에 라이브 주입은 하지 않음):

1. 변경된 시트 행 하나를 준비한다.
2. 위 세 `put` 중 하나 뒤의 DB 작업에서 예외를 발생시킨다.
3. DB rollback 뒤 같은 JVM에서 같은 행으로 재실행한다.
4. DB는 구값인데 `prevHash == rowHash`가 되어 unchanged로 빠지는지 확인한다.

발화 가능한 cache write 지점은 3곳, 이 결함을 잠그는 현행 테스트는 0건이다. 소스의 트랜잭션 경계와 후속 예외 가능 호출이 그대로이므로 유효로 판정한다. 실제 DB mutation 재현은 “실 DB 조회만” 제약 때문에 수행하지 않았다.

### D-2 — 판정불가

- 게이트웨이: 최신 설정에 `/api/v1/quantity-sync-rules` route는 존재한다. 그러나 인증된 end-to-end 실행 자격이 없어서 라우트 존재 이상을 확인하지 못했다.
- 데스크톱/웹: `/admin/sheet-sync` 화면과 order-app 소비 코드는 존재한다. 현재 컨테이너에 SA 키가 없어 실 sync 표본은 0이다.
- 이카운트 임포트: 실행은 product DB mutation을 동반하므로 이번 “실 DB 조회만” 범위에서 할 수 없다.

세 항목 모두 정적 존재를 런타임 정상으로 확대하지 않는다.

### E-1 — 유효

최신 `origin/main` compose/config 검색과 현재 실행 컨테이너를 read-only로 확인했다.

```text
origin/main compose의 /etc/samhan/sa-key.json mount = 0
runningTargetContainerCount=2
product-service       mountAtExpectedPath=0 envVarEntry=0 readableAtExpectedPath=False
partner-order-service mountAtExpectedPath=0 envVarEntry=0 readableAtExpectedPath=False
hostCandidateKeyCount=1
repoCandidateKeyCount=0
processEnvGoogleKeySet=False
```

호스트 저장소 밖 후보 키는 1개 있으나 두 실행 컨테이너 모두 기대 경로에서 읽을 수 없다. 재배포 없이도 현재 “키가 컨테이너에 없음”이 2/2 재현된다. compose에 mount가 없으므로 force-recreate 뒤에도 자동 복구될 계약이 없다.

## (c) PM이 자를 슬라이스 제안

### 슬라이스 A — 운영검증 CSV 경로 배열

- 바꿀 것: `operational-validation.ps1` 항목 4가 네 후보 경로를 각각 독립 문자열로 만들도록 배열 표현을 바로잡고 4경로 생성 회귀를 고정한다.
- 경로: **신속 경로**. 금액·회계·권한·도메인 데이터 무결성에 닿지 않는 운영검증 도구다.
- 난이도/위험: 낮음 / 낮음. 같은 파일의 A-2~A-4 검증과 충돌 가능성이 있으므로 후속 QA 가드 작업이 있다면 한 PR에 묶는 편이 낫다.

### 슬라이스 B — 제품 시트 sync 롤백-캐시 불일치

- 바꿀 것: `ProductSheetSyncService.syncTab`의 변경 판정이 트랜잭션 rollback과 독립된 JVM 캐시에 의존하지 않게 하고, put 이후 실패→재실행을 결정론적 IT로 고정한다.
- 경로: **정밀 경로**. `releasePrice`·`deliveryPrice`와 price history의 영속 무결성에 직접 닿는다.
- 난이도/위험: 높음 / 높음. #1139에서 cache 제거가 동시실행 회귀를 한 번 만들었던 전례가 있으므로 rollback, 동시 sync 순서 역전, 정규화, soft-delete/restore를 함께 봐야 한다.

### 슬라이스 C — SA 키 재생성 내구성

- 바꿀 것: 저장소 밖 SA 키 경로를 환경변수로 주입하고 product-service·partner-order-service에 read-only bind mount하는 compose 계약과 fail-closed 사전점검을 만든다.
- 경로: **정밀 경로**. 자격 파일과 배포 무결성을 다루며 잘못하면 비밀 유출 또는 두 서비스 동시 장애가 난다.
- 난이도/위험: 중간 / 높음. PC별 경로, 앱 uid 읽기 권한, 키 미설정 오류, `force-recreate` 후 복구, 키가 git에 들어오지 않는지까지 검증해야 한다.

## (d) 없는 SA 키·자격·환경

자격값은 확인하거나 출력하지 않았다.

| 항목 | 현재 없는 것 |
|---|---|
| E-1 런타임 | 두 컨테이너의 `/etc/samhan/sa-key.json` read-only mount; `GOOGLE_SERVICE_ACCOUNT_KEY=<redacted>` 주입 |
| E-1 저장소 계약 | 호스트 외부 키 경로를 받는 compose 변수(예: `<redacted>`), 미설정 fail-closed 점검 |
| D-2 gateway | 인증된 SYSTEM MASTER 세션/토큰 `<redacted>` |
| D-2 sheet sync | 컨테이너에서 읽을 수 있고 대상 시트 권한이 부여된 SA 자격 `<redacted>` |
| A-2/A-4 | 현 worktree의 `clients/desktop/node_modules/typescript` 의존성 |
| A-3 | 기존 `net use` 매핑 드라이브 표본(현재 0개); 필요 시 접근 가능한 SMB 자격 `<redacted>` |
| C-2 | Safari/WebKit/Firefox·물리 프린터·실 스크린리더 환경 |

호스트 저장소 밖 후보 키 파일은 1개 존재한다. 따라서 “키 값 자체가 없음”이 아니라 **키를 안전하게 컨테이너에 연결하는 저장소 계약과 실행 자격이 없음**이 정확한 진술이다.

## 개발책임자 판단이 필요한 질문

1. 권장 순서는 **B(D-1 정밀) → C(E-1 정밀) → A(A-5 신속)**다. D-1은 단가 무결성이고 현행 테스트가 0건이라 우선순위가 가장 높다. 이 순서로 PM이 슬라이스를 자를지 확인이 필요하다.
2. C(E-1)는 두 PC의 호스트 경로를 compose 환경변수로 표준화해야 한다. 키를 새로 발급할 필요는 없어 보이며, 현재 저장소 밖 후보를 계속 쓸지 또는 별도 표준 경로로 이동할지만 결정이 필요하다. 값은 어떤 문서·PR에도 기록하면 안 된다.

## 정찰 종료 상태

- 새 이슈·코드 수정·commit·push·main checkout·Docker 재배포 없음.
- 실 DB write 없음.
- 이 보고서 외 저장소 파일 변경 없음.
