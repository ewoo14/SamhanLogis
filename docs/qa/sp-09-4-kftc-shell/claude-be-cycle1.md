# SP-09-4 KFTC 오픈뱅킹 — BE 리뷰 (Claude cycle 1)

**브랜치**: feat/sp-09-4-kftc-shell (commit dee1f20c)  
**작성**: Claude BE agent  
**날짜**: 2026-05-18

---

## 결함 분류 요약

| ID | 심각도 | 파일 | 항목 |
|---|---|---|---|
| BE-01 | CRITICAL | db/migration/ | V11 파일명 충돌 (V11__add_kftc_deposit_source_type_comment.sql + V11__add_tax_invoice_issuance_fields.sql) |
| BE-02 | HIGH | DepositMatchAuditRecorder.java | actorId.toString().substring(0,8) — UUID substring audit 기록 (내부 로그이나 UUID 비공개 원칙 회색 영역) |
| BE-03 | HIGH | DepositMatchController.java L80 | status.name().equals("MATCHED") — enum 직접 비교 대신 문자열 equals, 도메인 메서드 원칙 위반 가능성 |
| BE-04 | MEDIUM | DepositMatchService.java L115 | effectiveMethod fallback 이중 계산 — kftcClient 에는 원본 submitMethod 전달, audit 에만 fallback 적용: 의미 불일치 |
| BE-05 | MEDIUM | DepositFetchRequest.java | @PastOrPresent 제약: 2026-05-31 같은 미래 날짜 입력 시 400 반환 — T3 Playwright 시나리오와 충돌 가능성 |
| BE-06 | LOW | KftcClientImpl.java | isPlaceholderKey() — `contains()` 대신 `equals()` 사용: "test_key" 같은 변형 키 미차단 |
| BE-07 | WARN | JournalSourceType.java | Javadoc 기존 3개 값(SLIP/MANUAL/CLOSING) 문서 최신화 미반영 (KFTC_DEPOSIT 만 추가, 기존 설명 stale) |
| BE-08 | WARN | DepositMatchShellIT.java | SlipQueryClient @MockBean 누락 — ChatRoomMappingClient 는 격리됐으나 SlipQueryClient 별도 존재 여부 미확인 |

---

## 검증 항목별 PASS/FAIL/WARN

### 1. BaseEntity 7 audit + Soft Delete

**PASS**

- KftcDepositRecord: Java record (entity 아님 — audit 불필요, 올바름)
- DepositMatchAuditRecorder: AccountingAuditLog.record() 사용 — BaseEntity 7 audit 체계 활용
- 물리 삭제 코드 없음. markDeleted() 미호출 건도 없음 (신규 DRAFT Journal 은 생성만, soft delete 별도 필요 없음)

### 2. Soft Delete 일관성

**PASS**

- Journal.create() → JournalRepository.save() 경로. 삭제 로직 없음. 이슈 없음.

### 3. 도메인 메서드 chain

**WARN (BE-03)**

```java
// DepositMatchController.java L80
.filter(r -> r.status().name().equals("MATCHED"))
```

`DepositMatchStatus.MATCHED` 를 `status() == DepositMatchStatus.MATCHED` 로 직접 enum 비교해야 한다.  
`name().equals("MATCHED")` 는 enum 리팩터링(상수명 변경) 시 컴파일 시점 오류가 나지 않아 위험하다.  
메모리 가드 "도메인 메서드 원칙" 위반으로 볼 수 있음.

**권장 fix:**
```java
.filter(r -> r.status() == DepositMatchStatus.MATCHED)
```

### 4. REQUIRES_NEW audit — self-invocation 여부

**PASS**

- `DepositMatchAuditRecorder` 는 `@Service` 로 독립 Spring bean
- `DepositMatchService` 에 `@Autowired` 로 주입 (`private final DepositMatchAuditRecorder auditRecorder`)
- 동일 클래스 내 `@Transactional` self-invocation 패턴이 아님
- REQUIRES_NEW 별도 트랜잭션 정상 동작 확인

### 5. placeholder 4 키워드 case-insensitive 차단

**WARN (BE-06)**

```java
// KftcClientImpl.java
private boolean isPlaceholderKey(String key) {
    String lower = key.toLowerCase(Locale.ROOT);
    return lower.equals("placeholder_dev_only")
            || lower.equals("changeme")
            || lower.equals("dummy")
            || lower.equals("test");
}
```

현재 `equals()` 로 정확 일치만 차단. "test_key", "changeme_1234" 등 변형 패턴을 통과시킨다.  
`contains()` 또는 `startsWith()` 로 변경하면 더 강력하나, 과도한 차단(예: "testing-endpoint") 위험도 있음.  
현 슬라이스 범위(shell 단계)에서는 **WARN** 수준으로 유지하되 Phase 11 실 연동 전 강화 필요.

참고: SP-09-1 ETaxClientImpl 도 동일 `equals()` 패턴 사용 — 일관성은 유지됨.

### 6. 권한 SP-03 §4.2 (ACCOUNTANT/MANAGER/MASTER)

**PASS**

```java
@PreAuthorize("hasAnyRole('ACCOUNTANT', 'MANAGER', 'MASTER')")
```

IT에서 SALES/WAREHOUSE/DRIVER/DISPATCH 4개 역할 403 검증 완료 (case 2~5).

### 7. HTTP status 422/502

**PASS**

