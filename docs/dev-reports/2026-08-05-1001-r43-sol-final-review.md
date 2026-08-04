# PR #1061 R43 CODEX SOL 5.6 최종 적대검증

- 검증 일자: 2026-08-05 (Asia/Seoul)
- 작업 루트: `C:/dev/Samhan-Public/.claude/worktrees/t1001b`
- 브랜치: `feat/1001-ledger-spec-rest`
- 검증 HEAD: `414592df8a774eacb14ee4c5739eff59267215e5`
- 실행 서버 배포본: R39 시점(14:14:35), R41·R42 미포함
- 범위: R41·R42가 만든 신규 표면의 도달 결함 검증
- 제외: 개발책임자 결정으로 종결된 D2·D3, 검증 품질 평가

## 사전 무결성 확인

- `git -C . rev-parse --show-toplevel`: 지정 작업 루트와 일치
- `git -C . branch --show-current`: 지정 브랜치와 일치
- `git -C . rev-parse HEAD`: 지정 HEAD와 일치

## 검증 기록

> 아래 절은 검증 순서대로 append한다. 코드 기준과 R39 실행 기준을 분리한다.

## 1. 측정 환경과 판정 경계

- 측정 PC: 현재 작업 디렉터리가 있는 Windows PC.
- Gateway: `http://127.0.0.1:8080`.
- 조회 계정: `dev_accountant`; 화면 선행 증거는 R14의 `dev_manager` 측정과 대조했다.
- 실행 배포본: accounting/slip 컨테이너 생성 시각 `2026-08-04T14:14:35Z`인 R39. 컨테이너 조작·재배포 없이 읽기 API만 호출했다.
- 코드 판정: 로컬/PR HEAD `414592df8`의 R41·R42 소스. 실행 서버가 이 코드를 포함하지 않으므로 R42 결과는 실 journal 조회 결과를 R42 collection 계약으로 재분류해 대조했다.
- 실측 기간은 R14와 같은 `2026-01-01~03-31`, R40 전수 구간 `2026-03-01~08-03`, `2026-01-01~08-03`을 각각 구분했다.

## 2. UUID 제거 후 문서 식별자

### 코드 판정

R41은 journal bundle의 내부 UUID `sourceKey`를 공개하지 않고, 실제 `journalNo`가 있으면 이를 `documentNo`로 사용한다. fallback은 `partnerCode/date/type` 조합이다.

- `journals.journal_no`는 엔티티 `nullable=false`, 생성 도메인에서 공백 금지, active partial unique index가 있다.
- 화면·인쇄는 `documentNo`를 분개번호로 표시하고 같은 날짜 안의 정렬 입력으로 사용한다.
- React row key는 `date-documentNo-index`이므로 `documentNo` 단독 identity로 mutation하거나 상세를 재조회하지 않는다.
- snapshot은 document payload를 그대로 저장·복원하고, 복원 화면도 같은 line 투영기를 사용한다. 식별자 변경으로 snapshot 대상을 잘못 찾는 경로는 없다.

### R39 실 데이터 대조

R42 대상 journal을 인증된 journal 조회 API로 읽어 R41 식별자 규칙을 적용했다.

| 기간 | 거래처 연결 journal bundle | 공백 `journalNo` | 거래처별 중복 `journalNo` | 다중 거래처 journal |
|---|---:|---:|---:|---:|
| 2026-01-01~03-31 | 29 | 0 | 0 | 0 |
| 2026-01-01~08-03 | 45 | 0 | 0 | 0 |

전 기간 45 bundle 중 공개 fold에서 제거되는 `Effect.NONE` 5개를 제외하면 R40의 UUID 문서 40개가 각각 비어 있지 않은 고유 `journalNo`로 1:1 치환된다. 식별자 공백·중복 도달 결함은 확인되지 않았다.

## 3. R42 전체 라인 수집

### 실 데이터 결과 — 현재 금액 부풀림 0건

측정 환경은 현재 Windows PC, R39 배포본(14:14:35), 기간 `2026-01-01~08-03`이다.

- POSTED/REVERSED journal 110건을 상세 조회했고, `CASH_RECEIPT`를 제외한 R42 후보는 71건이다.
- 거래처가 연결된 journal은 45건이다.
- 한 journal에 서로 다른 거래처가 연결된 사례: 0건.
- 기존 거래처 연결 라인만 분류한 결과와 R42 방식으로 전체 라인을 분류한 결과의 effect/amount 차이: 0건.
- 따라서 현재 이 PC·이 배포 데이터·이 기간에서는 무관 라인 혼입으로 금액이 부푼 사례가 없다.

