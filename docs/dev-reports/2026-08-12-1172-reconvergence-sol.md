# PR #1172 재수렴 적대검증 (SOL)

- 대상: `feat/1068-slip-header-autofill`
- 목적: main 5커밋 rebase 이후 새로 생긴, 실 사용자 경로로 재현 가능한 결함 판정
- 금지 준수: git 명령 미사용, 공유 Docker 스택 쓰기 미수행
- 라이브 QA: 본 라운드 범위 밖

## 1. rebase 의미 충돌 가설 코드 대조

### 가설 1 — UUID 제거 필드가 전잔·후잔 조인 키인가

실행 원문:

```text
> Write-Output '=== H1: public/admin vs internal join contract ==='; rg -n 'public record PartnerAdminResponse|String partnerCode|UUID partnerId|public record PartnerInternalResponse|parseUuid\(data|PartnerSummary\(partnerId|/internal/partners|partner-ledger-sales|queryParamIfPresent\("partnerId"' services/partner-service/src/main/java/com/samhanair/logis/partner/dto/PartnerAdminResponse.java services/partner-service/src/main/java/com/samhanair/logis/partner/dto/PartnerInternalResponse.java services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLookupClient.java services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLedgerSalesClient.java services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java
=== H1: public/admin vs internal join contract ===
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLedgerSalesClient.java:35:    public List<Sale> find(LocalDate from, LocalDate to, String partnerCode, UUID partnerId) {
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLedgerSalesClient.java:38:                    .uri(uri -> uri.path("/internal/slips/partner-ledger-sales")
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLedgerSalesClient.java:57:                    .uri(uri -> uri.path("/internal/slips/partner-ledger-sales/by-slip-no")
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLedgerSalesClient.java:72:    public record Sale(String slipNo, LocalDate slipDate, String status, String partnerCode,
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLedgerSalesClient.java:73:                       UUID partnerId, String partnerName, String businessNumber,
services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java:21:        String partnerCode,
services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/PartnerLedgerSalesResponse.java:22:        UUID partnerId,
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLookupClient.java:29: * <p>{@code GET /internal/partners/{partnerCode}} 호출 → PartnerSummary 반환.
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLookupClient.java:334:            String body = restClient.get().uri("/internal/partners/{partnerCode}", trimmed)
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLookupClient.java:646:            UUID partnerId = parseUuid(data, "partnerId", "id");
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLookupClient.java:647:            String partnerCode = textOrNull(data, "partnerCode");
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerLookupClient.java:666:            return LookupResult.found(new PartnerSummary(partnerId, partnerCode, name, businessNo, address,
services/partner-service/src/main/java/com/samhanair/logis/partner/dto/PartnerAdminResponse.java:30:public record PartnerAdminResponse(
services/partner-service/src/main/java/com/samhanair/logis/partner/dto/PartnerAdminResponse.java:31:        String partnerCode,
services/partner-service/src/main/java/com/samhanair/logis/partner/dto/PartnerInternalResponse.java:28:public record PartnerInternalResponse(
services/partner-service/src/main/java/com/samhanair/logis/partner/dto/PartnerInternalResponse.java:29:        UUID partnerId,
services/partner-service/src/main/java/com/samhanair/logis/partner/dto/PartnerInternalResponse.java:30:        String partnerCode,
Exit code: 0
```

판정: 가설 기각. 공개 관리자 응답의 UUID는 제거되어 있지만 전잔·후잔 조인은 공개 `PartnerAdminResponse`가 아니라 내부 `/internal/partners/{partnerCode}`의 `PartnerInternalResponse.partnerId`와 내부 slip projection의 `partnerId`를 사용한다. 현재 계약에서는 UUID 제거 때문에 조인 키가 비어 0건이 되는 경로가 없다.

### 가설 2 — 새 전잔·후잔 공개 응답의 UUID 누출

실행 원문:

```text
> rg -n "public record PartnerLedgerResponse|UUID|partnerId|journalId|slipId|String partnerCode|String documentNo|openingBalance|closingBalance" services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/PartnerLedgerResponse.java services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:33:import java.util.UUID;
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:76: * <p>UUID 비공개 가드 — 응답은 partnerCode + partnerName + slipNo / taxInvoiceNo / journalNo
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:195:            @RequestParam String partnerCode,
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:297:     * @param userId 작업자 UUID (X-User-Id 헤더)
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:314:        UUID actorId = parseUuid(userId);
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:326:     * @param batchId   배치 UUID (내부 식별자 — 사용자에게 직접 노출 금지)
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:340:            @PathVariable UUID batchId,
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:469:    private static UUID parseUuid(String raw) {
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:472:            return UUID.fromString(raw);
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/PartnerLedgerResponse.java:8:public record PartnerLedgerResponse(
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/PartnerLedgerResponse.java:9:        String partnerCode,
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/PartnerLedgerResponse.java:14:        BigDecimal openingBalance,
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/PartnerLedgerResponse.java:17:        BigDecimal closingBalance,
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/PartnerLedgerResponse.java:46:            String documentNo,
services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/PartnerLedgerResponse.java:48:            String partnerCode,
Exit code: 0
```

판정: 가설 기각. `/accounting/journals/sales-slip-ledger`가 반환하는 `PartnerLedgerResponse`에는 UUID, `partnerId`, `journalId`, `slipId` 필드가 없다. 컨트롤러의 UUID 사용은 다른 요청 헤더·내부 path 식별자이며 이 응답 본문 계약과 무관하다.

