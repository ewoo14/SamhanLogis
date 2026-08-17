# PR #1262 CODEX SOL 적대검증 머지 판정

- 검증일: 2026-08-17
- 검증 HEAD: `4972b4b85e3a6f2aba4a9a6699b8f00867d83cdf`
- 기준 브랜치: `origin/main` (`d0250cd0e0138539950e2c9d9a011066e4d20ead`)
- 원칙: 식별자 값 자체는 기록하지 않는다.

## ① 동작 무손상 확인

- 현재 PR diff는 51파일·271삽입·68삭제다. 변경 경로는 문서·메모리·QA 산출물·테스트/Playwright fixture뿐이며, 실행 코드·서비스 main 코드·Spring 설정·legacy GAS에는 diff가 없다.
- `clients/web/estimate-app/test/calc-fidelity.test.js:71`의 CI fix는 옳다. fixture 키를 `code._constants.SRC_SHEET_ID`에서 가져오므로 `injectSheet()`와 실행 코드 `openById()`가 같은 키를 사용한다. 테스트에 식별자 평문을 되살리지 않으면서 fixture 의미를 유지한다.
- `clients/web/estimate-app`에서 `npm test -- --runInBand`를 재실행했다: **21 suites, 360 tests 전부 PASS**. `calc-fidelity.test.js`도 PASS다.
- 변경 fixture 의미를 확인했다.
  - `clients/desktop/playwright/1095-r10-real-qa/1095-r10-first-task-real-qa.spec.ts:18,135`: 환경변수 주입을 사용하고 미주입 시 명시 실패하므로 실 시트 QA 의미가 유지된다.
  - `clients/desktop/playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts:69`: 마스킹된 문서 계약을 확인하므로 변경 목적과 일치한다.
  - `docs/qa/896-legacy-output-baseline/capture-baseline.mjs:145`: 실행 입력이 아니라 공개 metadata만 마스킹하므로 캡처 동작을 바꾸지 않는다.
- **증거 무결성 결함 1건:** `clients/desktop/playwright/full-menu-contract/full-menu-contract.spec.ts:172`는 보류되어 평문을 유지한 legacy GAS를 직접 읽으면서 `<SHEET_ID>`가 들어 있다고 단정한다. 같은 문자열 포함 단정을 로컬에서 재현한 결과 `ASSERTION_PRESENT=True`, `SOURCE_MATCHES_MASKED_EXPECTATION=False`, exit 1이었다. 이 fixture는 현재 원문 보존 계약을 검증하지 못한다.
- 사용자 화면의 `/admin/sheet-sync`는 현행 코드상 실제 동기화 실행 화면이 아니라 “구글 시트 연계 폐기·DB 기준” 안내 전용이며 PR diff 밖이다. 연결 가능한 브라우저가 0개여서 신규 라이브 캡처는 만들지 않았다. 원격 E2E는 green이고 실행 경로 변경도 없어 화면 도달 결함 증거는 없다.

## ② 보류 항목 유지

