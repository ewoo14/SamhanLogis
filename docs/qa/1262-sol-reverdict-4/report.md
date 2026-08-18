# PR #1262 CODEX SOL 적대검증 최종 재판정 (4회차)

## ① 검증 SHA

- 검증 HEAD: `0399facd546620872df891b764c9077a5111e5e2`
- PR #1262 원격 head SHA도 위 SHA와 일치한다.
- 브랜치: `chore/mask-sheet-identifier`
- 비교 기준: `origin/main...HEAD`
- 식별자 값 자체는 이 보고서에 기록하지 않는다.

## ② fix3 목록에 없던 형태와 그 결과

fix3가 열거하지 않았거나 실제 검색 기준을 밝히지 않은 형태를 별도 축으로 검사했다.

- Base64 및 URL-safe Base64: 0건
- 16진수 및 문자코드 배열: 0건
- Unicode/16진 이스케이프: 0건
- 역순 및 ROT13: 0건
- MD5·SHA-1·SHA-256 파생값: 0건
- 같은 줄·여러 줄 문자열 리터럴 분할/연결: 0건
- 6자 미만의 짧은 앞·뒤 조각: **1건**

짧은 조각 잔존 위치는 `docs/dev-reports/2026-08-08-896-sheet-tab-inventory.md:67`이다. 5자와 4자 앞·뒤 조각을 생략부호로 결합한 문서 표기이며, 실행 코드·Spring 기본값·legacy GAS 원문이 아니므로 보류할 수 없다. 이 줄은 `origin/main`과 HEAD 양쪽에 존재하지만, 이번 작업이 선언한 추적 파일 전수 마스킹 기준에서는 증거 무결성 누락이다. 4자 이하 후보는 lockfile 무결성 문자열과 내장 폰트 데이터의 우연 일치였고 대상 식별자 표기가 아니었다.

## ③ fix3의 3파일·6줄 확인

지정 SHA의 blob과 현재 워크트리를 분리해 직접 확인했다.

- `docs/dev-reports/sp-08-8-credential-plaintext-guard.md:137,143,147`: HEAD에서 3줄 모두 마스킹됨.
- `scripts/check-credential-plaintext.sh:257,272`: 현재 워크트리에서는 마스킹됐지만 HEAD에는 반영되지 않음.
- `scripts/generate-sp-07-google-sheets-source-screenshots.mjs:53`: 현재 워크트리에서는 마스킹됐지만 HEAD에는 반영되지 않음.

커밋 `0399facd5`의 변경 파일은 문서 1개와 QA 보고서 2개뿐이다. 뒤의 두 소스 파일 변경은 `git status`상 미커밋 수정이며 PR head에 없다. 따라서 fix3 보고의 “3파일·6줄 마스킹” 중 PR에 실제 반영된 것은 **1파일·3줄**뿐이고, **2파일·3줄은 지정 SHA에 여전히 남아 있다**.

## ④ 보류 8건 각각의 귀속

정확 전체 문자열 8건을 각 파일에서 열고 변수 사용처와 시트 접근 호출까지 확인했다.

1. `clients/web/estimate-app/lib/code.js:129` — 실행 코드. 실행 상수는 파일 안에서 15회 참조되고 `openById` 호출 13곳에 연결된다.
2. `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductLookupSheetSyncService.java:49` — Spring 기본값. 주입 필드가 실제 조회 경로에 전달된다.
3. `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:84` — Spring 기본값. 주입 필드가 실제 읽기·동기화 경로에 전달된다.
4. `tools/legacy-gas/거래처 발송 주문서/Code.js:71` — legacy GAS 원문 실행 상수. 상수 참조와 `openById` 호출이 존재한다.
5. `tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:23` — legacy GAS 원문 실행 상수. 상수 참조와 `openById` 호출이 존재한다.
6. `tools/legacy-gas/일마감 프로그램/Code.js:8` — legacy GAS 원문 실행 URL. URL 상수 참조와 `openByUrl` 호출 2곳이 존재한다.
7. `tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:23` — legacy GAS 원문 실행 상수. 상수 참조와 `openById` 호출이 존재한다.
8. `tools/legacy-gas/종합견적서/Code.js:49` — legacy GAS 원문 실행 상수. 상수 참조와 `openById` 호출이 존재한다.