### 가설 3 — S4a 정산과 원장 서비스의 동일 데이터 상이 판독

실행 원문:

```text
> $out = rg -n "JournalLineRepository|journalLineRepository|PartnerLedgerReadModelService|aggregatePostedOnlyByPartnerAccount|findPartnerLinesInRange" services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementService.java services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementCalculator.java services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/SalesCommissionSettlementController.java; if ($LASTEXITCODE -eq 1) { Write-Output 'NO_MATCH: settlement S4a path does not reference ledger/journal read APIs' } elseif ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } else { $out }
NO_MATCH: settlement S4a path does not reference ledger/journal read APIs
Exit code: 0
```

판정: 가설 기각. S4a 정산 경로는 정산 snapshot 입력과 정산 전용 repository/calculator를 사용하며, 이 PR의 `JournalLineRepository`/`PartnerLedgerReadModelService` 판독 경로를 참조하지 않는다. 같은 원천 데이터를 서로 다르게 읽는 직접 결합점이 현재 코드에 없다.

### 코드 대조 중간 결론

- 실 사용자 재현 결함: 현재 0건.
- rebase로 사용자 화면 동작이 바뀌었다는 코드 증거: 현재 없음.
- 다음 측정: 변경 모듈 전량 테스트와 desktop typecheck.

## 2. accounting-service 전량 테스트

실행 원문:

```text
> .\gradlew.bat :services:accounting-service:test --no-daemon --console=plain
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :services:accounting-service:processResources UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:notification-publisher:compileJava UP-TO-DATE
> Task :services:accounting-service:processTestResources UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:notification-publisher:processResources UP-TO-DATE
> Task :shared:notification-publisher:classes UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:notification-publisher:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:common:compileJava FROM-CACHE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:ecount-io:compileJava FROM-CACHE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava FROM-CACHE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :shared:common:jar
> Task :shared:collab-core:compileJava FROM-CACHE
> Task :shared:collab-core:classes UP-TO-DATE
> Task :shared:collab-core:jar UP-TO-DATE
> Task :services:accounting-service:compileJava
> Task :services:accounting-service:classes

> Task :services:accounting-service:compileTestJava

> Task :services:accounting-service:testClasses
> Task :services:accounting-service:test

2026-08-12T11:09:12.866+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.867+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Shutdown initiated...
2026-08-12T11:09:12.868+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Shutdown completed.
2026-08-12T11:09:12.873+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.874+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-5 - Shutdown initiated...
2026-08-12T11:09:12.876+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-5 - Shutdown completed.
2026-08-12T11:09:12.880+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.880+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-8 - Shutdown initiated...
2026-08-12T11:09:12.881+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-8 - Shutdown completed.
2026-08-12T11:09:12.885+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.885+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-11 - Shutdown initiated...
2026-08-12T11:09:12.886+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-11 - Shutdown completed.
2026-08-12T11:09:12.890+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.891+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-17 - Shutdown initiated...
2026-08-12T11:09:12.892+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-17 - Shutdown completed.
2026-08-12T11:09:12.897+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.897+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-18 - Shutdown initiated...
2026-08-12T11:09:12.898+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-18 - Shutdown completed.
2026-08-12T11:09:12.902+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.903+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-25 - Shutdown initiated...
2026-08-12T11:09:12.904+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-25 - Shutdown completed.
2026-08-12T11:09:12.908+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.908+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-26 - Shutdown initiated...
2026-08-12T11:09:12.909+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-26 - Shutdown completed.
2026-08-12T11:09:12.913+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.914+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-27 - Shutdown initiated...
2026-08-12T11:09:12.915+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-27 - Shutdown completed.
2026-08-12T11:09:12.918+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.919+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-28 - Shutdown initiated...
2026-08-12T11:09:12.920+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-28 - Shutdown completed.
2026-08-12T11:09:12.924+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.924+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-29 - Shutdown initiated...
2026-08-12T11:09:12.926+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-29 - Shutdown completed.
2026-08-12T11:09:12.930+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.930+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-30 - Shutdown initiated...
2026-08-12T11:09:12.931+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-30 - Shutdown completed.
2026-08-12T11:09:12.936+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.936+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-31 - Shutdown initiated...
2026-08-12T11:09:12.938+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-31 - Shutdown completed.
2026-08-12T11:09:12.941+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.942+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-32 - Shutdown initiated...
2026-08-12T11:09:12.942+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-32 - Shutdown completed.
2026-08-12T11:09:12.946+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.946+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-33 - Shutdown initiated...
2026-08-12T11:09:12.948+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-33 - Shutdown completed.
2026-08-12T11:09:12.951+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.951+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-34 - Shutdown initiated...
2026-08-12T11:09:12.952+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-34 - Shutdown completed.
2026-08-12T11:09:12.955+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.956+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-35 - Shutdown initiated...
2026-08-12T11:09:12.958+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-35 - Shutdown completed.
2026-08-12T11:09:12.962+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.962+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-36 - Shutdown initiated...
2026-08-12T11:09:12.964+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-36 - Shutdown completed.
2026-08-12T11:09:12.968+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.968+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-40 - Shutdown initiated...
2026-08-12T11:09:12.970+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-40 - Shutdown completed.
2026-08-12T11:09:12.974+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.974+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-41 - Shutdown initiated...
2026-08-12T11:09:12.975+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-41 - Shutdown completed.
2026-08-12T11:09:12.979+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.979+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-42 - Shutdown initiated...
2026-08-12T11:09:12.980+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-42 - Shutdown completed.
2026-08-12T11:09:12.984+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.984+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-43 - Shutdown initiated...
2026-08-12T11:09:12.985+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-43 - Shutdown completed.
2026-08-12T11:09:12.989+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.989+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-45 - Shutdown initiated...
2026-08-12T11:09:12.991+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-45 - Shutdown completed.
2026-08-12T11:09:12.993+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.993+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-46 - Shutdown initiated...
2026-08-12T11:09:12.994+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-46 - Shutdown completed.
2026-08-12T11:09:12.998+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:12.998+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-47 - Shutdown initiated...
2026-08-12T11:09:13.000+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-47 - Shutdown completed.
2026-08-12T11:09:13.003+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:13.004+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-48 - Shutdown initiated...
2026-08-12T11:09:13.005+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-48 - Shutdown completed.
2026-08-12T11:09:13.008+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:13.008+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-50 - Shutdown initiated...
2026-08-12T11:09:13.010+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-50 - Shutdown completed.
2026-08-12T11:09:13.014+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:13.014+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-51 - Shutdown initiated...
2026-08-12T11:09:13.015+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-51 - Shutdown completed.
2026-08-12T11:09:13.867+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:13.879+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-52 - Shutdown initiated...
2026-08-12T11:09:13.879+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-52 - Shutdown completed.
2026-08-12T11:09:13.889+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:13.889+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-56 - Shutdown initiated...
2026-08-12T11:09:13.890+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-56 - Shutdown completed.
2026-08-12T11:09:13.894+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:13.894+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-58 - Shutdown initiated...
2026-08-12T11:09:13.895+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-58 - Shutdown completed.
2026-08-12T11:09:13.897+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:09:13.898+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-59 - Shutdown initiated...
2026-08-12T11:09:13.898+09:00  INFO 55944 --- [accounting-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-59 - Shutdown completed.

BUILD SUCCESSFUL in 7m 30s
21 actionable tasks: 4 executed, 4 from cache, 13 up-to-date
Note: Some input files use unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
Exit code: 0
Wall time: 450.5 seconds
```