### 도달 결함 R43-D1 — 다중 거래처 journal은 각 원장에 전표 전체 채권을 중복 귀속

현재 데이터가 0건인 것과 코드 도달성은 다르다.

1. `CreateJournalLineRequest`는 각 line마다 독립 `partnerId`를 허용한다.
2. `JournalService.create()`는 서로 다른 `partnerId`가 한 journal에 들어오는 것을 금지하지 않는다.
3. R42 `findJournalLinesInRangeForPartner()`는 대상 거래처 line이 하나라도 있으면 그 journal의 **모든 line**을 반환한다.
4. collection contract는 반환된 모든 110 line의 차변을 더하고, 호출 대상 거래처로 다시 제한하지 않는다.

따라서 유효한 단일 journal에 `110 차변 A=100`, `110 차변 B=200`, 상대 대변 합계 300이 있으면 A 조회와 B 조회 모두 `receivableDebit=300`인 SALE로 분류된다. 실제 채권 300이 두 원장 합계 600으로 부푼다. 이 입력은 기존 POST journal API 계약으로 생성 가능하므로 도달 결함이다.

### 도달 결함 R43-D2 — 전체 라인 계약이 기초잔액에는 적용되지 않음

R42는 기간 document 수집만 `findJournalLinesInRangeForPartner()`로 바꿨다. 기초잔액은 여전히 `findPartnerLinesUpTo()`로 거래처 연결 line만 읽는다.

원분개 `110 차변 777(거래처 연결) / 401 대변 777(미연결)`과 역분개 `110 대변 777(거래처 연결) / 401 차변 777(미연결)`을 예로 들면:

- 기간 안에서는 R42 전체 라인 수집으로 `SALE +777`과 역효과 `SALE -777`이 상쇄된다.
- 같은 쌍이 조회 시작일 이전으로 넘어가면 기초 수집은 110 line만 본다. 원분개는 SALE +777, 역분개는 revenue/상대 차변을 못 보아 NONE이 되므로 기초가 777로 남는다.

이는 R42가 고친 바로 그 유효 journal 형태에 대해 기간 안/밖의 collection 계약이 달라지는 경계 결함이다. 기간 내 다른 활동이 있어 거래처 group이 생성되는 정상 조회에서 잘못된 기초와 기말로 도달한다.

## 4. 구형 `/ledger-data` 의존 그래프

R42 보고서의 넓은 참조 목록과 실제 literal endpoint 소비를 다시 분리했다.

- production Desktop `getLedgerData()`는 `/accounting/journals/partner-ledger`를 호출한다.
- `PartnerLedgerView`의 `/ledger-data` 언급은 주석이며 실제 인쇄도 `getLedgerData()`를 호출한다.
- 저장소의 literal `/ledger-data` 호출은 mock handler/test, Playwright/IT, controller route에 남아 있다. first-party production caller는 없다.
- endpoint 자체는 인증된 PRINT 호출자에게 도달 가능하지만 R41 이후 controller가 `PartnerLedgerReadService.read()`를 호출해 legacy shape만 투영한다.
- 집계는 `PartnerLedgerReadModelService`, 상세·legacy·snapshot은 같은 read service/read model을 소비한다. R38의 서로 다른 계산기 경로는 제품 코드 기준 재발견되지 않았다.

저장소 밖 외부 소비자 존재 여부는 확인할 수 없으므로, legacy shape 변화의 외부 영향은 미판정이다.

## 5. 산식과 세 경로

### R39 실행 기준

인증된 실 API로 aggregate와 각 거래처 partner-ledger를 전수 대조했다.

| 기간 | 집계 row | `기초+매출-수금=기말` 불일치 | 집계=상세 불일치 |
|---|---:|---:|---:|
| 2026-01-01~03-31 | 48 | 0 | 0 |
| 2026-03-01~08-03 | 44 | 0 | 0 |
| 2026-01-01~08-03 | 51 | 0 | 0 |

R14 대상도 같은 환경·기간에서 재확인했다.

- `P-2026-0028`: 집계 `60,267,900`, 상세 기말 `60,267,900`, 산식 `60,267,900`.
- `P-2026-0018`: 집계 `32,346,600`, 상세 기말 `32,346,600`, 산식 `32,346,600`.
- R14 인쇄는 두 거래처 모두 상세·집계와 같은 값을 캡처했다.