- 실행 코드, Spring 기본값, legacy GAS 원문 대상에 대한 PR diff: **0파일**.
- 현재 남은 평문 중 보류 분류는 9파일·9건이다.
  - 실행 코드/실행 파일: `clients/web/estimate-app/lib/code.js:129`, `services/product-service/src/main/java/com/samhanair/logis/product/client/GoogleSheetsClient.java:125`
  - Spring 기본값: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductLookupSheetSyncService.java:49`, `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:84`
  - legacy GAS 원문: `tools/legacy-gas/거래처 발송 주문서/Code.js:71`, `tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:23`, `tools/legacy-gas/일마감 프로그램/Code.js:8`, `tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:23`, `tools/legacy-gas/종합견적서/Code.js:49`

## ③ 남은 파일 수와 분류

- 구현 시작 기준 `main` (`5460b1609`) 재측정: **55파일·72건**.
- 최초 마스킹 커밋은 50파일을 변경했지만, 그 구성은 신규 보고서 1파일 + 기존 파일 49개다. 기존 49개 중 완전한 식별자 평문을 제거한 것은 41파일이고, 나머지는 부분 표기 마스킹이다. 따라서 “55 - 50 = 5”는 실제 평문 파일 수 계산이 아니다.
- 최신 `main` 병합 후 현재 HEAD 재측정: **10파일·10건**.
  - 보류 대상: 위 ②의 9파일·9건.
  - **마스킹 누락 1파일·1건:** `docs/qa/1241-luna-ci-fix-report.md:55`.
- 누락 파일은 PR 작업 후 `main`에 들어온 `d0250cd0e`의 QA 보고서이며, 최종 `main` 병합 때 유입됐다. 문서·QA 마스킹 범위이므로 보류 대상이 아니다.

## ④ credential guard 재현

- 요청된 `bash scripts/check-credential-plaintext.sh`는 Windows WSL 경로에서 489초 동안 출력 없이 CPU 0 상태로 정지해 해당 실행만 회수했다.
- 동일 스크립트를 `C:\Program Files\Git\bin\bash.exe`로 재실행했고 96.8초 만에 exit 0으로 완주했다.

```text
[PASS] 자격 평문 비공개 — 위반 없음
```

## ⑤ 문서 의미

- `<SHEET_ID>` 치환 뒤에도 문서마다 시트 용도, 탭 이름, 범위, 데이터 흐름, 환경변수명이 남아 있어 독자가 무엇을 가리키는지 알 수 있다.
- URL 예시는 실행 가능한 실 URL 대신 의도된 placeholder URL이 되었고, 문서 설명의 의미는 유지된다.
- 다만 ③의 QA 보고서 1파일은 평문이 남아 문서 트랙의 일괄 마스킹이 완결되지 않았다.

## ⑥ CI 판정

- PR HEAD의 GitHub check-run을 REST로 직접 재조회했다. CI, Docs Guard, Harness Guard, QA E2E, 배포 검증을 포함한 모든 check-run이 `completed/success`다.
- `GitGuardian Security Checks`: **success**. 이 PR 원인의 GitGuardian 실패는 없다.
- `Credential Plaintext Guard (SP-08-8)`와 `자격 평문 비공개 가드 (docs 관할, SP-08-8)`: 모두 **success**.
- GitHub GraphQL 조회는 한 차례 HTTP 503이었으나 REST check-run과 workflow run 조회는 정상 완료됐고, 판정에는 영향이 없다.

## ⑦ 머지 판정

**머지 불가 — 실 사용자 화면 도달 결함 0건, 증거 무결성 예외 2건.**

차단 사유:

1. `docs/qa/1241-luna-ci-fix-report.md:55`의 문서 평문 1건이 최종 `main` 병합에서 유입되어 마스킹 목표가 미완결이다.
2. `clients/desktop/playwright/full-menu-contract/full-menu-contract.spec.ts:172`의 변경 단정이 보류된 legacy GAS 원문과 모순되어 fixture 의미가 깨졌다.

실행 경로 회귀나 사용자 화면 재현 결함은 발견하지 않았다. 위 두 증거 무결성 결함을 해소하고 동일 재검증 전에는 머지하면 안 된다.

## ⑧ 프로세스 회수

- 새로 기동한 컨테이너: 0개.
- 기존 공유 컨테이너: **24개 유지**. 중지·재시작·변경하지 않았다.
- Jest 프로세스: 정상 종료.
- 정지한 WSL/bash credential guard 프로세스: 회수.
- Git Bash credential guard 프로세스: 정상 종료.
- 브라우저: 연결 가능한 인스턴스와 탭은 0개였다. 연결 시도에서 생성된 검증 전용 Node 커널 1개(PID 34800)는 최종 회수했다.
- 이 검증이 남긴 프로세스·컨테이너 잔여: **0개**.
