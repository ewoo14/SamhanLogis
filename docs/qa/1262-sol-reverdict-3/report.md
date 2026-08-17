# PR #1262 CODEX SOL 적대검증 최종 재판정 (3회차)

## ① 검증 SHA

- 검증 HEAD: `3f993682a5995bffa8246cc1f6195ae854f06ba7`
- `git log --oneline -3` 선두: `3f993682a Merge remote-tracking branch 'origin/main' into chore/mask-sheet-identifier`
- 브랜치: `chore/mask-sheet-identifier`
- 비교 기준: `origin/main...HEAD`
- `origin/main` 및 merge-base: `61e86641e05edd449cb1570d317806b5d2cb88cf`
- 식별자 값 자체는 이 보고서에 기록하지 않는다.

## ② 세는 방법 변경과 결과

앞선 라운드의 `git grep` 정확 일치 및 장문 토큰 보조검색을 재사용하지 않았다.

1. 보호된 legacy GAS 원문에서 비교 토큰을 프로세스 메모리로만 추출했다. 값은 화면·파일에 출력하지 않았다.
2. `git ls-files` 22,087개를 기준 집합으로 만들고, ripgrep의 바이너리 포함 검색 결과를 이 집합과 교차했다.
3. 정확 일치, 대소문자 무시 일치를 별도 패스로 셌다.
4. 토큰의 여러 위치를 8자 조각과 6자 조각으로 나눠 전체 디렉터리·전체 확장자·주석 안쪽까지 별도 검색했다.
5. 조각 후보는 원문을 출력하지 않고 파일:줄과 문맥 종류만 직접 확인했다.

실측 결과:

- 정확 일치: **8파일·8건**
- 대소문자 무시 전체: **8건**, 대소문자 변형 추가분: **0건**
- 정확 일치의 확장자별 집계: `.java` 2파일·2건, `.js` 6파일·6건
- 정확 일치의 최상위 디렉터리별 집계: `clients` 1건, `services` 2건, `tools` 5건
- 정확 일치가 주석/Javadoc 안에 남은 건: **0건**
- 부분문자열 후보: **3파일·6줄·7조각 hit**. 한 줄에 앞·뒤 조각이 함께 있어 줄 수보다 hit가 1 많다.

부분문자열 6줄은 모두 축약된 동일 식별자 표기임을 확인했다.

- `docs/dev-reports/sp-08-8-credential-plaintext-guard.md:137`
- `docs/dev-reports/sp-08-8-credential-plaintext-guard.md:143`
- `docs/dev-reports/sp-08-8-credential-plaintext-guard.md:147`
- `scripts/check-credential-plaintext.sh:257` — 주석
- `scripts/check-credential-plaintext.sh:272` — 주석
- `scripts/generate-sp-07-google-sheets-source-screenshots.mjs:53` — 스크린샷 표시 데이터

위 6줄은 실제 시트 접근 실행 코드, Spring 기본값, legacy GAS 원문이 아니다. 따라서 **보류가 아니라 마스킹 누락 6건**이다. 특히 주석 2줄과 생성 데이터 1줄을 보류로 숨길 근거가 없다. `docs/dev-reports/sp-08-8-credential-plaintext-guard.md`는 PR diff에 들어갔는데도 3줄이 남았고, 나머지 두 파일은 PR diff 밖에서 전수 대상에서 누락됐다.

## ③ 보류 8건 각각의 정당성 검증

정확 일치 8건은 아래와 같이 모두 허용 범주에 해당한다.

1. `clients/web/estimate-app/lib/code.js:129` — 실행 상수. 같은 파일의 `SpreadsheetApp.openById` 호출 13곳과 테스트 공개 상수에서 직접 참조한다.
2. `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductLookupSheetSyncService.java:49` — `${google.sheets.sheet-id:...}` Spring 기본값. 주입 필드가 실제 `readSheetDisplay` 3곳에 전달된다.
3. `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:84` — 동일 Spring 기본값. 주입 필드가 실제 시트 읽기 및 동기화 호출에 전달된다.
4. `tools/legacy-gas/거래처 발송 주문서/Code.js:71` — legacy GAS 실행 상수. 같은 원문의 `openById` 호출에서 직접 참조한다.
5. `tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:23` — legacy GAS 실행 상수. 같은 원문의 다수 `openById` 호출에서 직접 참조한다.
6. `tools/legacy-gas/일마감 프로그램/Code.js:8` — legacy GAS 실행 URL. 같은 원문의 `openByUrl` 호출 2곳에서 직접 참조한다.
7. `tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:23` — legacy GAS 실행 상수. 같은 원문의 다수 `openById` 호출에서 직접 참조한다.
8. `tools/legacy-gas/종합견적서/Code.js:49` — legacy GAS 실행 상수. 같은 원문의 다수 `openById` 호출에서 직접 참조한다.

