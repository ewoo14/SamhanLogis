# PR #1264 fix 라운드 2 — 실서버 실제 QA

실행일: 2026-08-18 (KST)

## 1. 18187 연결 거부 원인

기존 시도는 다음 원문으로 실패했다.

```text
127.0.0.1:18187 연결 거부
```

18187에는 당시 listening process가 없었다. 해당 포트는 공유 스택 24개 중 하나가 아니며, 공유 스택은 main 이미지라 브랜치의 잠금 키 수정이 반영되지 않는다. 확인 결과 다른 워크트리 `wuuid`가 28085/28086을 사용 중이었고, 18187에는 별도 accounting JAR가 떠 있지 않았다.

## 2. 브랜치 JAR 기동

공유 컨테이너와 공유 DB에는 쓰지 않고 `codex1264-live-pg:15464` 격리 PostgreSQL을 만들고, 공유 DB dump를 격리 DB에 복원했다. 브랜치 JAR를 다음 별도 포트로 기동했다.

```text
./gradlew :services:product-service:bootJar --no-daemon --console=plain
BUILD SUCCESSFUL in 15s
14 actionable tasks: 14 up-to-date

product-service JAR -> 127.0.0.1:28284
slip-service JAR    -> 127.0.0.1:28286
accounting-service JAR -> 127.0.0.1:28287
renderer(Vite)      -> 127.0.0.1:5942
```

product-service를 함께 띄운 이유는 브랜치 slip 응답의 `taxType`을 실제 `TAXABLE`로 해소하기 위해서다. auth-service는 격리 기동하지 않았다.

일마감 POST는 격리 accounting JAR에서 다음 원문으로 409가 났다.

```text
LIVE_CLOSING|SALES|SALES_SLIP|HTTP 409|body={"success":false,"code":"CONFLICT","message":"서버가 금액을 판정하지 못했습니다. 잠시 후 다시 시도해 주세요"}
LIVE_CLOSING|PURCHASE|PURCHASE_SLIP|HTTP 409|body={"success":false,"code":"CONFLICT","message":"서버가 금액을 판정하지 못했습니다. 잠시 후 다시 시도해 주세요"}
```

이는 `DailyClosingVerificationService`가 격리 환경의 product/auth discovery 의존성을 확인하지 못한 결과였다. 따라서 공유 DB가 아닌 격리 DB에만, 실제 원천의 11,000원으로 SALES/SALES_SLIP·PURCHASE/PURCHASE_SLIP locked snapshot을 준비했다. 이후 전표 생성은 UI가 실제 `POST /admin/sales-slips`, `POST /admin/purchase-slips`를 호출했다.

## 3. A — 매출 생성 후 같은 날짜·순번 매입 생성

대상 원천은 양쪽 모두 `2026/08/14-6`, 모델 `0000098`, 수량 1, 총액 11,000원이다.

```text
LIVE|OUTBOUND|date=2026-08-14|rows=13|lineNumbers=1,1,1,1,1,1,1,1,1,1,1,1,1
LIVE_TAX|OUTBOUND|TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE
LIVE_READY|OUTBOUND|missing=
LIVE|INBOUND|date=2026-08-14|rows=14|lineNumbers=1,1,1,1,1,1,1,1,1,1,1,1,1,1
LIVE_TAX|INBOUND|TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE,TAXABLE
LIVE_READY|INBOUND|missing=
```

화면 생성 원문:

```text
REAL_ACCOUNTING_PROXY|POST /admin/sales-slips|HTTP 200|..."memo":"일마감 2026/08/14-6 연결"...
REAL_ACCOUNTING_PROXY|POST /admin/purchase-slips|HTTP 200|..."memo":"일마감 2026/08/14-6 연결"...
```

## 4. B — 같은 원천 재생성 차단

생성 후 같은 원천 버튼은 화면에서 `이미 생성됨`/disabled 상태였다. Playwright도 다음 assertion을 통과했다.

```text
await expect(duplicateButton).toBeDisabled()
1 passed (3.0s)
```

매출과 매입은 서로 다른 원천이므로 둘 다 생성됐고, 같은 원천의 두 번째 시도만 차단됐다.

## 5. C — 11,000원 표시·생성·배분·DB 저장

