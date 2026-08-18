# PR #1264 fix 라운드 2 — CODEX LUNA 구현 보고

## ① 오잠금 원인

재판정 결함의 원인은 `clients/desktop/src/renderer/routes/DailyClosingPage.tsx`의 로컬 잠금 키였다. 기존 키는 ``${slipDate}-${seqNo}``로 전표유형이 빠져 있었다. 따라서 같은 날짜·순번의 OUTBOUND 매출과 INBOUND 매입이 서로 같은 로컬 상태를 공유했다.

이번 수정은 잠금 키를 `SALES-${slipDate}-${seqNo}` 또는 `PURCHASE-${slipDate}-${seqNo}`로 분리했다. 서버 중복 판정 키인 `sourceSlipNo`와 유형별 `sourceSlipType` 조회는 변경하지 않았다. 그러므로 같은 원천의 서버 중복 방어선은 유지되고, 반대 유형의 별도 원천은 서로 잠그지 않는다.

금액 편집 잠금도 생성 버튼과 같은 유형 포함 키를 사용하도록 함께 수정했다.

## ② RED 원문 — 양방향

먼저 `DailyClosingPage.test.tsx`에 실패 테스트를 추가했다. 첫 실행은 테스트 matcher 오류였고, matcher를 수정한 뒤 실제 결함 RED는 다음과 같았다.

```text
AssertionError: expected true to be false // Object.is equality
Expected false
Received true
at src/renderer/routes/DailyClosingPage.test.tsx:165:80
```

이 실패는 매출 생성 후 별도 매입 버튼의 `disabled`가 `true`가 되어, 기대값 `false`와 불일치한 원문이다.

테스트는 같은 날짜·순번의 OUTBOUND `OUT-20260814-6`을 생성한 뒤 별도 INBOUND `IN-20260814-6` 버튼이 활성화되는지 확인한다. 동시에 매출 버튼은 생성 직후 disabled인지 확인해 같은 매출 원천 재생성 차단을 보존한다.

수정 후 focused 실행 결과:

```text
Test Files  1 passed (1)
Tests       30 passed (30)
```

## ③ 잃으면 안 되는 4가지 재현

- 금액 11,000원: 지정 재판정 라이브 증거에서 매출·매입 모두 일마감 표시/API total, 회계전표 line total, allocation, DB header/line/allocation이 각각 `11,000 / 11,000 / 11,000 / 11,000`이었다. 단 raw legacy `slip_lines.line_total`은 10,000원이므로, 정본 근거는 VAT 포함 단가 11,000원과 공급가 10,000원 + VAT 1,000원이다. 이번 라운드에는 격리 서비스 미기동으로 새 라이브 재현을 완료하지 못했다.
- INBOUND 경로: 지정 재판정에서 매입 조회가 실제 `GET /slips/query/daily-closing?...&slipType=INBOUND`이고 INBOUND 저장소 경로임을 확인했다. 이번 라운드에는 백엔드 호출 재현을 완료하지 못했다.
- 재진입 잠금: 기존 테스트가 생성 후 재진입 시 생성 버튼 disabled와 금액 입력 disabled를 검증하며, 수정 후 관련 30개 테스트가 통과했다. 실제 브라우저 재진입 캡처는 이번 라운드 미검증이다.
- 정상 미생성 경로: 새 회귀 테스트가 매출 생성 후 별도 매입 버튼 enabled를 검증한다. 같은 매출 원천은 생성 직후 disabled다. 실제 브라우저 캡처는 이번 라운드 미검증이다.

## ④ 계열 sweep

- 일마감 회계전표 로컬 상태 사용처를 검색해 생성 버튼의 `accountingKey`, 생성 중 상태 `accountingPending`, 금액 편집 잠금 `accountingCreated`를 확인했다. 세 곳 모두 전표유형을 포함하도록 맞췄다.
- 서버 eligibility는 이미 `closingKind === 'PURCHASE'`일 때 `sourceSlipType: 'INBOUND'`, 그 외 `OUTBOUND`를 전달하고 `sourceSlipNo`로 중복을 판정하므로 유지했다.
- 일마감 변환기 `buildDailyClosingAccountingSlipRequest`는 잠금 키를 사용하지 않아 변경하지 않았다.
- 다른 화면·전표유형에서 동일한 일마감 로컬 잠금 판정을 사용하는 호출부는 검색 결과 발견하지 못했다.
- 날짜·순번만 사용하는 표의 병합·확장 그룹 키는 화면 행 병합 용도이며 회계 생성 잠금 판정이 아니므로 변경하지 않았다.

## ⑤ CI 두 실패 귀속

PR #1264 현재 run `32043983239`에서 확인한 결과:

