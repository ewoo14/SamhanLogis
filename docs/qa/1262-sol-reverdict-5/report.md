# PR #1262 CODEX SOL 적대검증 최종 판정 (5회차)

## ① 검증 SHA

- 검증 HEAD: `6d56dcfe9547f37b9df1ed8e910086517aceb2dc`
- PR #1262 원격 head SHA도 위 SHA와 일치한다.
- 브랜치: `chore/mask-sheet-identifier`
- 비교 기준: `git diff origin/main...HEAD`
- 판정은 워크트리 파일이 아니라 `git show HEAD:<경로>`와 커밋 diff를 기준으로 했다.
- 보고서 작성 전 `git status --porcelain`은 깨끗했다.
- 식별자 값 자체는 이 보고서에 기록하지 않는다.

## ② 커밋된 내용 기준 4차 지적 반영 확인

4차에서 지적한 PR SHA 미반영 3줄과 짧은 조각 1줄을 HEAD blob으로 재확인했다.

- `934ab038c`: `scripts/check-credential-plaintext.sh:257,272`의 주석 2줄과 `scripts/generate-sp-07-google-sheets-source-screenshots.mjs:53`의 표시 데이터 1줄이 실제 커밋에 마스킹되어 있다.
- `6d56dcfe9`: `docs/dev-reports/2026-08-08-896-sheet-tab-inventory.md:67`의 짧은 앞·뒤 조각이 실제 커밋에 마스킹되어 있다.
- fix4가 재검색 중 추가 발견한 같은 문서 `:68`의 두 번째 짧은 조각도 `6d56dcfe9`에 함께 마스킹되어 있다.
- 4차 문서 3줄인 `docs/dev-reports/sp-08-8-credential-plaintext-guard.md:137,143,147`도 HEAD에서 계속 마스킹 상태다.

따라서 4차 지적 4건과 fix4 추가 발견 1건은 모두 PR HEAD에 반영됐다. 이번에는 워크트리와 PR SHA 사이의 불일치가 없다.

## ③ 새 형태 탐색 결과

fix4의 ASCII/유니코드 생략부호 + 앞·뒤 2~8자 검색을 그대로 신뢰하지 않고, 그 방법으로 잡히지 않는 형태를 커밋된 추적 텍스트에서 별도 검사했다.

- 원문 조각: 접두·1/4·중앙·3/4·접미 위치의 4·5·6·8자 연속 조각을 검사했다. 보호 대상 8파일 밖 후보 0건.
- 단측·재배열: 2~8자 접두만/접미만 남긴 표기, 중앙 조각만 남긴 표기, 앞뒤 순서를 바꾼 표기 0건.
- 비생략 구분: 슬래시·파이프·콜론·하이픈·밑줄·공백·별표·비공개 표기로 앞뒤 조각을 결합한 형태 0건.
- 분할·은닉: 문자별 및 2~3자 그룹 공백/점/하이픈/밑줄 분할, JS 문자열 연결, 전각, 제로폭 삽입 0건.
- 방향·치환: 역순, ROT13, 대소문자 변형 추가분 0건.
- 인코딩·파생: Base32, Base64/Base64URL, 16진, 퍼센트 인코딩, Unicode/JS escape, HTML entity, 10진 문자코드 배열, MD5·SHA-1·SHA-256·SHA-384·SHA-512 0건.
- 파일명 경로에도 새 후보 0건.

새 형태는 발견하지 못했다. 네 차례 연속 새 형태가 나왔던 것과 달리, 이번에는 fix4 검색의 사각지대를 명시적으로 확장해도 추가 누락이 없었다.

## ④ 보류 8건

정확 전체 문자열의 HEAD 잔존은 8파일·8건이며 모두 허용된 세 범주에 속한다.

1. `clients/web/estimate-app/lib/code.js:129` — 실행 상수. 같은 파일의 `openById` 호출 13곳에 연결된다.
2. `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductLookupSheetSyncService.java:49` — Spring 기본값. 주입 필드가 파일 안에서 6회 참조된다.
3. `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:84` — Spring 기본값. 주입 필드가 파일 안에서 8회 참조된다.
4. `tools/legacy-gas/거래처 발송 주문서/Code.js:71` — legacy GAS 실행 원문. `openById` 호출이 존재한다.
5. `tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:23` — legacy GAS 실행 원문. `openById` 호출이 존재한다.
6. `tools/legacy-gas/일마감 프로그램/Code.js:8` — legacy GAS 실행 원문 URL. `openByUrl` 호출 2곳이 존재한다.
7. `tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:23` — legacy GAS 실행 원문. `openById` 호출이 존재한다.
8. `tools/legacy-gas/종합견적서/Code.js:49` — legacy GAS 실행 원문. `openById` 호출이 존재한다.

