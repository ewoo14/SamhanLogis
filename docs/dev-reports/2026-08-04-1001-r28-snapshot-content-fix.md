# PR #1061 R28 snapshot 내용 정합성 수정

- 작업 일자: 2026-08-04
- 대상 HEAD: `0af3dc357` (사용자 제공, detached HEAD)
- 담당: R28 fix
- 기준 보고서: `docs/dev-reports/2026-08-04-1001-r27-review.md`
- 상태: 조사 시작

## 작업 원칙

- 사용자가 화면에서 본 현재 원장과 `현재 원장 저장` snapshot 내용이 같아야 한다.
- 페이지 진입, 필터 적용, 재조회, 이력 조회/복원, 단건/일괄 인쇄 미리보기는 snapshot을 읽거나 저장하지 않아야 한다.
- 기존 snapshot 형식 복원을 보존해야 한다.
- 집계·상세·인쇄가 소비하는 계약은 `shared/common/.../ledger/PartnerLedgerContract.java` 하나를 유지한다.
- 작업 전후 DB에는 읽기 전용 SQL만 사용한다.
- git 명령, Docker 이미지 재빌드/재배포, 전체 테스트는 사용하지 않는다.

## 조사 로그

### 1. 착수

R27 원문을 먼저 읽었다. R27은 조회가 `PartnerLedgerReadService`를 사용하고 저장이 별도 `LedgerImageService`를 사용해, 화면 상세 1행과 새 snapshot 3행이 달라지는 도달 가능한 결함을 보고했다. 이 보고서는 착수 시점에 생성했으며, 이후 각 단계가 끝날 때 즉시 append한다.

다음 단계: 실 DB의 기존 snapshot 건수와 형식 분포를 읽기 전용으로 확인한 뒤 RED-A/RED-B 실패 테스트를 먼저 작성하고 실행한다.

### 2. 실 DB 기존 snapshot 건수·형식 1차 측정

Docker 실행 상태를 확인했다. PostgreSQL 컨테이너는 `samhan-postgres`이며, 회계 DB는 `accounting_db`이다. DB 쓰기 없이 `docker exec samhan-postgres psql -U samhan -d accounting_db -c "SELECT ..."` 형태의 SELECT만 실행했다.

실행한 읽기 전용 SQL의 원문:

```sql
SELECT COUNT(*) AS total_rows, COUNT(*) FILTER (WHERE is_deleted = false) AS active_rows, COUNT(*) FILTER (WHERE data_snapshot_json IS NOT NULL) AS rows_with_snapshot, COUNT(*) FILTER (WHERE data_snapshot_json IS NULL) AS rows_without_snapshot FROM public.tax_invoice_batches;
SELECT document_type, status, COUNT(*) AS rows, MIN(total_row_count) AS min_row_count, MAX(total_row_count) AS max_row_count, COUNT(*) FILTER (WHERE data_snapshot_json IS NOT NULL) AS with_snapshot FROM public.tax_invoice_batches GROUP BY document_type, status ORDER BY document_type, status;
SELECT CASE WHEN data_snapshot_json IS NULL THEN 'NULL' ELSE jsonb_typeof(data_snapshot_json::jsonb) END AS snapshot_json_type, COUNT(*) AS rows FROM public.tax_invoice_batches GROUP BY 1 ORDER BY 1;
```

출력 원문:

```text
 total_rows | active_rows | rows_with_snapshot | rows_without_snapshot 
------------+-------------+--------------------+-----------------------
          2 |           2 |                  2 |                     0
(1 row)

 document_type |  status   | rows | min_row_count | max_row_count | with_snapshot 
---------------+-----------+------+---------------+---------------+---------------
 HOMETAX       | COMPLETED |    2 |             0 |             0 |             2
(1 row)

ERROR:  invalid input syntax for type json
DETAIL:  Token "H4sIAAAAAAAA" is invalid.
CONTEXT:  JSON data, line 1: H4sIAAAAAAAA...
```

판정: 현재 실 DB에는 기존 snapshot 저장 행이 **2건** 있고, 활성 행도 **2건**이다. 두 행 모두 `data_snapshot_json`이 NULL이 아니며, `document_type=HOMETAX`, `status=COMPLETED`, `total_row_count=0`이다. payload는 JSON text가 아니라 `H4sIAAAAAAAA...`로 시작하는 압축 Base64 형식으로 보인다. JSON cast 오류는 형식 분포 확인 과정에서 발생한 읽기 전용 조회 오류이며 DB 상태를 변경하지 않았다.