- `빌드 + 테스트 (product-quantity-sync-schema)`: 실패. job `95428073487`은 `Set up job` 한 단계만 완료하고 종료했다. 테스트 단계나 product quantity sync 테스트 출력이 없다.
- `GitGuardian Security Checks`: 실패. GitGuardian 대시보드 외부 check이며 이 실행에서 저장소 코드 diff에 대한 상세 로그를 제공하지 않았다.
- `origin/main` 최신 CI run `32043555698`에서도 `Set up job` 단계 실패가 반복됐다. 최신 main head `61e86641`에서 shared/auth/gateway, accounting-partner-integrity, user+product+inventory+logging job이 같은 유형으로 실패했다. 따라서 product quantity sync 실패는 이 PR 변경으로 귀속할 증거가 없고 GitHub runner/환경 장애로 판정한다.
- GitGuardian은 이 PR 원인이라고 단정할 상세 증거가 없으며, 본 라운드 변경 파일에는 자격·시크릿 추가가 없다. 외부 보안 검사 실패 상태 자체는 남아 있다.
- 로컬 데스크톱 관련 검증은 `DailyClosingPage`·변환기 테스트 34/34 통과, `npm run build` 성공이다. GitHub CI 전체는 pending/외부 실패가 있어 green이 아니다.

## ⑥ 스크린샷 — 직접 열어 확인한 결과·행 수·전체 경로

이번 fix 라운드에는 새 스크린샷이 생성되지 않았다. 라이브 스펙은 실제 브라우저로 시작했으나 첫 격리 accounting API 요청에서 다음 원문으로 중단됐다.

```text
Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:18187
POST http://127.0.0.1:18187/accounting/daily-closings
1 failed
```

따라서 이번 라운드에 직접 열어 확인한 PNG는 0장, 화면 데이터행 확인도 0행이다. 실패 캡처는 검증 증거로 승격하지 않았고 제거했다.

재판정에서 직접 열어 확인한 기존 PNG의 전체 경로와 행 수는 다음과 같다. 이 목록은 이번 fix의 새 성공 증거가 아니다.

- `C:\dev\Samhan-Public\.claude\worktrees\wdcp\docs\qa\1264-sol-reverdict-2\screenshots\01-sales-before-create.png` — 캡처 내부 데이터행 10행, DOM 13행
- `C:\dev\Samhan-Public\.claude\worktrees\wdcp\docs\qa\1264-sol-reverdict-2\screenshots\02-sales-after-create.png` — 캡처 내부 데이터행 10행, DOM 13행
- `C:\dev\Samhan-Public\.claude\worktrees\wdcp\docs\qa\1264-sol-reverdict-2\screenshots\03-purchase-before-create.png` — 캡처 내부 데이터행 10행, DOM 14행
- `C:\dev\Samhan-Public\.claude\worktrees\wdcp\docs\qa\1264-sol-reverdict-2\screenshots\04-purchase-after-create.png` — 캡처 내부 데이터행 10행, DOM 14행

위 네 장은 이번 라운드 변경 후 재촬영하지 않았으므로 오잠금 해소의 증거로 주장하지 않는다.

## ⑦ 미검증 축

- 브랜치 JAR을 별도 포트로 띄운 실서버에서 매출 생성 직후 같은 날짜·순번 매입 생성 성공을 실제 클릭하는 시나리오
- 이어서 같은 원천 재생성 차단의 실제 클릭·PNG 확인
- 새 라이브 PNG의 화면 값과 행 수 직접 확인
- 11,000원 표시·생성·배분·DB 저장의 이번 라운드 재현
- INBOUND 실제 엔드포인트·저장소의 이번 라운드 재호출
- 비과세·영세율, 수량 2 이상 복수 라인 반올림, POSTED 후속 전기·세금계산서 연결

브랜치 JAR 생성 명령과 출력:

```text
./gradlew :services:slip-service:bootJar :services:accounting-service:bootJar --no-daemon
BUILD SUCCESSFUL in 16s
24 actionable tasks: 24 up-to-date
```

JAR은 생성했지만 격리 accounting 서비스가 없어 라이브 브라우저 흐름을 완주하지 못했다.

## ⑧ 변경 파일

- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx`
- `clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx`
- `docs/qa/1264-fix-round2/report.md`

커밋·푸시·`git add`는 수행하지 않았다.

## ⑨ 프로세스 회수

- 이번 라운드에서 기동한 애플리케이션 서버·격리 컨테이너는 없다.
- 브랜치 JAR은 빌드만 했고 별도 포트로 실행하지 않았다.
- 라이브 테스트가 만든 임시 Playwright 설정과 실패 `test-results` 디렉터리는 제거했다.
- 공유 컨테이너는 중지·재시작·교체하지 않았으며 24개를 그대로 유지했다.
- 공유 DB write는 0건이다.
- 작업 트리에는 기존 재판정 보고서 디렉터리와 이번 코드·테스트 수정만 남겼다.