판정: 전량 test task 성공. 이 측정에서 실 사용자 재현 결함 0건.

## 4. slip-service 전량 테스트 — 1차

실행 원문:

```text
> .\gradlew.bat :services:slip-service:test --no-daemon --console=plain
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :services:slip-service:processResources UP-TO-DATE
> Task :shared:collab-core:processResources UP-TO-DATE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :services:slip-service:processTestResources UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :shared:collab-core:compileJava UP-TO-DATE
> Task :shared:collab-core:classes UP-TO-DATE
> Task :shared:collab-core:jar UP-TO-DATE
> Task :services:slip-service:compileJava
> Task :services:slip-service:classes

> Task :services:slip-service:compileTestJava

> Task :services:slip-service:testClasses
> Task :services:slip-service:test

SlipSalesUpdateIT > R9 RED-A GREEN: 명시 이관 후 keyless 8행 두 인스턴스의 첫 head 수량 편집은 200이다 FAILED
    org.opentest4j.AssertionFailedError at SlipSalesUpdateIT.java:416

2026-08-12T11:24:51.128+09:00  INFO 93944 --- [slip-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:24:51.129+09:00  INFO 93944 --- [slip-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-79 - Shutdown initiated...
2026-08-12T11:24:51.130+09:00  INFO 93944 --- [slip-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-79 - Shutdown completed.

> Task :services:slip-service:test

> Task :services:slip-service:test FAILED
18 actionable tasks: 3 executed, 15 up-to-date
Note: Some input files use or override a deprecated API.
Note: Recompile with -Xlint:deprecation for details.
Note: Some input files use unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended

1873 tests completed, 1 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:slip-service:test'.
> There were failing tests. See the report at: file:///C:/dev/Samhan-Public/.claude/worktrees/w1068/services/slip-service/build/reports/tests/test/index.html

* Try:
> Run with --scan to get full insights.

BUILD FAILED in 10m 33s
Exit code: 1
Wall time: 634.3 seconds
```

중간 판정: 전체 1,873건 중 1건 실패. 실패 테스트는 판매전표 수정의 keyless bundle 8행 이관 경로로, 요청된 전잔·후잔/거래처 자동채움 및 rebase 5커밋의 직접 겹침 표면과는 이름상 다르다. 그러나 실 사용자 경로 여부와 재현 안정성을 확인하기 전에는 결함 0건으로 닫지 않는다.

### 실패 원인 추적

실행 원문:

```text
> $xml = Get-ChildItem 'services/slip-service/build/test-results/test' -Filter '*SlipSalesUpdateIT*.xml' | Select-Object -First 1; if ($xml) { Write-Output "RESULT_FILE=$($xml.FullName)"; Select-String -Path $xml.FullName -Pattern '<testcase|<failure' -Context 0,8 }; $p='services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipSalesUpdateIT.java'; $c=Get-Content $p; for($i=360;$i -le 417;$i++){ '{0,4}: {1}' -f $i,$c[$i-1] }
RESULT_FILE=C:\dev\Samhan-Public\.claude\worktrees\w1068\services\slip-service\build\test-results\test\TEST-com.samhanair.logis.slip.it.SlipSalesUpdateIT.xml
services\slip-service\build\test-results\test\TEST-com.samhanair.logis.slip.it.SlipSalesUpdateIT.xml:16:    <failure message="org.opentest4j.AssertionFailedError: &#13;&#10;expected: 2&#13;&#10; but was: 1" type="org.opentest4j.AssertionFailedError">org.opentest4j.AssertionFailedError:
services\slip-service\build\test-results\test\TEST-com.samhanair.logis.slip.it.SlipSalesUpdateIT.xml:17:expected: 2
services\slip-service\build\test-results\test\TEST-com.samhanair.logis.slip.it.SlipSalesUpdateIT.xml:18: but was: 1
services\slip-service\build\test-results\test\TEST-com.samhanair.logis.slip.it.SlipSalesUpdateIT.xml:23: at app//com.samhanair.logis.slip.it.SlipSalesUpdateIT.testR9MigratedKeylessMultiInstancePositiveEdit(SlipSalesUpdateIT.java:416)
 360:     @Test
 361:     @DisplayName("R9 RED-A GREEN: 명시 이관 후 keyless 8행 두 인스턴스의 첫 head 수량 편집은 200이다")
 362:     void testR9MigratedKeylessMultiInstancePositiveEdit() throws Exception {
 363:         Slip fixture = persistR9KeylessTargetFixture();
 364:         applyR9MigrationFixturePath();
 366:         MvcResult detail = mockMvc.perform(get(SLIPS_PATH + "/" + fixture.getId())
 369:                 .andExpect(status().isOk())
 371:         JsonNode data = objectMapper.readTree(detail.getResponse().getContentAsString()).path("data");
 373:         List<Map<String, Object>> lines = new java.util.ArrayList<>();
 374:         for (JsonNode line : data.path("lines")) {
 375:             Map<String, Object> requestLine = objectMapper.convertValue(line, Map.class);
 376:             requestLine.put("lineId", requestLine.remove("id"));
 377:             if (line.path("setHead").asBoolean() && lines.isEmpty()) {
 378:                 requestLine.put("quantity", 2);
 379:             }
 380:             lines.add(requestLine);
 381:         }
 389:         mockMvc.perform(put(SLIPS_PATH + "/" + fixture.getId() + SALES_SUFFIX)
 395:                 .andExpect(status().isOk())
 396:                 .andExpect(jsonPath("$.data.lines", hasSize(8)));
 402:         assertThat(saved).hasSize(8);
 403:         assertThat(saved).allMatch(row -> row.get("bundle_set_options").toString().contains("instanceKey"));
 407:                 Integer.class, fixture.getId())).isEqualTo(2);
 411:                 Integer.class, fixture.getId())).isEqualTo(2);
 412:         assertThat(jdbcTemplate.queryForObject(
 413:                 "SELECT quantity FROM slip_lines WHERE slip_id = ? AND set_head = true "
 414:                         + "AND is_deleted = false AND parent_set_model = 'AC060CS6PBH1SY' "
 415:                         + "ORDER BY created_at LIMIT 1",
 416:                 Integer.class, fixture.getId())).isEqualTo(2);
 417:     }
Exit code: 0
```

단독 강제 재실행 원문:

```text
> .\gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.it.SlipSalesUpdateIT.testR9MigratedKeylessMultiInstancePositiveEdit' --rerun-tasks --no-daemon --console=plain
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:collab-core:processResources
> Task :shared:realtime-abstraction:processResources
> Task :services:slip-service:processResources
> Task :services:slip-service:processTestResources
> Task :shared:security:compileJava
> Task :shared:security:processResources
> Task :shared:security:classes
> Task :shared:common:compileJava
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes
> Task :shared:common:jar
> Task :shared:security:jar
> Task :shared:ecount-io:compileJava
> Task :shared:ecount-io:classes
> Task :shared:ecount-io:jar
> Task :shared:realtime-abstraction:compileJava
> Task :shared:realtime-abstraction:classes
> Task :shared:realtime-abstraction:jar
> Task :shared:collab-core:compileJava
> Task :shared:collab-core:classes
> Task :shared:collab-core:jar
> Task :services:slip-service:compileJava
> Task :services:slip-service:classes

> Task :services:slip-service:compileTestJava

> Task :services:slip-service:testClasses
2026-08-12T11:26:43.651+09:00  INFO 15496 --- [slip-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:26:43.653+09:00  INFO 15496 --- [slip-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Shutdown initiated...
2026-08-12T11:26:43.656+09:00  INFO 15496 --- [slip-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Shutdown completed.
> Task :services:slip-service:test

BUILD SUCCESSFUL in 1m 8s
18 actionable tasks: 18 executed
Note: Some input files use or override a deprecated API.
Note: Recompile with -Xlint:deprecation for details.
Note: Some input files use unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
Exit code: 0
Wall time: 69.1 seconds
```

판정: 실 사용자 결함으로 보고하지 않는다. 1차 실패에서도 HTTP 200, 8행 보존, `instanceKey` 2개, head 2개는 모두 통과했다. 테스트가 수량을 2로 바꾸는 조건은 `setHead && lines.isEmpty()`라서 응답 첫 행이 head가 아니면 편집 요청 자체가 발생하지 않지만, 마지막 assertion은 무조건 가장 이른 head 수량 2를 요구한다. 단독 실행은 통과했다. 이는 전량 실행 순서에 의존한 테스트 전제의 비결정성이며, 사용자가 실제로 head 행을 선택·수정했는데 값이 사라지는 재현 증거가 아니다. 사용자 지시상 검증 품질 지적으로 결함 등록하지 않는다.

### slip-service 전량 강제 재실행

실행 원문:

```text
> .\gradlew.bat :services:slip-service:test --rerun-tasks --no-daemon --console=plain
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :shared:collab-core:processResources
> Task :shared:realtime-abstraction:processResources
> Task :services:slip-service:processResources
> Task :services:slip-service:processTestResources
> Task :shared:security:compileJava
> Task :shared:security:processResources
> Task :shared:security:classes
> Task :shared:common:compileJava
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes
> Task :shared:common:jar
> Task :shared:security:jar
> Task :shared:ecount-io:compileJava
> Task :shared:ecount-io:classes
> Task :shared:ecount-io:jar
> Task :shared:realtime-abstraction:compileJava
> Task :shared:realtime-abstraction:classes
> Task :shared:realtime-abstraction:jar
> Task :shared:collab-core:compileJava
> Task :shared:collab-core:classes
> Task :shared:collab-core:jar
> Task :services:slip-service:compileJava
> Task :services:slip-service:classes

> Task :services:slip-service:compileTestJava

> Task :services:slip-service:testClasses
> Task :services:slip-service:test

2026-08-12T11:37:41.107+09:00  INFO 24616 --- [slip-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:37:41.107+09:00  INFO 24616 --- [slip-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-79 - Shutdown initiated...
2026-08-12T11:37:41.108+09:00  INFO 24616 --- [slip-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-79 - Shutdown completed.

BUILD SUCCESSFUL in 10m 5s
18 actionable tasks: 18 executed
Note: Some input files use or override a deprecated API.
Note: Recompile with -Xlint:deprecation for details.
Note: Some input files use unchecked or unsafe operations.
Note: Recompile with -Xlint:unchecked for details.
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
Exit code: 0
Wall time: 606.2 seconds
```

판정: 전량 강제 재실행 성공. 1차 실패는 재현되지 않았으며, 실 사용자 재현 결함으로 전환할 증거가 없다.

## 5. desktop typecheck — 1차

실행 원문:

```text
> cd clients/desktop; npm run typecheck

> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

[로컬 파생물 신선도 확인 실패] 검증 결과를 코드 결함으로 해석하지 마십시오.
- file: 의존 design-system dist이(가) 소스보다 오래됐습니다: ..\web\design-system\dist\index.d.ts
산출물=2026-08-11T14:23:22.611Z, 최신 소스=..\web\design-system\src\utils\actorName.ts (2026-08-12T01:53:25.880Z)
코드 오류로 단정하지 말고 먼저 cd ..\web\design-system; npm run build
Exit code: 1
Wall time: 0.9 seconds
```

중간 판정: TypeScript 컴파일 단계 진입 전 로컬 파생물 신선도 가드가 중단했다. 출력 자체가 코드 결함 해석을 금지하고 design-system build 후 재실행을 지시하므로, 사용자 결함으로 보고하지 않는다.

가드 지시 이행 원문:

```text
> cd clients/web/design-system; npm run build

> @samhan/design-system@0.1.0 build
> tsc -p tsconfig.build.json && vite build

vite v5.4.21 building for production...
transforming...
✓ 165 modules transformed.
rendering chunks...

[vite:dts] Start generate declaration files...
computing gzip size...
dist/style.css    95.14 kB │ gzip:  15.37 kB
dist/index.js    324.49 kB │ gzip: 152.10 kB
[vite:dts] Start rollup declaration files...
Analysis will use the bundled TypeScript version 5.9.3
[vite:dts] Declaration files built in 4951ms.

✓ built in 6.02s

/fonts/PretendardVariable.woff2 referenced in /fonts/PretendardVariable.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

/fonts/Pretendard-Regular.woff2 referenced in /fonts/Pretendard-Regular.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

/fonts/Pretendard-Bold.woff2 referenced in /fonts/Pretendard-Bold.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime
Exit code: 0
Wall time: 17.1 seconds
```

### desktop typecheck 재실행

실행 원문:

```text
> cd clients/desktop; npm run typecheck

> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

[로컬 파생물 신선도] typecheck 대상 확인 완료 — 이 확인은 design-system dist 최신성 · electron-updater 설치 버전 일치만 봅니다. node_modules 의 file: 링크 무결성이나 그 외 일반 의존성 상태는 다루지 않으며, 그런 문제는 이어지는 tsc/vitest 원본 오류로 드러납니다.

> @samhan/desktop@0.1.0 typecheck:real-qa
> node --test scripts/real-qa-cleanup-scope.test.cjs && node --test scripts/real-qa-scope.test.cjs

✔ playwright/869-ds4-real-qa/869-ds4-real-qa.spec.ts keeps cleanup id outside its try block (15.9228ms)
✔ playwright/869-ds4-real-qa/ds4-body-layer-regression-real-qa.spec.ts keeps cleanup id outside its try block (7.0853ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 431.2245
warning: in the working copy of 'clients/desktop/playwright/a-real-qa.spec.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'clients/desktop/playwright/tracked-real-qa.spec.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'clients/desktop/playwright/manual/slip-form-3d-real-qa.spec.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of '.gitignore', LF will be replaced by CRLF the next time Git touches it
[real-QA 추적 집합 불일치] 공식 공유 하네스 실행을 중단합니다.
디스크에는 있지만 Git 추적 목록에는 없는 스펙(공식 수치에 섞이지 않음):
- clients/desktop/playwright/n1b-native-qa/r2fix-untracked-only-real-qa.spec.ts
의도적으로 미추적 로컬 스펙만 실행하려면 REAL_QA_ALLOW_UNTRACKED=1 을 설정하고 명시 경로를 전달하십시오.
[real-QA 로컬 실행 모드] 위 차집합은 의도 실행으로 허용했으며 공식 수치로 사용하지 마십시오.
✔ PR #1164 live-login spec is registered in the shared real-QA disk scope (234.0212ms)
✔ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다(.gitignore 가 허용한 로컬 스펙은 예외) (220.8091ms)
✔ F-2: .gitignore 등재 경로 안의 추적 스펙 2개가 공식 집합에 남는다 (201.9216ms)
✔ 결함6 참고: 구 assert.equal 방식은 추적 스펙이 늘기만 해도 실패했다(합성 173 vs 172, 고정 실측) (0.8836ms)
✔ 결함1: REAL_QA_ALLOW_UNTRACKED 세션 잔존은 명시 경로 없는 전체 실행을 오염시키지 않는다 (1655.1074ms)
✔ F-1 RED: playwright/ 전체 위치 인자는 남은 ALLOW_UNTRACKED 로 우회되지 않는다 (606.4451ms)
✔ 결함1 핵심: 집합이 깨끗해도 명시 경로 없는 real-QA 전체 실행은 차단한다 (0.2696ms)
✔ 결함1 U-1: 예외 모드 경고가 stdout 에도 남는다(1> 리다이렉트로도 보여야 함) (627.0957ms)
✔ 결함2: allowUntracked 는 집합이 줄어드는 방향(missingFiles)을 절대 덮지 않는다(#864 계열) (614.4595ms)
✔ 결함3: 미추적 로컬 스펙이 있어도 추적 스펙만의 격리 실행은 막지 않는다(플래그 불필요) (802.2183ms)
✔ 결함3 보강: narrow 실행에 미추적 스펙 자신이 포함되면 여전히(플래그 없이는) 막는다 (634.0592ms)
✔ 결함1·3 실측 보강: 워커 프로세스처럼 argv 가 비어도 narrow 실행이 유지된다(부모→자식 전파) (769.7577ms)
✔ 결함8: core.quotepath 8진 이스케이프가 걸려도 비ASCII 추적 real-QA 스펙을 잃지 않는다 (778.7219ms)
✔ 재수렴 결함1: .gitignore 로 커버된 untracked 스펙은 unexpectedUntrackedFiles 에서 빠진다 (640.2698ms)
✔ 재수렴 결함1: .gitignore 로 커버되지 않는 untracked 스펙은 여전히 unexpectedUntrackedFiles 에 남는다(#864 계열 회귀 보존) (633.565ms)
✔ 재수렴 결함1 단위: listGitignoredUntrackedRealQaFiles 는 .gitignore 로 무시된 untracked 파일만 반환한다 (580.1769ms)
✔ 재수렴 결함1 회귀: compareRealQaScope 의 gitignoredFiles 기본값(생략)은 전부 unexpectedUntrackedFiles 로 취급한다 (0.3608ms)
✔ 재수렴 결함2: 정규식 이스케이프 `\.`(리터럴 점) 인자가 백슬래시 정규화로 깨지지 않는다 (622.1983ms)
✔ 재수렴 결함2: 정규식 이스케이프 `\d`(숫자 클래스) 인자가 과차단되지 않는다 (643.2929ms)
✔ 재수렴 결함2: 문자 클래스 `[0-9]` 인자가 과차단되지 않는다 (665.5947ms)
✔ 재수렴 결함2: 와일드카드 `.*` 인자가 과차단되지 않고 여러 파일에 걸쳐 매치한다 (643.2353ms)
✔ 재수렴 결함2 회귀: 원시 정규식이 0건일 때만 백슬래시 경로 관용 표기로 폴백한다(과잉 폴백 방지) (644.2162ms)
✔ 재수렴 결함4: --project 가변인자(공백형 다중값)의 두 번째 값이 위치 인자로 오분류되지 않는다 (0.225ms)
✔ 재수렴 결함4: --project 가변인자 뒤에 진짜 위치 인자(스펙 경로)가 오면 그것만 후보로 잡는다 (0.0954ms)
✔ 재수렴 결함4: --project 값 1개(단일)는 기존처럼 정상 동작한다(회귀 보존) (0.0704ms)
✔ R2-1 글롭 인자: `<접두사>-*` 형태로 추적 스펙 2개만의 격리 실행이 통과한다 (659.9483ms)
✔ R2-1 조각(fragment) 인자 — 여러 파일에 걸치는 조각(예: 825-s5) (657.7305ms)
✔ R2-1 조각(fragment) 인자 — 파일 하나만 골라내는 조각(예: null-semantics)은 형제 파일을 끌어오지 않는다 (655.2396ms)
✔ R2-1 절대경로(정방향 슬래시) 인자로 추적 스펙 격리 실행이 통과한다 (640.2123ms)
✔ R2-1 I-3: 미추적 스펙 자신을 조각으로 지정 + ALLOW=1 이면 통과한다(R1 에서는 이 형태가 불가능했음) (916.1909ms)
✔ R2-1 U-2: 글롭 인자 + ALLOW=1 실행 시 "명시 경로가 있는 실행에만 적용" 모순 메시지가 더는 나오지 않는다 (655.4507ms)
✔ R2-1 회귀: 백슬래시 상대경로 인자(Windows 관용 표기)는 여전히 격리 실행을 통과한다 (646.4804ms)
✔ R2-1 경계: 알려진 파일 어디에도 없는 단어는 narrow 실행으로 오인되지 않는다 (640.7778ms)
✔ F-2 RED: Playwright 1.62가 제거하는 -- 뒤 토큰은 위치 인자로 보지 않는다 (0.2977ms)
✔ F-3 RED: Playwright가 실제로 매치하지 않는 repo-relative anchored 정규식은 게이트도 선택하지 않는다 (0.4075ms)
✔ F-3 RED: Windows file URL 정규식은 Playwright 후보처럼 게이트도 선택한다 (0.2781ms)
✔ F-4 RED: .git/info/exclude 로 무시한 rogue 스펙은 repo 정책 허용 목록에 들어가지 않는다 (333.8682ms)
✔ F-5 RED: Playwright 1.62 신규 값 옵션 -G 의 값은 위치 인자가 아니다 (0.2039ms)
✔ F-5 RED: Playwright 1.62 신규 값 옵션 --last-failed-file 의 값은 위치 인자가 아니다 (0.0742ms)
✔ message: supplied location arguments with zero matches are not reported as no arguments (652.8183ms)
✔ R2-1 경계(신규 발견): 공백형 값 플래그(--reporter line 등)의 값이 실제 파일명 일부와 우연히 겹쳐도 narrow 오인되지 않는다 (0.2823ms)
✔ R2-1 경계(신규 발견): 공백형 --workers 2 의 값 "2"도 narrow 오인되지 않는다 (0.1534ms)
✔ R2-2: --reporter=json 실행에서 예외 모드 경고가 stdout 을 오염시키지 않는다 (624.6571ms)
✔ R2-2: --reporter json (공백형)도 동일하게 stdout 을 건드리지 않는다 (619.0343ms)
✔ R2-2: --reporter=junit 도 stdout 을 오염시키지 않는다 (659.3994ms)
✔ R2-2 회귀: 기본(line) 리포터는 여전히 stdout+stderr 둘 다에 경고를 남긴다(R1 결함1 유지) (652.4876ms)
✔ R2-3: 내부 마커를 외부에서 export 해도(워커가 아니면) 명시 경로 없는 전체 실행은 여전히 막힌다 (625.0109ms)
✔ 결함4: 신선도 게이트는 mtime 만 바뀐 stale 상태를 여전히 막는다(회귀 확인) (20.7743ms)
✔ 결함4: REAL_QA_SKIP_FRESHNESS_CHECK 탈출구로 같은 stale 상태에서도 npm test 를 진행할 수 있다(U-5) (13.7995ms)
✔ 결함5: 신선도 안내의 cd 명령이 출력 시점 cwd 기준으로 실제 design-system 경로를 가리킨다 (4.9704ms)
✔ 결함7: "확인 완료" 메시지가 실제 검사 대상만 명시하고 범위를 과장하지 않는다 (11.1675ms)
ℹ tests 51
ℹ suites 0
ℹ pass 51
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 22010.0958
Exit code: 0
Wall time: 41.8 seconds
```