다음 단계: 압축 payload의 길이·접두어와 코드의 압축/복원 구현을 대조해 기존 형식을 보존하는 저장 계약을 확정한다.

### 3. 실 DB 기존 snapshot 형식 2차 측정

PARTNER_LEDGER 유형을 별도로 분리해 다시 조회했다. 실행한 읽기 전용 SQL:

```sql
SELECT document_type, COUNT(*) AS rows, COUNT(*) FILTER (WHERE is_deleted = false) AS active_rows, COUNT(*) FILTER (WHERE data_snapshot_json IS NOT NULL) AS with_payload FROM public.tax_invoice_batches GROUP BY document_type ORDER BY document_type;
SELECT COUNT(*) AS partner_ledger_rows, COUNT(*) FILTER (WHERE is_deleted = false) AS active_partner_ledger_rows FROM public.tax_invoice_batches WHERE document_type = 'PARTNER_LEDGER';
SELECT batch_no, document_type, status, source_from_date, source_to_date, total_row_count, octet_length(data_snapshot_json) AS payload_bytes, left(data_snapshot_json, 32) AS payload_prefix FROM public.tax_invoice_batches ORDER BY created_at, batch_no;
```

출력 원문:

```text
 document_type | rows | active_rows | with_payload 
---------------+------+-------------+--------------
 HOMETAX       |    2 |           2 |            2
(1 row)

 partner_ledger_rows | active_partner_ledger_rows 
--------------------+----------------------------
                   0 |                          0
(1 row)

    batch_no    | document_type |  status   | source_from_date | source_to_date | total_row_count | payload_bytes |          payload_prefix          
----------------+---------------+-----------+------------------+----------------+-----------------+---------------+----------------------------------
 TIB-202607-001 | HOMETAX       | COMPLETED | 2026-07-01       | 2026-07-31     |               0 |            32 | H4sIAAAAAAAA/4uOBQApu0wNAgAAAA==
 TIB-202605-001 | HOMETAX       | COMPLETED | 2026-05-01       | 2026-07-31     |               0 |            32 | H4sIAAAAAAAA/4uOBQApu0wNAgAAAA==
(2 rows)
```

판정: 실 DB의 `tax_invoice_batches`는 총 **2건**, 형식 분포는 **HOMETAX 2건 / PARTNER_LEDGER 0건**이다. 두 기존 행의 payload는 모두 32 bytes의 `H4sIA...` gzip+Base64이고 `total_row_count=0`이다. 따라서 현재 DB에서는 PARTNER_LEDGER 구형 snapshot 행을 직접 복원 실측할 수 없지만, 코드상 기존 `LedgerImageResponse` gzip+Base64 복원 경로는 보존해야 한다.

다음 단계: R27 원인 경로를 회귀 테스트로 고정한다. 새 저장은 `PartnerLedgerResponse` read model을 payload로 사용하고, 복원은 새 payload와 구형 `LedgerImageResponse` payload를 모두 처리하는 방향으로 테스트한다.

### 4. RED-A 실행 원문

수정 전 현재 코드에 `PartnerLedgerReadService` 기반 저장 계약을 표현한 테스트를 먼저 추가하고, 관련 단일 Gradle 테스트만 실행했다.

실행 명령:

```text
.\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.LedgerSnapshotServiceTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :services:accounting-service:processResources UP-TO-DATE
> Task :services:accounting-service:processTestResources UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:common:compileJava
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes
> Task :shared:common:jar
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :services:accounting-service:compileJava
> Task :services:accounting-service:classes

> Task :services:accounting-service:compileTestJava

> Task :services:accounting-service:compileTestJava FAILED
20 actionable tasks: 4 executed, 16 up-to-date
D:\dev\Samhan-Public\.claude\worktrees\w1061\services\accounting-service\src\test\java\com\samhanair\logis\accounting\service\LedgerSnapshotServiceTest.java:42: error: incompatible types: PartnerLedgerReadService cannot be converted to LedgerImageService
        service = new LedgerSnapshotService(partnerLedgerReadService, batchRepository, objectMapper);
                                            ^
Note: Some input files use unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
Note: Some messages have been simplified; recompile with -Xdiags:verbose to get full output
1 error

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:accounting-service:compileTestJava'.
> Compilation failed; see the compiler error output for details.

* Try:
> Run with --info option to get more log output.
> Run with --scan to get full insights.

BUILD FAILED in 33s
```