- `DEPOSIT_DATE_RANGE_INVALID` → `HttpStatus.UNPROCESSABLE_ENTITY` (422)
- `KFTC_SUBMIT_FAILED` → `HttpStatus.BAD_GATEWAY` (502)
- `INVALID_INPUT` → 기존 ErrorCode 재사용 (422)

IT case 6: `status().isUnprocessableEntity()` 422 검증  
IT case 8: `status().isBadGateway()` 502 검증

### 8. 한국어 Javadoc

**PASS**

- KftcClient.java: 인터페이스 + fetchDeposits() 메서드 한국어 Javadoc 완비
- KftcClientImpl.java: fetchDeposits() / fetchDryRun() / fetchKftc() / isPlaceholderKey() 전부
- DepositMatchService.java: 클래스 + fetchAndMatch() / matchAndCreateJournal() / findMatchingInvoice() / createJournalDraft()
- DepositMatchController.java: 클래스 + fetchAndMatch() / parseActorId()
- DepositMatchAuditRecorder.java: 클래스 + recordFetchAndMatch()

### 9. V11 Flyway 파일명 충돌 (BE-01 CRITICAL)

**FAIL**

```
V11__add_kftc_deposit_source_type_comment.sql   ← SP-09-4 신규
V11__add_tax_invoice_issuance_fields.sql        ← 기존 (SP-09-2 또는 이전)
```

동일 버전 번호 V11 이 2개 존재. Flyway 는 체크섬 기반으로 이 중 하나를 무시하거나 `FlywayException: Found more than one migration with version 11` 오류를 발생시킨다.  
**CI/운영 환경에서 반드시 FAIL**한다.

**권장 fix:**  
기존 V11 번호를 확인하여 신규 SP-09-4 마이그레이션을 V17 이상으로 renaming.  
(V16__tax_invoice_etax_external_id_unique.sql 이 현재 최고 번호 → V17 사용)

```sql
-- 변경 전
V11__add_kftc_deposit_source_type_comment.sql
-- 변경 후
V17__add_kftc_deposit_source_type_comment.sql
```

### 10. effectiveMethod 이중 계산 (BE-04)

**WARN**

`kftcClient.fetchDeposits(from, to, accountFinNo, submitMethod)` 에는 원본 `submitMethod` (null 가능)를 전달하고,  
audit 기록 시에만 `effectiveMethod = (submitMethod != null && !submitMethod.isBlank()) ? submitMethod : "DRY_RUN"` 로 fallback 계산.

이 계산은 `KftcClientImpl.fetchDeposits()` 내부에서도 동일하게 수행된다.  
audit에 기록되는 `effectiveMethod` 가 실제 KftcClient 가 사용한 method 와 의미상 일치하지만,  
중복 계산으로 인해 `defaultSubmitMethod` property 값이 "DRY_RUN" 이 아닌 경우 불일치 발생 가능.

**권장 fix:**  
`KftcClient.fetchDeposits()` 가 사용한 실제 method 를 반환값에 포함하거나,  
`DepositMatchService` 가 동일 fallback 로직을 단일 위치에서 계산 후 공유.

### 11. @PastOrPresent + T3 날짜 충돌 (BE-05)

**WARN**

`DepositFetchRequest.from` / `to` 에 `@PastOrPresent` 제약 적용.  
IT case 6에서는 `from=2026-05-10`, `to=2026-05-01` (모두 과거) → 문제 없음.  
T3 Playwright 에서는 `fromInput.fill('2026-05-31')` — 2026-05-18 기준 미래 날짜.  
`@PastOrPresent` 가 `from > to` 에 앞서 400 을 반환할 수 있어 T3 422 DEPOSIT_DATE_RANGE_INVALID 검증이 실패할 수 있음.

T3 는 FE 클라이언트 사이드 validation (from > to → FE setFormError) 도 있어 실제로 API 호출이 일어나지 않을 수 있음.  
단, T3 스펙 주석에 "FE 클라이언트 사이드 — from > to 시 즉시 한국어 에러 표시"라고 명시되어 있어 T3 자체는 통과할 수도 있음.

BE 측 `@PastOrPresent` 와 FE T3 시나리오 간 문서화 명확화 필요.

---

## 권장 fix 우선순위

1. **[MUST FIX]** BE-01: V11 파일명 충돌 → V17 renaming
2. **[SHOULD FIX]** BE-03: `status.name().equals()` → `status() == MATCHED` enum 직접 비교
3. **[SHOULD FIX]** BE-04: effectiveMethod 이중 계산 제거
4. **[CONSIDER]** BE-05: T3 날짜 범위 명확화 (Playwright 주석 또는 BE @PastOrPresent 범위 조정)
5. **[CONSIDER]** BE-06: isPlaceholderKey() `contains()` 강화 (Phase 11 전 완료 권장)
6. **[COSMETIC]** BE-07: JournalSourceType 기존 Javadoc 최신화

---

## 총평

핵심 아키텍처(KftcClient interface 분리 / REQUIRES_NEW audit 별도 bean / placeholder 차단 / UUID 비공개)는 SP-09-1~3 패턴을 충실히 답습하여 구조적으로 양호하다.  
단, V11 Flyway 충돌(BE-01)은 **CI 즉시 FAIL** 수준이므로 머지 전 반드시 수정해야 한다.  
BE-03 enum 비교 패턴도 안전성을 위해 수정 권장.
