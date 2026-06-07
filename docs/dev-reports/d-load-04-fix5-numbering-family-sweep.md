# D-LOAD-04 fix5 채번 동시성 계열 sweep

## 범위

- 검색 범위: `services/`
- 검색 축:
  - 업무번호: `estimateNo`, `orderNo`, `transferNo`, `slipNo`, `batchNo`, `taskCode`, `partnerCode`
  - 구현 패턴: `lastSeq`, `sequenceRepository`, `findAllBy...StartingWith`, `findMax...`, `countBy...Prefix`, `size()+1`, `pg_advisory_xact_lock`
  - 내부 버전 계열: `revisionNo`, `maxRevisionNo`, `findMaxRevision`, `countByEntityId`

## 전수 처분표

| 경로 | 채번 방식 | 동시성 안전 여부 | 처분 |
|---|---|---|---|
| `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipNumberService.java` | `slip_number_sequences` row `last_seq+1` | 안전 | fix4 적용 상태 유지. `insertIfAbsent` + `PESSIMISTIC_WRITE` row lock. |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java` | `SlipNumberService.next(..., OUTBOUND)` 경유 | 안전 | 공용 SlipNumberService 보호 공유. 별도 처분 없음. |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/mobile/service/MobilePartnerOrderService.java` | `SlipNumberService.next(..., OUTBOUND)` 경유 | 안전 | 공용 SlipNumberService 보호 공유. 별도 처분 없음. |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/service/ReceiptOcrParseService.java` | `SlipNumberService.next(..., INBOUND)` 경유 | 안전 | 공용 SlipNumberService 보호 공유. 별도 처분 없음. |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateToSlipConverter.java` | 견적→전표 전환 시 `SlipNumberService` 경유 | 안전 | 공용 SlipNumberService 보호 공유. 별도 처분 없음. |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateNumberService.java` | `estimate_number_sequences` row `last_seq+1` | 불안전 | fix5 적용. 최초 row `ON CONFLICT DO NOTHING`, 이후 `PESSIMISTIC_WRITE` lock 조회. 병렬 8 IT 추가. |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/mobile/service/MobileQuotationService.java` | `EstimateNumberService.next()` 경유 | fix 후 안전 | EstimateNumberService 보호 공유. |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java` | `EstimateNumberService.next()` 경유 | fix 후 안전 | EstimateNumberService 보호 공유. |
| `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java` | 날짜 prefix 목록 조회 후 `max+1`, `pg_advisory_xact_lock(hashtext(partner_order_seq_...))` | 안전 | 기존 advisory transaction lock 확인. 수정 없음. |
| `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderFromEstimateService.java` | 날짜 prefix 목록 조회 후 `max+1`, 동일 advisory lock | 안전 | 기존 advisory transaction lock 확인. 수정 없음. |
| `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockTransferService.java` | `findMaxSequenceByTransferNoPrefix(prefix)+1` | 불안전 | fix5 적용. `stock_transfer_seq_<prefix>` advisory transaction lock 후 max+1. 생성 병렬 8 IT 추가. |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskService.java` | 일자별 first-missing probe (`existsByTaskCode`) | 불안전 | fix5 적용. `dispatch_task_seq_<date>` advisory transaction lock 후 probe. 생성 병렬 8 IT 추가. |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/JournalNumberService.java` | `journal_number_sequences` row `last_seq+1` | 불안전 | fix5 적용. 최초 row `ON CONFLICT DO NOTHING`, 이후 `PESSIMISTIC_WRITE` lock 조회. 병렬 8 IT 추가. |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/TaxInvoiceNumberService.java` | `tax_invoice_number_sequences` row `last_seq+1` | 불안전 | fix5 적용. 최초 row `ON CONFLICT DO NOTHING`, 이후 `PESSIMISTIC_WRITE` lock 조회. 병렬 8 IT 추가. |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/TaxInvoiceBatchService.java` | `countByBatchNoPrefix(prefix)+1` | 불안전 | fix5 적용. `tax_invoice_batch_seq_<prefix>` advisory transaction lock 후 count+1. `previewWithRows` 병렬 8 IT 추가. |
| `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java` | `countByBatchNoPrefix(prefix)+1` | 불안전 | fix5 적용. `TaxInvoiceBatchService` 와 같은 lock key 사용. 동일 `tax_invoice_batches.batch_no` 계열 보호. |
| `services/partner-service/src/main/java/com/samhanair/logis/partner/seed/PartnerSeeder.java` | seed row 순번으로 `P-2026-%04d` 고정 생성 | 낮음 / 비대상 | 운영 create 채번 아님. seed idempotency + deterministic UUID. 쓰기 부하 경로 아님. |
| `services/partner-service/src/main/java/com/samhanair/logis/partner/seed/PartnerAttachmentSeeder.java` | seed 대상 partnerCode `P-2026-%04d` 참조 | 낮음 / 비대상 | 거래처코드 신규 채번 아님. 기존 seed partner lookup 용도. |
| `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/WarehouseService.java` | 창고코드 자동 생성 + unique 충돌 제한 재시도 | 안전 | 일자별 순번 아님. bounded retry 5회 확인. 수정 없음. |
| `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java` | inbound/outbound/recall slip marker 별 count/idempotent 부족분 생성 | 안전 | `lockInboundBatchKey` 등 advisory lock 확인. 공개번호 채번 아님. 수정 없음. |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/revision/service/SlipRevisionService.java` | slip 별 `maxRevisionNo+1` | 안전 / 별도 계열 | 내부 버전번호. unique 충돌 시 1회 재시도 후 409 처리. 공개 일자별 업무번호 아님. |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/revision/service/EstimateRevisionService.java` | estimate 별 `maxRevisionNo+1` | 안전 / 별도 계열 | 내부 버전번호. unique 충돌 시 1회 재시도 후 409 처리. 공개 일자별 업무번호 아님. |
| `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/revision/service/PartnerOrderRevisionService.java` | order 별 `findMaxRevisionNo+1` | 안전 / 별도 계열 | 내부 버전번호. `saveAndFlush` + 충돌 재시도 처리. 공개 일자별 업무번호 아님. |
| `services/partner-service/src/main/java/com/samhanair/logis/partner/revision/service/PartnerRevisionService.java` | partner 별 `maxRevisionNo+1` | 안전 / 별도 계열 | 내부 버전번호. 충돌 재시도 처리 확인. 공개 일자별 업무번호 아님. |
| `services/*/audit/*AuditLogService.java`, `services/*/realtime/*AuditLogRecorder.java` | entity 별 audit `max/count+1` 또는 domain revision counter | 낮음 / 비대상 | 화면 표시용 이력 revision. 공개 업무번호가 아니며 이번 D-LOAD-04 500 원인 계열과 분리. 별도 audit concurrency hardening 후보로만 기록. |

## 수정 요약

- sequence table 보유 계열: `EstimateNumberService`, `JournalNumberService`, `TaxInvoiceNumberService`
  - `insertIfAbsent(... ON CONFLICT DO NOTHING)` 추가
  - `findLocked...` + `PESSIMISTIC_WRITE` 추가
  - service `next()` 에서 locked load/create 사용
- sequence table 미보유 계열: `StockTransferService`, `DispatchTaskService`, `TaxInvoiceBatchService`, `HometaxExportService`
  - prefix 단위 `pg_advisory_xact_lock(hashtext(?))` 추가
  - 기존 unique index 는 최종 백업 유지
- 병렬 채번 IT 추가:
  - `EstimateNumberServiceIT`
  - `AccountingNumberServiceIT`
  - `StockTransferNumberServiceIT`
  - `DispatchTaskNumberServiceIT`
  - `TaxInvoiceBatchIT.batchNo_parallelPreview_returnsUniqueBatchNumbersForEveryCaller`

## 검증 메모

- Docker/git 실행 금지 조건 준수.
- 요청 검증 명령은 compile-only 로 시도했으나, 현재 Windows Gradle 환경이 빌드 시작 전 단계에서 차단됨.
  - wrapper 실행: `gradle-8.10.2-bin.zip.lck` 접근 거부
  - unpacked Gradle 직접 실행: `native-platform.dll.lock` 접근 거부
  - repo-local `GRADLE_USER_HOME`: Gradle Groovy DSL instrumentation temp file 삭제 실패
- 따라서 IT 실행은 PM 대행 필요. 본 세션에서는 소스 수정과 compile-only 시도 로그까지만 확보.