판정: RED-A는 현재 `LedgerSnapshotService`가 `LedgerImageService`만 주입받는 구 계약 때문에 컴파일 단계에서 실패했다. 이는 테스트가 요구하는 화면 read model 저장 경로가 아직 존재하지 않는다는 직접 증거다.

### 5. RED-B 실행 원문

조회 경로가 snapshot POST를 호출하지 않는 기존 회귀 테스트를 별도로 실행했다. 이 테스트는 R27에서 이미 PASS로 확인된 반대급부이며, 현재 결함 수정 전에 기준선이 깨지지 않았는지 기록하기 위한 것이다.

실행 명령:

```text
npm run test -- src/renderer/routes/PartnerLedgerPage.print.test.tsx --run
```

출력 원문:

```text
> @samhan/desktop@0.1.0 pretest
> node scripts/real-qa-scope.cjs --phase=test

[로컬 파생물 신선도] test 대상 확인 완료 — 이 확인은 design-system dist 최신성 · electron-updater 설치 버전 일치 · Electron out/main 빌드 최신성만 봅니다. node_modules 의 file: 링크 무결성이나 그 외 일반 의존성 상태는 다루지 않으며, 그런 문제는 이어지는 tsc/vitest 원본 오류로 드러납니다.

> @samhan/desktop@0.1.0 test
> vitest run src/renderer/routes/PartnerLedgerPage.print.test.tsx --run


 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1061/clients/desktop

 ✓ src/renderer/routes/PartnerLedgerPage.print.test.tsx (5 tests) 553ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  09:43:49
   Duration  4.45s (transform 842ms, setup 0ms, collect 1.71s, tests 553ms, environment 1.47s, prepare 157ms)

 stderr | src/renderer/routes/PartnerLedgerPage.print.test.tsx > PartnerLedgerPage 인쇄 미리보기 > 선택한 거래처들을 Electron-safe 일괄 인쇄 route로 전환한다
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in React.startTransition in v7. You can use the v7_startTransition future flag to opt-in early.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the v7_relativeSplatPath future flag to opt-in early.
```

판정: RED-B는 수정 전 기준선부터 **PASS**였다. R27이 확인한 것처럼 현재 조회·인쇄 경로에는 snapshot POST가 없으며, 이 상태를 수정 후에도 유지해야 한다. 이 결과를 실패한 것처럼 쓰지 않고 기준선 PASS로 기록한다.

### 6. BE GREEN-A 실행 원문

저장 서비스 관련 단일 테스트만 실행했다. 테스트는 화면 `PartnerLedgerResponse`를 저장하고, 저장 payload를 다시 복원해 documents의 행 수·금액·내용을 비교하며, 구형 `LedgerImageResponse` payload 복원도 함께 확인한다.

실행 명령:

```text
.\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.LedgerSnapshotServiceTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :services:accounting-service:processResources UP-TO-DATE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :services:accounting-service:processTestResources UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :shared:collab-core:compileJava UP-TO-DATE
> Task :shared:collab-core:classes UP-TO-DATE
> Task :shared:collab-core:jar UP-TO-DATE
> Task :services:accounting-service:compileJava
> Task :services:accounting-service:classes

> Task :services:accounting-service:compileTestJava

> Task :services:accounting-service:testClasses
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 32s
21 actionable tasks: 3 executed, 18 up-to-date
Note: Some input files use unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

### 13. 최종 FE 호출 경로 점검 원문

수정 후 snapshot POST 호출자와 조회/인쇄 GET 호출자를 정적 검색으로 확인했다.

실행 명령:

```text
rg -n "captureLedger|ledgerSnapshotService\.capture|capture\(|getLedgerData|/accounting/journals/partner-ledger|/accounting/journals/ledger-snapshots" services/accounting-service/src/main/java/com/samhanair/logis/accounting clients/desktop/src/renderer --glob '*.java' --glob '*.ts' --glob '*.tsx' | Select-Object -First 160
```

출력 원문:

```text
clients/desktop/src/renderer\print\PartnerLedgerView.tsx:41:import { getLedgerData, type LedgerData } from '../api/partnerLedgerApi'
clients/desktop/src/renderer\print\PartnerLedgerView.tsx:219:    queryFn: () => getLedgerData(partnerCodeParam ?? '', periodFrom, periodTo),
clients/desktop/src/renderer\print\PartnerLedgerView.test.tsx:7:import { getLedgerData } from '../api/partnerLedgerApi'
clients/desktop/src/renderer\print\PartnerLedgerView.test.tsx:12:  getLedgerData: vi.fn().mockResolvedValue({
clients/desktop/src/renderer\print\PartnerLedgerView.test.tsx:48:    vi.mocked(getLedgerData).mockResolvedValue({
clients/desktop/src/renderer\print\PartnerLedgerView.test.tsx:72:    vi.mocked(getLedgerData).mockResolvedValue({
clients/desktop/src/renderer\print\PartnerLedgerView.test.tsx:97:    vi.mocked(getLedgerData).mockResolvedValue({
clients/desktop/src/renderer\print\PartnerLedgerView.test.tsx:120:    vi.mocked(getLedgerData).mockImplementation(async (partnerCode) => ({
clients/desktop/src/renderer\print\PartnerLedgerView.test.tsx:139:    expect(getLedgerData).toHaveBeenCalledWith('P-1', '2026-08-01', '2026-08-31')
clients/desktop/src/renderer\print\PartnerLedgerView.test.tsx:140:    expect(getLedgerData).toHaveBeenCalledWith('P-2', '2026-08-01', '2026-08-31')
clients/desktop/src/renderer\api\partnerLedgerApi.test.ts:4:import { getLedgerData } from './partnerLedgerApi'
clients/desktop/src/renderer\api\partnerLedgerApi.test.ts:15:    const result = await getLedgerData('P-0005', '2026-07-01', '2026-07-31')
clients/desktop/src/renderer\api\partnerLedgerHistory.test.ts:3:import { captureLedger, getLedgerHistory, restoreLedger } from './partnerLedgerApi'
clients/desktop/src/renderer\api\partnerLedgerHistory.test.ts:39:    await captureLedger('P-001', '2026-08-01', '2026-08-31')
clients/desktop/src/renderer\api\partnerLedgerHistory.test.ts:42:      '/accounting/journals/ledger-snapshots',
clients/desktop/src/renderer\api\partnerLedgerApi.ts:259:export async function getLedgerData(
clients/desktop/src/renderer\api\partnerLedgerApi.ts:265:    '/accounting/journals/partner-ledger',
clients/desktop/src/renderer\api\partnerLedgerApi.ts:272:export async function captureLedger(
clients/desktop/src/renderer\api\partnerLedgerApi.ts:278:    '/accounting/journals/ledger-snapshots',
services/accounting-service/src/main/java/com/samhanair/logis/accounting\web\AccountingReportController.java:144:    @PostMapping("/accounting/journals/ledger-snapshots")
services/accounting-service/src/main/java/com/samhanair/logis/accounting\web\AccountingReportController.java:146:    public ApiResponse<PartnerLedgerResponse> captureLedger(
services/accounting-service/src/main/java/com/samhanair/logis/accounting\web\AccountingReportController.java:151:        return ApiResponse.ok(ledgerSnapshotService.capture(
services/accounting-service/src/main/java/com/samhanair/logis/accounting\web\AccountingReportController.java:156:    @GetMapping("/accounting/journals/partner-ledger")
services/accounting-service/src/main/java/com/samhanair/logis/accounting\service\LedgerSnapshotService.java:36:    public PartnerLedgerResponse capture(String partnerCode, LocalDate from, LocalDate to, UUID actor) {
clients/desktop/src/renderer\routes\PartnerLedgerPage.print.test.tsx:9:  getLedgerData,
clients/desktop/src/renderer\routes\PartnerLedgerPage.print.test.tsx:12:  captureLedger,
clients/desktop/src/renderer\routes\PartnerLedgerPage.print.test.tsx:17:  getLedgerData: vi.fn(),
clients/desktop/src/renderer\routes\PartnerLedgerPage.print.test.tsx:19:  captureLedger: vi.fn(),
clients/desktop/src/renderer\routes\PartnerLedgerPage.print.test.tsx:51:    vi.mocked(getLedgerData).mockResolvedValue({
clients/desktop/src/renderer\routes\PartnerLedgerPage.print.test.tsx:70:  vi.mocked(captureLedger).mockResolvedValue({} as never)
clients/desktop/src/renderer\routes\PartnerLedgerPage.print.test.tsx:156:    vi.mocked(getLedgerData).mockClear()
clients/desktop/src/renderer\routes\PartnerLedgerPage.print.test.tsx:181:    expect(getLedgerData).not.toHaveBeenCalledWith('-', expect.anything(), expect.anything())
clients/desktop/src/renderer\routes\PartnerLedgerPage.print.test.tsx:205:    expect(captureLedger).toHaveBeenCalledWith('QA-GATE-A', '2026-05-01', '2026-05-31')
clients/desktop/src/renderer\routes\PartnerLedgerPage.print.test.tsx:228:    expect(captureLedger).not.toHaveBeenCalled()
clients/desktop/src/renderer\routes\PartnerLedgerPage.tsx:48:  captureLedger,
clients/desktop/src/renderer\routes\PartnerLedgerPage.tsx:49:  getLedgerData,
clients/desktop/src/renderer\routes\PartnerLedgerPage.tsx:261:    queryFn: () => getLedgerData(selectedPartner ?? '', applied.from, applied.to),
clients/desktop/src/renderer\routes\PartnerLedgerPage.tsx:297:      await captureLedger(selectedPartner, applied.from, applied.to)
```

판정: 인쇄 화면은 `getLedgerData`만 호출한다. 조회 화면의 `captureLedger` 호출자는 저장 버튼 handler 한 곳이다. 저장 POST는 `LedgerSnapshotService.capture`에서 `PartnerLedgerReadService.read`를 호출하며, `LedgerImageService` 재계산기는 저장 경로에 연결되지 않는다.

### 12. FE 정적 검사 보완 로그

관련 API 타입에 공통 read model의 `SALE_SUMMARY`를 추가한 뒤 정적 검사를 실행했다. 첫 실행은 타입 누락을 정확히 잡아 실패했고, 타입 보완 후 재실행은 출력 없이 성공했다.

첫 실행 명령:

```text
npx tsc -p tsconfig.web.json --noEmit
```

첫 실행 출력 원문:

```text
src/renderer/api/partnerLedgerApi.ts(164,3): error TS2322: Type '{ balance: string; date: string; journalNo: string; accountCode: string; accountName: string; description: string; debit: string; credit: string; deliveryAddress: string | null; documentType: "SALE" | ... 1 more ... | "SALE_SUMMARY"; }[]' is not assignable to type 'LedgerLine[]'.
  Type '{ balance: string; date: string; journalNo: string; accountCode: string; accountName: string; description: string; debit: string; credit: string; deliveryAddress: string | null; documentType: "SALE" | ... 1 more ... | "SALE_SUMMARY"; }' is not assignable to type 'LedgerLine'.
    Types of property 'documentType' are incompatible.
      Type '"SALE" | "CASH_RECEIPT" | "SALE_SUMMARY"' is not assignable to type '"SALE" | "CASH_RECEIPT" | undefined'.
        Type '"SALE_SUMMARY"' is not assignable to type '"SALE" | "CASH_RECEIPT" | undefined'.
```

보완 후 재실행 명령:

```text
npx tsc -p tsconfig.web.json --noEmit
```

보완 후 출력 원문: **출력 없음, exit code 0**.

판정: `PartnerLedgerContract`의 `SALE_SUMMARY` 정책과 FE line 타입을 일치시켰다.

### 11. 수정 후 DB 읽기 전용 재확인 원문

수정 후에도 DB에 쓰지 않고 같은 SELECT 묶음을 다시 실행했다.

실행한 SQL:

```sql
SELECT COUNT(*) AS total_rows, COUNT(*) FILTER (WHERE is_deleted = false) AS active_rows, COUNT(*) FILTER (WHERE data_snapshot_json IS NOT NULL) AS rows_with_snapshot, COUNT(*) FILTER (WHERE data_snapshot_json IS NULL) AS rows_without_snapshot FROM public.tax_invoice_batches;
SELECT document_type, COUNT(*) AS rows, COUNT(*) FILTER (WHERE is_deleted = false) AS active_rows, COUNT(*) FILTER (WHERE data_snapshot_json IS NOT NULL) AS with_payload FROM public.tax_invoice_batches GROUP BY document_type ORDER BY document_type;
SELECT COUNT(*) AS partner_ledger_rows, COUNT(*) FILTER (WHERE is_deleted = false) AS active_partner_ledger_rows FROM public.tax_invoice_batches WHERE document_type = 'PARTNER_LEDGER';
SELECT batch_no, document_type, status, source_from_date, source_to_date, total_row_count, octet_length(data_snapshot_json) AS payload_bytes, left(data_snapshot_json, 32) AS payload_prefix FROM public.tax_invoice_batches ORDER BY created_at, batch_no;
```

출력 원문:

```text
 total_rows | active_rows | rows_with_snapshot | rows_without_snapshot 
------------+-------------+--------------------+-----------------------
          2 |           2 |                  2 |                     0
(1 row)

 document_type | rows | active_rows | with_payload 
---------------+------+-------------+--------------
 HOMETAX       |    2 |           2 |            2
(1 row)

 partner_ledger_rows | active_partner_ledger_rows 
--------------------+----------------------------
                   0 |                          0
(1 row)

    batch_no    | document_type |  status   | source_from_date | source_to_date | total_row_count | payload_bytes |          payload_prefix          
----------------+---------------+-----------+------------------+----------------+-----------------+---------------+----------------------------------
 TIB-202607-001 | HOMETAX       | COMPLETED | 2026-07-01       | 2026-07-31     |               0 |            32 | H4sIAAAAAAAA/4uOBQApu0wNAgAAAA==
 TIB-202605-001 | HOMETAX       | COMPLETED | 2026-05-01       | 2026-07-31     |               0 |            32 | H4sIAAAAAAAA/4uOBQApu0wNAgAAAA==
(2 rows)
```

판정: 수정 전·후 DB 상태는 동일하다. **총 2건 / 활성 2건 / payload 보유 2건 / payload 미보유 0건**, 형식은 **HOMETAX 2건**, **PARTNER_LEDGER 0건**이다. 이번 세션에서는 POST/DB 쓰기 SQL을 실행하지 않았고, Docker 이미지 재빌드·서비스 재배포도 하지 않았다.

### 10. 공통 read model·조회 불변식 관련 BE GREEN 원문

저장 경로가 공통 `PartnerLedgerReadModelService` 계약을 사용하고 조회 경로가 snapshot 저장을 호출하지 않는지 관련 테스트를 실행했다. `LedgerImageService`의 legacy read-only 테스트도 포함했으며, DB 쓰기 통합 테스트는 실행하지 않았다.

실행 명령:

```text
.\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.PartnerLedgerReadModelServiceTest --tests com.samhanair.logis.accounting.service.PartnerLedgerReadServiceTest --tests com.samhanair.logis.accounting.service.LedgerImageServiceTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :services:accounting-service:processResources UP-TO-DATE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :services:accounting-service:processTestResources UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :shared:collab-core:compileJava UP-TO-DATE
> Task :shared:collab-core:classes UP-TO-DATE
> Task :shared:collab-core:jar UP-TO-DATE
> Task :services:accounting-service:compileJava UP-TO-DATE
> Task :services:accounting-service:classes UP-TO-DATE
> Task :services:accounting-service:compileTestJava UP-TO-DATE
> Task :services:accounting-service:testClasses UP-TO-DATE
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 19s
21 actionable tasks: 1 executed, 20 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

판정: GREEN-A. 저장된 payload는 화면 read model documents와 일치하고, restore 응답도 같은 documents를 반환한다. 기존 legacy `lines` payload 복원은 기존 테스트로 유지된다.

### 7. FE GREEN-B 및 계약 회귀 실행 원문

GET 상세 변환, POST 저장 wrapper, 이력 API, 페이지 저장 버튼·조회 반복 회귀를 관련 세 파일로 제한해 실행했다.

실행 명령:

```text
npm run test -- src/renderer/api/partnerLedgerApi.test.ts src/renderer/api/partnerLedgerHistory.test.ts src/renderer/routes/PartnerLedgerPage.print.test.tsx --run
```

출력 원문:

```text
> @samhan/desktop@0.1.0 pretest
> node scripts/real-qa-scope.cjs --phase=test

[로컬 파생물 신선도] test 대상 확인 완료 — 이 확인은 design-system dist 최신성 · electron-updater 설치 버전 일치 · Electron out/main 빌드 최신성만 봅니다. node_modules 의 file: 링크 무결성이나 그 외 일반 의존성 상태는 다루지 않으며, 그런 문제는 이어지는 tsc/vitest 원본 오류로 드러납니다.

> @samhan/desktop@0.1.0 test
> vitest run src/renderer/api/partnerLedgerApi.test.ts src/renderer/api/partnerLedgerHistory.test.ts src/renderer/routes/PartnerLedgerPage.print.test.tsx --run


 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1061/clients/desktop

 ✓ src/renderer/api/partnerLedgerHistory.test.ts (3 tests) 4ms
 ✓ src/renderer/api/partnerLedgerApi.test.ts (3 tests) 12ms
 ✓ src/renderer/routes/PartnerLedgerPage.print.test.tsx (5 tests) 378ms

 Test Files  3 passed (3)
      Tests  11 passed (11)
   Start at  09:47:13
   Duration  3.10s (transform 763ms, setup 0ms, collect 1.42s, tests 394ms, environment 750ms, prepare 319ms)

stderr | src/renderer/routes/PartnerLedgerPage.print.test.tsx > PartnerLedgerPage 인쇄 미리보기 > 선택한 거래처들을 Electron-safe 일괄 인쇄 route로 전환한다
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in React.startTransition in v7. You can use the v7_startTransition future flag to opt-in early.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the v7_relativeSplatPath future flag to opt-in early.
```

판정: GREEN-B. 조회 반복은 captureLedger/POST를 호출하지 않고, 인쇄 경로도 GET read model만 사용한다. 신규 저장/복원 변환 테스트도 함께 통과했다.

### 8. 최종 관련 FE GREEN 원문

저장 시점 화면 line과 신규/legacy 복원 line의 행 수·금액 비교 테스트를 추가한 뒤 같은 관련 세 파일만 재실행했다.

실행 명령:

```text
npm run test -- src/renderer/api/partnerLedgerApi.test.ts src/renderer/api/partnerLedgerHistory.test.ts src/renderer/routes/PartnerLedgerPage.print.test.tsx --run
```

출력 원문:

```text
> @samhan/desktop@0.1.0 pretest
> node scripts/real-qa-scope.cjs --phase=test

[로컬 파생물 신선도] test 대상 확인 완료 — 이 확인은 design-system dist 최신성 · electron-updater 설치 버전 일치 · Electron out/main 빌드 최신성만 봅니다. node_modules 의 file: 링크 무결성이나 그 외 일반 의존성 상태는 다루지 않으며, 그런 문제는 이어지는 tsc/vitest 원본 오류로 드러납니다.

> @samhan/desktop@0.1.0 test
> vitest run src/renderer/api/partnerLedgerApi.test.ts src/renderer/api/partnerLedgerHistory.test.ts src/renderer/routes/PartnerLedgerPage.print.test.tsx --run


 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1061/clients/desktop

 ✓ src/renderer/api/partnerLedgerHistory.test.ts (3 tests) 7ms
 ✓ src/renderer/api/partnerLedgerApi.test.ts (5 tests) 20ms
 ✓ src/renderer/routes/PartnerLedgerPage.print.test.tsx (5 tests) 360ms

 Test Files  3 passed (3)
      Tests  13 passed (13)
   Start at  09:48:36
   Duration  3.42s (transform 841ms, setup 0ms, collect 1.50s, tests 387ms, environment 724ms, prepare 611ms)

stderr | src/renderer/routes/PartnerLedgerPage.print.test.tsx > PartnerLedgerPage 인쇄 미리보기 > 선택한 거래처들을 Electron-safe 일괄 인쇄 route로 전환한다
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in React.startTransition in v7. You can use the v7_startTransition future flag to opt-in early.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the v7_relativeSplatPath future flag to opt-in early.
```

### 9. 최종 관련 BE GREEN 원문

BE 저장 payload·복원 응답·lineCount 검증 테스트를 최종 상태에서 재실행했다.

실행 명령:

```text
.\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.LedgerSnapshotServiceTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :services:accounting-service:processResources UP-TO-DATE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :services:accounting-service:processTestResources UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :shared:collab-core:compileJava UP-TO-DATE
> Task :shared:collab-core:classes UP-TO-DATE
> Task :services:accounting-service:compileJava UP-TO-DATE
> Task :services:accounting-service:classes UP-TO-DATE
> Task :services:accounting-service:compileTestJava
> Task :services:accounting-service:testClasses
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 22s
21 actionable tasks: 2 executed, 19 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

## 최종 결과

### 수정 내용

- `LedgerSnapshotService.capture`가 독립 `LedgerImageService`를 재계산하지 않고 `PartnerLedgerReadService.read`의 `PartnerLedgerResponse`를 압축 저장한다.
- 저장 response도 `PartnerLedgerResponse`로 맞춰 POST가 화면 GET과 같은 계약을 소비한다.
- 신규 snapshot 복원은 `documents`를 사용하고, 기존 gzip+Base64 `LedgerImageResponse.lines` snapshot은 `LedgerSnapshotResponse.lines`로 손실 없이 복원한다.
- 프런트의 GET/POST/복원은 같은 `buildPartnerLedgerLines` 변환을 사용하므로 저장 직후 복원한 행 수·금액이 저장 시점 화면과 같다.
- 조회·이력 조회/복원·단건/일괄 인쇄 경로에는 snapshot 저장 호출을 추가하지 않았다.

### 검증 판정

- RED-A: 수정 전 `LedgerSnapshotService`가 `PartnerLedgerReadService`를 받지 않아 컴파일 실패. 수정 후 저장 payload와 복원 documents가 화면 read model과 일치.
- RED-B: 수정 전부터 PASS였던 조회-only 회귀를 유지. 수정 후 페이지/인쇄 관련 13건 GREEN, 관련 BE read model·read-only 테스트 GREEN.
- DB: 수정 전후 **2건 → 2건**, 활성 **2건 → 2건**. 형식 **HOMETAX 2건**, **PARTNER_LEDGER 0건**. DB 쓰기 SQL은 실행하지 않음.
- 전체 테스트 스위트, Docker 이미지 재빌드/서비스 재배포, git 명령은 실행하지 않음.

### 새 파일 목록

- `docs/dev-reports/2026-08-04-1001-r28-snapshot-content-fix.md`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/LedgerSnapshotResponse.java`

### 수정 파일 목록

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LedgerSnapshotService.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/LedgerHistoryResponse.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/LedgerSnapshotServiceTest.java`
- `clients/desktop/src/renderer/api/partnerLedgerApi.ts`
- `clients/desktop/src/renderer/api/partnerLedgerApi.test.ts`
- `clients/desktop/src/renderer/api/partnerLedgerHistory.test.ts`
- `clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx`

상태: **DONE**

### 14. 타입 보완 후 최종 FE GREEN 원문

`SALE_SUMMARY` line 타입 보완 후 최종 관련 FE 테스트를 다시 실행했다.

실행 명령:

```text
npm run test -- src/renderer/api/partnerLedgerApi.test.ts src/renderer/api/partnerLedgerHistory.test.ts src/renderer/routes/PartnerLedgerPage.print.test.tsx --run
```

출력 원문:

```text
> @samhan/desktop@0.1.0 pretest
> node scripts/real-qa-scope.cjs --phase=test

[로컬 파생물 신선도] test 대상 확인 완료 — 이 확인은 design-system dist 최신성 · electron-updater 설치 버전 일치 · Electron out/main 빌드 최신성만 봅니다. node_modules 의 file: 링크 무결성이나 그 외 일반 의존성 상태는 다루지 않으며, 그런 문제는 이어지는 tsc/vitest 원본 오류로 드러납니다.

> @samhan/desktop@0.1.0 test
> vitest run src/renderer/api/partnerLedgerApi.test.ts src/renderer/api/partnerLedgerHistory.test.ts src/renderer/routes/PartnerLedgerPage.print.test.tsx --run


 RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1061/clients/desktop

 ✓ src/renderer/api/partnerLedgerHistory.test.ts (3 tests) 4ms
 ✓ src/renderer/api/partnerLedgerApi.test.ts (5 tests) 12ms
 ✓ src/renderer/routes/PartnerLedgerPage.print.test.tsx (5 tests) 347ms

 Test Files  3 passed (3)
      Tests  13 passed (13)
 Start at  09:52:20
 Duration  2.78s (transform 690ms, setup 0ms, collect 1.25s, tests 362ms, environment 631ms, prepare 380ms)

stderr | src/renderer/routes/PartnerLedgerPage.print.test.tsx > PartnerLedgerPage 인쇄 미리보기 > 선택한 거래처들을 Electron-safe 일괄 인쇄 route로 전환한다
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in React.startTransition in v7. You can use the v7_startTransition future flag to opt-in early.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the v7_relativeSplatPath future flag to opt-in early.
```

### 15. 최종 BE GREEN 원문

작업자 actor 보존 assertion을 추가한 최종 저장/복원 테스트를 재실행했다.

실행 명령:

```text
.\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.LedgerSnapshotServiceTest --no-daemon
```

출력 원문:

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :services:accounting-service:processResources UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :services:accounting-service:processTestResources UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :shared:collab-core:compileJava UP-TO-DATE
> Task :shared:collab-core:classes UP-TO-DATE
> Task :shared:collab-core:jar UP-TO-DATE
> Task :services:accounting-service:compileJava UP-TO-DATE
> Task :services:accounting-service:classes UP-TO-DATE
> Task :services:accounting-service:compileTestJava
> Task :services:accounting-service:testClasses
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 25s
21 actionable tasks: 2 executed, 19 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```