8건 모두 허용된 세 범주 중 하나이며 보류는 정당하다. 보류 밖 잔존 4건을 여기에 흡수하지 않았다.

## ⑤ 보호 대상 diff와 도달 결함

- `git diff origin/main...HEAD`에서 위 보호 대상 8개 경로와 변경 경로의 교집합은 **0파일**이다.
- Spring 기본값 제거, 실행 상수 변경, legacy GAS 원문 변경은 없다.
- 런타임 경로로 잡힌 변경은 테스트 4파일과 `GoogleSheetsClient.java`의 Javadoc 예시 마스킹 1줄뿐이다. 화면·라우트·API·실행 메서드 본문 변경은 없다.
- 기본값 제거로 시트 동기화 IT 5건을 깨뜨리는 패턴은 재현되지 않았다.
- fix3가 새로 만든 실 사용자 화면 재현 결함: **0건**.

`git diff --check origin/main...HEAD`는 기존 QA 보고서의 EOF/공백 3곳 때문에 종료코드 2였으나, 사용자 도달 결함이나 보호 대상 변경은 아니다.

## ⑥ credential guard·Jest

- credential guard: `[PASS] 자격 평문 비공개 — 위반 없음`, 종료코드 **0**.
- Jest 전량: **21 suites passed, 360 tests passed, 0 snapshots**, 종료코드 **0**.
- 종료코드는 파이프 뒤 `$?`가 아니라 각 명령 종료 직후 `$LASTEXITCODE`로 별도 수집했다.
- guard 실행 시 워크트리의 미커밋 차이는 주석 2줄 마스킹뿐이며 검사 로직은 지정 SHA와 동일하다.
- guard는 완전한 장문 형태를 검사하므로 이번의 짧은 조각과 커밋 누락을 검출하지 못한다. guard 성공을 증거 무결성 0의 근거로 사용하지 않았다.

## ⑦ CI 귀속

- PR head check-run: 총 **35개**.
- 완료 성공 **17개**, 진행 중 **3개**, 대기 **15개**, 실패 **0개**.
- GitGuardian Security Checks: **success**.
- docs 관할 자격 평문 비공개 가드: **success**.
- 현재 실패 check는 없어 PR 귀속 실패도 없다. 다만 18개가 아직 진행/대기 상태이므로 CI 전체 green은 아니다.

## ⑧ 최종 판정과 수렴 의견

**머지 불가 — 도달 0건 · 증거 무결성 4건.**

남은 증거 무결성은 줄 단위로 다음 4건이다.

- 지정 SHA에 반영되지 않은 축약형 마스킹: 2파일·3줄.
- fix3의 실질 검색 하한 아래에 있던 더 짧은 앞·뒤 조각 결합 표기: 1파일·1줄.

fix 상한 3은 모두 소진됐다. 기술적으로는 잔존 위치가 특정됐고 한 번의 원자적 반영으로 닫을 수 있어 **이 축 자체는 수렴 가능**하다. 그러나 세 차례 연속 “누락 0건” 오판에 이어, 마지막 fix에서도 작업트리 결과를 커밋 결과로 오인했고 검색 하한 아래 형태를 다시 놓쳤다. 따라서 **현재 검증·반영 프로세스는 상한 안에서 수렴하지 못했다**고 판단한다. 되돌릴지의 최종 판단은 개발책임자에게 올린다.

## ⑨ 프로세스 회수

- 최초 guard 호출은 부모 셸 시간 초과로 고아 bash 2개가 남았고, PID와 명령을 확인한 뒤 둘 다 회수했다.
- 재실행한 guard의 bash는 정상 종료했고 잔여 0개다.
- Jest 전 Node 총수는 62개였다. 이번 검증에서 새로 생긴 Node 1개를 식별해 회수했고, 이번 검증 기동 Node 최종 잔여는 **0개**다.
- 회수 후 시스템 Node 총수는 62개로 시작 기준과 같다.
- 공유 컨테이너에는 조회·중지·재시작 명령을 실행하지 않았으며 지정된 24개를 그대로 두었다.
- 다른 워크트리의 파일·프로세스는 변경하거나 회수하지 않았다.