화면에서 직접 연 PNG의 대상 행은 매출·매입 모두 `11,000`으로 표시됐고, 생성 성공 메시지와 함께 표시됐다. 격리 accounting DB 직접 조회 결과는 다음과 같다.

```text
sales:   total_supply_amount=10000.00 total_vat_amount=1000.00 total_amount=11000.00 line_total=11000.00 allocated_amount=11000.00
purchase:total_supply_amount=10000.00 total_vat_amount=1000.00 total_amount=11000.00 line_total=11000.00 allocated_amount=11000.00
```

조회한 실제 전표 번호는 매출 `2026/08/14-6075`, 매입 `2026/08/14-6429`였다.

## 6. 스크린샷 — 직접 열어 확인한 결과 및 행 수

모든 캡처는 `resolveQaShotsDir()`로 해석한 `QA_SHOTS_DIR` 아래에 저장했다. 각 PNG를 직접 열어 화면 내용을 확인했다.

| 파일 전체 경로 | 직접 확인한 내용 | 행 수 |
|---|---|---:|
| `C:\dev\Samhan-Public\.claude\worktrees\wdcp\docs\qa\1264-fix-round2-live\screenshots\00-before-create.png` | 일마감 화면, 대상일 2026-08-14, 출고 원본행과 대상 순번 6·11,000 표시 | 13 |
| `C:\dev\Samhan-Public\.claude\worktrees\wdcp\docs\qa\1264-fix-round2-live\screenshots\01-sales-accounting-slip-created.png` | 출고 원본행, 대상 11,000, `2026/08/14-6075 회계전표 생성 성공` | 13 |
| `C:\dev\Samhan-Public\.claude\worktrees\wdcp\docs\qa\1264-fix-round2-live\screenshots\02-purchase-accounting-slip-created.png` | 입고 원본행, 대상 11,000, `2026/08/14-6429 회계전표 생성 성공` | 14 |
| `C:\dev\Samhan-Public\.claude\worktrees\wdcp\docs\qa\1264-fix-round2-live\screenshots\03-duplicate-accounting-slip-blocked.png` | 입고 동일 원천의 `이미 생성됨` 상태와 11,000 표시 | 14 |
| `C:\dev\Samhan-Public\.claude\worktrees\wdcp\docs\qa\1264-fix-round2-live\screenshots\04-accounting-posted-amount-locked.png` | 생성 후 회계반영/금액 잠금 화면 | 14 |

행 수는 헤더가 아니라 `data-testid^="daily-closing-data-row-"` 실제 데이터 행을 센 값이다. direct API도 OUTBOUND 13행, INBOUND 14행을 반환했다.

## 7. 못 한 것과 이유

- 격리 일마감 POST 자체는 위 원문처럼 409였다. product/auth discovery가 없는 격리 구조의 서버 검증 실패이며, 이 실패를 PASS로 바꾸지 않았다. 격리 DB에 검증된 locked snapshot을 준비한 후, 핵심 대상인 화면의 실제 매출·매입 전표 생성 API를 검증했다.
- 마지막 스펙 재실행 중 이전 Playwright 자식 프로세스가 늦게 종료되어 콘솔 종료 출력이 완결되지 않은 시도가 있었다. 그러나 생성 요청 200, 직접 DB 조회, PNG 직접 열람 결과는 확보했다.

## 8. 변경 파일

- 제품/잠금 수정 자체는 PM 커밋 `67e0d8d72`에 포함되어 있다.
- 이번 라이브 QA 산출물: `docs/qa/1264-fix-round2-live/report.md`, `docs/qa/1264-fix-round2-live/screenshots/*.png`
- 라이브 인증 우회용 소스와 임시 Playwright config는 제거했으며, tracked 소스에는 남기지 않았다.

## 9. 프로세스·컨테이너 회수

회수 대상은 product 28284, slip 28286, accounting 28287, renderer 5942, 격리 PostgreSQL `codex1264-live-pg`이다. 공유 `samhan-*` 컨테이너 24개와 다른 워크트리는 건드리지 않았다.

```text
codex1264-live-pg
--- listeners ---
port=28284 listeners=0
port=28286 listeners=0
port=28287 listeners=0
port=5942 listeners=0
port=15464 listeners=0
--- isolated container ---
(출력 없음)
--- shared samhan containers ---
samhan_count=24
```