보류 밖 정확 문자열, 4자 이상 원문 조각, 변환 형태의 잔존은 0건이다. 보류 8건은 여전히 정당하다.

## ⑤ 보호 대상 diff와 도달 결함

- `git diff origin/main...HEAD`의 변경 64파일과 위 보호 대상 8경로의 교집합은 0파일이다.
- Mobile-Staff 변경 경로도 0파일이다.
- main 소스 경로의 유일한 변경은 `GoogleSheetsClient.java` Javadoc 예시 1줄 마스킹이며 메서드 본문은 바뀌지 않았다.
- 그 밖의 실행 가능한 변경은 테스트 fixture, credential guard 주석, QA 스크린샷 생성 표시 데이터다. 사용자 화면·라우트·API·Spring 기본값·legacy GAS 실행 원문 변경은 없다.
- `git diff --check origin/main...HEAD` 종료코드 2는 기존 QA 보고서의 EOF 빈 줄 1곳과 trailing whitespace 2곳이다. 도달 결함이나 보호 대상 변경은 아니다.

실 사용자가 화면을 통해 재현할 수 있는 결함은 **0건**이다.

## ⑥ credential guard·Jest

- credential guard: `[PASS] 자격 평문 비공개 — 위반 없음`, 종료코드 **0**, 92.7초.
- Jest 전량: **21 suites passed, 360 tests passed, 0 snapshots**, 종료코드 **0**, 26.1초.
- 두 종료코드는 파이프의 `$?`가 아니라 각 명령 반환 직후 `$LASTEXITCODE`로 별도 보존했다.

## ⑦ CI 귀속

PR HEAD의 check-run을 REST로 직접 확인했다.

- 총 49개: 성공 48개, 실패 1개, 진행 중 0개.
- GitGuardian Security Checks와 credential guard 2종은 모두 성공했다.
- `JUnit 테스트 결과 …` 리포터 잡들은 모두 성공했다.
- `Desktop Playwright (mock 회귀 hard gate)`는 최종 성공했다.
- 실패: `Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)`.
  - `Set up job`은 성공했고 실제 실패 단계는 Mobile-Staff 단위 테스트다.
  - 6 suite 중 1 suite, 17 test 중 화면 도달성 1 test가 5초 제한을 넘겼다. 로그는 worker teardown 누수도 함께 경고한다.
  - PR diff의 Mobile-Staff 경로는 0파일이므로 이 실패는 PR #1262 변경에 귀속되지 않는 타이밍/정리 누수성 실패로 판정한다.
  - 로컬 단독 재현은 `clients/mobile-staff` 의존성이 설치되어 있지 않아 Jest 자체가 시작되지 않았으며, 이를 성공 재현 근거로 사용하지 않았다.

따라서 PR 귀속 CI 실패는 0건이다. 다만 최종 조회 시점 CI는 비귀속 실패 1건 때문에 전체 green 상태는 아니다.

## ⑧ 최종 판정과 수렴 판단

**머지 가능 — 도달 결함 0건 · 증거 무결성 결함 0건.**

4차 지적은 전부 PR SHA에 들어갔고, fix4 방식으로 잡히지 않는 단측·재배열·분할·인코딩·파생 형태까지 확장했으나 새 형태를 찾지 못했다. 지시된 수렴 기준에 따라 **이 축은 닫혔다**고 판정한다.

단, 저장소 운영 규칙상 실제 머지 실행은 Mobile-Staff 비귀속 실패 재실행 등으로 CI green을 회복한 뒤 개발책임자 trigger를 받아야 한다. 이는 PR 결함 판정을 뒤집는 차단 결함이 아니라 머지 절차의 남은 조건이다.

## ⑨ 프로세스 회수

- credential guard와 estimate-app Jest가 기동한 프로세스는 정상 종료했다.
- Mobile-Staff 단독 재현 시도는 의존성 부재로 Node/Jest를 기동하지 못했다.
- 각 실행 전후 PID 대조와 최종 명령행 확인 결과, 이번 검증이 기동한 Node 최종 잔여는 **0개**다.
- 최종 시스템 Node 총수는 63개였고, 다른 워크트리 활동으로 검증 중 59→60→63개로 변동했다. 이 워크트리 경로를 사용하는 Node와 이번 검증 기동 Node 잔여는 모두 0개다. 다른 워크트리·공유 프로세스는 건드리지 않았다.
- Docker 실행 컨테이너 총수는 조회 시 28개에서 최종 26개로 변동했으나, 이 검증은 개수 조회 외 Docker 명령을 실행하지 않았다. 지정된 공유 컨테이너 24개를 포함해 어떤 컨테이너도 중지·재시작·변경하지 않았다.
- 코드 수정, `git add`, commit, push는 수행하지 않았다. 요청된 이 보고서만 생성했다.