보류 8건은 **8파일·8건**, 누락은 별도로 **3파일·6줄**이다. 보류 분류로 누락을 흡수하지 않았다.

## ④ 보호 대상 diff와 도달 결함

- `git diff origin/main...HEAD`를 직접 확인했다.
- 위 실행 코드·Spring 기본값·legacy GAS 원문 8개 경로와 diff의 교집합: **0파일**.
- 런타임 소스 경로로 잡히는 `GoogleSheetsClient.java`의 유일한 변경 hunk는 Javadoc 예시 1줄 마스킹이다. 메서드 본문·호출·기본값은 변경되지 않았다.
- 따라서 기본값 제거 이력으로 깨졌던 시트 동기화 IT 5건의 보호선은 유지됐다.
- merge commit의 두 번째 부모가 현재 `origin/main`과 같고, merged HEAD에서 Jest 전량 및 원격 Playwright가 통과했다.
- 화면·라우트·API 실행 표면 변경이 없으며, 실 사용자가 화면을 통해 재현할 수 있는 결함: **0건**.
- 참고: `git diff --check origin/main...HEAD`는 기존 QA 보고서의 trailing whitespace 2줄 때문에 종료코드 2다. 사용자 도달 결함이나 이번 식별자 누락 수와는 별개다.

## ⑤ credential guard·Jest 재현

- credential guard
  - 명령: `C:\Program Files\Git\bin\bash.exe scripts/check-credential-plaintext.sh`
  - 결과: `[PASS] 자격 평문 비공개 — 위반 없음`
  - 종료코드: **0**
  - 소요: 106.8초
- Jest 전량
  - 위치: `clients/web/estimate-app`
  - 명령: `npm test -- --runInBand`
  - 결과: **21 suites passed, 360 tests passed, 0 snapshots**
  - 종료코드: **0**
  - 소요: 22.1초

두 종료코드는 각 명령 종료 직후 별도로 수집했다. 현재 guard의 정규식은 완전한 장문 토큰을 잡지만 위 축약 표기 6줄은 잡지 못하므로, guard 성공을 마스킹 완결의 증거로 사용하지 않았다.

## ⑥ CI 판정

- PR HEAD check-run REST 재조회: **35개**
- 완료 성공: **17개**, 완료 실패: **1개**, queued/in-progress: **17개**
- 유일한 실패: `빌드 + 테스트 (accounting-cash-receipt-it)`
  - job REST의 step은 `Set up job` 1개뿐이며 그 step 자체가 failure다.
  - PR 코드·테스트 step은 시작되지 않았다. 지시 기준에 따라 GitHub 인프라 장애이며 이 PR 원인이 아니다.
- GitGuardian Security Checks: **success**
- docs 관할 자격 평문 비공개 가드: **success**
- CI의 `Credential Plaintext Guard (SP-08-8)`: 현재 **queued**
- web/electron/mobile Playwright 및 Desktop Playwright hard gate: **success**

## ⑦ 최종 판정

**머지 불가 — 도달 0건 · 증거 무결성 6건.**

정확 식별자 8건은 정당한 보류지만, 앞선 “누락 0건” 재검색은 축약 표기 **3파일·6줄**을 놓쳤다. 유일한 질문인 실 사용자 화면 재현 결함은 0건이나, 허용된 예외인 증거 무결성 결함 6건이 남아 있으므로 현재 상태로는 머지할 수 없다.

## ⑧ 프로세스 회수

- credential guard의 Git Bash: 정상 종료, 잔여 0개.
- Jest 실행 전후 새 Node PID: **0개**.
- 이번 검증이 기동한 Node/Jest 프로세스 최종 잔여: **0개**.
- 최종 시스템 Node 총수는 56개다. 세션 시작 기준 외 5개는 다른 워크트리 또는 공유 프로세스로 확인되어 지시대로 건드리지 않았다.
- 공유 컨테이너에는 조회·중지·재시작 명령을 실행하지 않았고, 지정된 24개를 그대로 두었다.
- 다른 워크트리의 파일·프로세스는 변경하거나 회수하지 않았다.