### R41·R42 코드 기준

집계·상세·인쇄는 동일 read model 결과를 소비하므로 서로 다른 계산기 때문에 세 경로가 갈리는 결함은 없다. 다만 R43-D1/D2는 같은 잘못된 값을 세 경로가 일치해서 표시할 수 있다. 따라서 “세 경로 일치” 자체는 유지되지만, R42 신규 수집의 거래처 귀속과 기간 경계 정확성은 충족하지 못한다.

## 6. 검증 명령 결과

- accounting 영향 테스트: `PartnerLedgerReadModelServiceTest`, `PartnerLedgerReadServiceTest`, `TrialBalanceControllerIT` — `BUILD SUCCESSFUL`, 21 Gradle task 중 1 executed/20 up-to-date.
- Desktop 영향 테스트: `partnerLedgerApi.test.ts` 7, `PartnerLedgerPage.print.test.tsx` 8, `PartnerLedgerView.test.tsx` 6 — 3 files / 21 tests PASS.
- `git diff --check`: exit 0.

이 통과 집합에는 R43-D1의 다중 거래처 journal과 R43-D2의 역분개 기간 경계 조합이 없다.

## 7. 증거 무결성 — 현재 GitHub rollup은 48/48 green이 아님

2026-08-05 06:38 KST에 GitHub를 재조회했다.

- PR head: `414592df8a774eacb14ee4c5739eff59267215e5` — 로컬과 일치.
- status check rollup: 총 49개 = SUCCESS 48개 + CANCELLED 1개.
- CANCELLED: `빌드 + 테스트 (user+product+inventory+logging)`, 30분 23초, job `92047045057`.
- 별도 `JUnit 테스트 결과 (user+product+inventory+logging)` check는 SUCCESS이지만, 취소된 원 빌드 check를 성공으로 바꾸지는 않는다.
- `gh pr checks 1061`은 non-zero이며 현재 rollup은 green이 아니다.

따라서 제시된 “48/48”은 성공 check 48개만 센 값이고, 같은 HEAD에 남아 있는 취소 check 1개를 포함한 GitHub 현재 상태와 일치하지 않는다. 이는 허용된 예외인 증거 무결성 문제로 기록한다.

## 8. 신규 파일과 금지사항 준수

- 이번 라운드 신규 파일: `docs/dev-reports/2026-08-05-1001-r43-sol-final-review.md` 1개.
- 시작 전부터 있던 미추적 QA 파일/디렉터리 4경로는 변경하지 않았다.
- 코드 수정, 컨테이너 조작, DB 직접 쓰기, `git add`/commit/push를 하지 않았다.
- 실 서버에는 로그인과 GET 읽기 API만 호출했다.

## 이 라운드가 보지 않은 것

- R41·R42를 실 서버에 재배포하지 않았다. 따라서 R41 식별자와 R42 전체 라인의 실행 판정은 R39 실 데이터 + HEAD 코드 재분류이며, 배포 후 HTTP 응답 실측이 아니다. 재배포 확인은 PM 후속이 필요하다.
- 저장소 밖 `/ledger-data` 외부 소비자, 운영 PC·운영 DB, 운영 기간의 건수·금액은 보지 않았다.
- 실제 snapshot POST/copy, OS 인쇄 대화상자, 물리 프린터 출력은 쓰기/범위 제한으로 실행하지 않았다.
- 거래처 원장 외 회계 화면은 검증하지 않았다.
- 취소된 GitHub job을 재실행하거나 원인을 검증하지 않았다.

## 최종 판정

**머지 비권고.** 도달 결함이 0이 아니다.

1. R42 전체 라인 쿼리는 유효한 다중 거래처 journal에서 각 거래처 원장에 전표 전체 110 금액을 중복 귀속한다.
2. 같은 전체 라인 계약이 기초잔액에는 적용되지 않아 역분개 쌍이 기간 경계를 넘으면 기초가 상쇄되지 않는다.
3. 같은 HEAD의 GitHub 현재 rollup은 SUCCESS 48 + CANCELLED 1로 CI green이 아니다.

반면 현재 R39 실 데이터에서는 식별자 공백/중복과 전체 라인 금액 부풀림이 각각 0건이었고, 세 기간 산식 전수 및 R14 두 거래처 세 경로 일치는 유지된다. 이 정상 결과는 위 유효 입력 도달 결함과 CI 증거 불일치를 닫지 못한다.