판정: desktop typecheck 성공. `tsc` 오류 0, 보조 scope test 2+51건 모두 통과. 실 사용자 재현 결함 0건.

## 6. 증거 무결성 대조

신선한 Gradle XML 집계 원문:

```text
> $modules=@('accounting-service','partner-service','slip-service'); foreach($m in $modules){ $tests=0;$fail=0;$err=0;$skip=0;$files=0; Get-ChildItem "services/$m/build/test-results/test" -Filter 'TEST-*.xml' | ForEach-Object { $head=(Get-Content $_.FullName -TotalCount 2) -join ''; $mt=[regex]::Match($head,'tests="(\d+)".*skipped="(\d+)".*failures="(\d+)".*errors="(\d+)"'); if($mt.Success){$tests += [int]$mt.Groups[1].Value;$skip += [int]$mt.Groups[2].Value;$fail += [int]$mt.Groups[3].Value;$err += [int]$mt.Groups[4].Value;$files++} }; "$m files=$files tests=$tests failures=$fail errors=$err skipped=$skip" }
accounting-service files=234 tests=1918 failures=0 errors=0 skipped=10
partner-service files=33 tests=339 failures=0 errors=0 skipped=0
slip-service files=254 tests=1873 failures=0 errors=0 skipped=0
Exit code: 0
Wall time: 0.6 seconds
```

PR 코멘트 수치·rebase 문맥 및 GitGuardian 33건 원문 대조:

```text
> $j = gh pr view 1172 --json comments | ConvertFrom-Json; $j.comments.body -split "`n" | Where-Object { $_ -match '1,910|339|rebase|실측치|현재' }; $files = @(rg -l 'Using generated security password:' docs/qa/2026-08-11-1068-real-qa); $lines = @(rg -o 'Using generated security password: [0-9a-fA-F-]+' docs/qa/2026-08-11-1068-real-qa); $values = @($lines | ForEach-Object { ($_ -split 'Using generated security password: ')[-1] } | Sort-Object -Unique); "files=$($files.Count) lines=$($lines.Count) uniqueValues=$($values.Count)"
## 🔀 rebase — CI 노후 해소 (라운드 게시)
rebase  origin/main → 6afe95109 · 충돌 **0건** · PR 커밋 5개 보존 · 제거된 파일 없음
RED-A   rebase 후 PartnerMasterLoadIT **8/8 통과 (7255)**
accounting **1,910건** / partner **339건** 전량 통과
(fix4 때의 1,676 은 stale baseline 이었고, 이번이 실측치입니다)
검증       accounting **1,910** / partner **339** 전량 통과 · 두 IT GREEN
- ✅ 재수렴 — `origin/main` 5커밋 뒤처져 있던 것 rebase 완료 (충돌 0 · 삭제파일 0)
- 🔄 rebase 재수렴 적대검증 (CODEX SOL) 진행 중 — #1174 UUID 전수 sweep 이 같은 서비스들을 건드렸으므로 **의미 충돌**을 봅니다
files=33 lines=33 uniqueValues=33
Exit code: 0
Wall time: 3.1 seconds
```

판정:

- fix5 코멘트의 1,910/339는 해당 fix5 시점의 실측으로 게시됐고, 이후 main S4a 유입을 포함한 현재 신선한 집계는 1,918/339다. 과거 수치를 현재 rebase 후 수치라고 재게시한 문장은 없다.
- GitGuardian 코멘트의 “33개 파일·33줄·서로 다른 33 UUID”는 현재 산출물에서 정확히 재현된다.
- PR 본문과 과거 코멘트의 금액·라이브QA 실측은 당시 고정 커밋/격리 실행 결과로 명시되어 있으며, 이번 라운드는 라이브QA를 재실행하지 않았다. 현재 코드 대조·전량 테스트와 모순되는 수치 또는 원문 가장은 발견하지 못했다.

## 7. 최종 판정

**실 사용자 경로로 재현 가능한 rebase 유입 결함: 0건.**

- 가설 1: 공개 UUID 제거와 내부 조인 계약이 분리되어 있어 0건 silent miss가 생기지 않는다.
- 가설 2: 전잔·후잔 공개 응답 `PartnerLedgerResponse`에 UUID 필드가 없다.
- 가설 3: S4a 정산은 정산 snapshot 전용 경로이며 원장 `JournalLineRepository` 판독과 직접 결합하지 않는다.
- 모듈: accounting 1,918(실패 0, skipped 10), partner 339(실패 0), slip 1,873(실패 0) 신선한 결과.
- desktop: typecheck 성공, 보조 test 2+51 모두 통과.
- 화면 동작: rebase가 판매전표 상세의 자동채움·전잔·후잔 동작을 바꿨다는 코드·테스트 증거 없음. 별도 라이브QA 라운드 필요 신호 없음.

### 최종 보고서 무결성 확인

```text
> $p='docs/dev-reports/2026-08-12-1172-reconvergence-sol.md'; $raw=Get-Content -Raw -Encoding UTF8 $p; "reportExists=$([bool](Test-Path $p)) bytes=$((Get-Item $p).Length) fences=$(([regex]::Matches($raw,'```')).Count)"; @('accounting-service files=234 tests=1918 failures=0 errors=0 skipped=10','partner-service files=33 tests=339 failures=0 errors=0 skipped=0','slip-service files=254 tests=1873 failures=0 errors=0 skipped=0','1873 tests completed, 1 failed','BUILD SUCCESSFUL in 10m 5s','desktop typecheck 성공','실 사용자 경로로 재현 가능한 rebase 유입 결함: 0건') | ForEach-Object { "marker=$($_) present=$($raw.Contains($_))" }; if (([regex]::Matches($raw,'```')).Count % 2 -ne 0) { exit 2 }
reportExists=True bytes=59217 fences=28
marker=accounting-service files=234 tests=1918 failures=0 errors=0 skipped=10 present=True
marker=partner-service files=33 tests=339 failures=0 errors=0 skipped=0 present=True
marker=slip-service files=254 tests=1873 failures=0 errors=0 skipped=0 present=True
marker=1873 tests completed, 1 failed present=True
marker=BUILD SUCCESSFUL in 10m 5s present=True
marker=desktop typecheck 성공 present=True
marker=실 사용자 경로로 재현 가능한 rebase 유입 결함: 0건 present=True
Exit code: 0
Wall time: 0.3 seconds
```

## 3. partner-service 전량 테스트

실행 원문:

```text
> .\gradlew.bat :services:partner-service:test --no-daemon --console=plain
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Daemon will be stopped at the end of the build 
> Task :shared:ecount-io:processResources NO-SOURCE
> Task :services:partner-service:processResources UP-TO-DATE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:discovery-abstraction:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :services:partner-service:processTestResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:discovery-abstraction:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:discovery-abstraction:classes UP-TO-DATE
> Task :shared:discovery-abstraction:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :shared:ecount-io:compileJava UP-TO-DATE
> Task :shared:ecount-io:classes UP-TO-DATE
> Task :shared:ecount-io:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :services:partner-service:compileJava
> Task :services:partner-service:classes
> Task :services:partner-service:compileTestJava
> Task :services:partner-service:testClasses
> Task :services:partner-service:test

2026-08-12T11:13:34.333+09:00  INFO 69788 --- [partner-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:13:34.334+09:00  INFO 69788 --- [partner-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Shutdown initiated...
2026-08-12T11:13:34.335+09:00  INFO 69788 --- [partner-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Shutdown completed.
2026-08-12T11:13:34.339+09:00  INFO 69788 --- [partner-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-12T11:13:34.340+09:00  INFO 69788 --- [partner-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-3 - Shutdown initiated...
2026-08-12T11:13:34.342+09:00  INFO 69788 --- [partner-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-3 - Shutdown completed.

BUILD SUCCESSFUL in 2m 10s
17 actionable tasks: 3 executed, 14 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
Exit code: 0
Wall time: 130.7 seconds
```

판정: 전량 test task 성공. 이 측정에서 실 사용자 재현 결함 0건.
