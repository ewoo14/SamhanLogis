# SP-09-3 OCR Receipt Shell — QA Review (Claude, Cycle 1)

> 브랜치: `feat/sp-09-3-ocr-receipt-shell` commit `b0428441`
> 리뷰 날짜: 2026-05-18
> 리뷰어: Claude QA Agent

---

## SP-09-2 cycle 1 회귀 가드 체크 (false green 방지)

| 금지 패턴 | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| `\|\| true` shortcut | PASS | PASS | PASS | PASS | PASS |
| `test.skip(!ok)` — skip 대신 FAIL | PASS | PASS | PASS | PASS | PASS |
| `page.setContent()` fallback | PASS | PASS | PASS | PASS | PASS |
| bodyText OR fallback 남용 | WARN | PASS | PASS | PASS | PASS |

---

## 검증 항목 체크리스트

| # | 검증 항목 | 결과 | 비고 |
|---|---|---|---|
| Q1 | T1~T5 서버 미가용 시 FAIL (false green 방지) | PASS | beforeEach에서 `expect(ok).toBe(true)` — skip 아닌 FAIL |
| Q2 | data-testid 실 구현 일치 확인 | PASS | receipt-ocr-drop-zone/file-input/submit-btn/result/slip-badge/slip-link/error 모두 일치 |
| Q3 | URL HashRouter 정합 — /purchases/receipt-ocr | PASS | Playwright URL `/#/purchases/receipt-ocr?mockRole=WAREHOUSE` 사용 |
| Q4 | test.step 분리 (각 단계 명시) | PASS | 모든 TC에서 await test.step(...) 분리 적용 |
| Q5 | T2 UUID 비공개 — DOM 텍스트 UUID 미노출 | PASS | createTreeWalker 기반 UUID regex 스캔 적용 |
| Q6 | T3 10MB FE 클라이언트 reject 검증 | PASS | 11MB fixture 파일 생성 + acceptFile 즉시 에러 확인 |
| Q7 | T4 PDF 비지원 포맷 FE reject 검증 | PASS | .pdf fixture + acceptFile 확장자 검증 확인 |
| Q8 | T5 권한 가드 WAREHOUSE/MANAGER/MASTER 허용 | PASS | 3개 역할 모두 drop-zone toBeVisible 검증 |
| Q9 | T5 SALES/ACCOUNTANT 차단 확인 | WARN | 차단 조건이 OR 체인 — drop-zone 미표시 OR bodyText 키워드 포함으로 약한 assertion |
| Q10 | IT Case 1~8 커버리지 | PASS | 8케이스 모두 작성 완료 |
| Q11 | IT @MockBean ReceiptOcrClient 격리 | PASS | ReceiptOcrClient + 7개 외부 client 모두 @MockBean |
| Q12 | IT Case 8 REQUIRES_NEW 오염 격리 | FAIL | @Transactional IT + REQUIRES_NEW 커밋 row 잔류 가능성 미대응 |
| Q13 | T1 bodyText 기반 DRY_RUN 안내 검증 | WARN | bodyText 전체 텍스트 검색 — 실 data-testid 기반 검증 아님 |
| Q14 | dev-report IT 커버리지 표 | PASS | sp-09-3-ocr-receipt-shell.md §4 에 8건 모두 기록 |
| Q15 | BE IT 예상 결과 문서화 | PASS | dev-report §4 각 케이스별 결과 기재 |

---

## 결함 목록

### CRITICAL

없음.

### HIGH

#### H1 — Case 8 @Transactional IT + REQUIRES_NEW audit row 잔류 — 격리 미보장

**파일**: `ReceiptOcrShellIT.java` L67, L325~331

```java
@SpringBootTest
@Transactional              // 테스트 후 rollback
class ReceiptOcrShellIT extends AbstractPostgresIT {
    ...
    // Case 8
    var auditLogs = auditLogRepository.findAll().stream()
            .filter(a -> slipId.equals(a.getSlipId()))
            .toList();
    assertThat(auditLogs).isNotEmpty();
```

`Propagation.REQUIRES_NEW` 로 커밋된 audit row는 테스트 rollback 대상이 아니다.
Testcontainers 재사용 모드나 여러 테스트 반복 실행 시 이전 audit row가 findAll 에 포함되어
케이스 혼란 가능. 더 심각하게는 slipId 기반 필터가 테스트마다 새 ACTOR_ID UUID를 생성하므로
이론적으로는 고립되지만, `findAll()` 이 대용량 데이터에서 느려지거나 DB OOM이 될 수 있다.

**권장 fix**:
```java
@BeforeEach
void cleanupAuditLogs() {
    auditLogRepository.deleteAll();
}
```
또는 Case 8 을 `@Transactional` 없이 별도 클래스로 분리하고 `@AfterEach` cleanup 적용.

---

### MEDIUM

#### M1 — T1 bodyText OR 기반 assertion — 실 렌더 검증 부족

**파일**: `sp-09-3-ocr-receipt-shell.spec.ts` L197~205

```typescript
const hasDryRunNotice =
  bodyText.includes('DRY_RUN') ||
  bodyText.includes('처리 방식')

expect(hasDryRunNotice, ...).toBe(true)
```

bodyText 전체 스캔은 script 태그 내 문자열도 포함할 수 있어 실제 UI 렌더 여부를 보장하지 않는다.
특히 source code comment 에 "DRY_RUN" 문자열이 있으면 false positive.

**권장 fix**: data-testid 또는 구체적 selector 기반 toBeVisible + textContent 조합.
```typescript
const dryRunSection = page.locator('[data-testid="receipt-ocr-dryrun-notice"]')
await expect(dryRunSection, 'DRY_RUN 안내 섹션 미표시').toBeVisible({ timeout: 5000 })
```
(이를 위해 PurchaseSlipOcrUploadPage.tsx 에 `data-testid="receipt-ocr-dryrun-notice"` 추가 필요)

#### M2 — T5 권한 차단 조건 — drop-zone 미표시 OR bodyText 키워드 조합으로 약한 단언

**파일**: `sp-09-3-ocr-receipt-shell.spec.ts` L700~722

```typescript
const salesBlocked =
  !dropZoneVisible ||
  bodyText.includes('권한') || bodyText.includes('403') || ...

expect(salesBlocked, ...).toBe(true)
```

OR 조건이 매우 넓어 drop-zone이 표시되더라도 bodyText에 '권한' 문자열이 있으면 차단으로 판정.
예를 들어 "권한이 필요한 기능입니다" 안내 텍스트가 OCR 페이지 자체에 있으면 SALES 차단이 잘못 PASS 될 수 있다.

**권장 fix**: `!dropZoneVisible` 단독으로 단언 (RoleGuard가 drop-zone을 렌더하지 않는 것이 명확한 기준).

---

### LOW

#### L1 — T2 `page.waitForTimeout(2000)` 하드코딩 대기

**파일**: `sp-09-3-ocr-receipt-shell.spec.ts` L317

API mock 사용 시 응답 속도가 즉각적이므로 2000ms wait 는 불필요하게 느리다.
`await page.waitForSelector('[data-testid="receipt-ocr-result"]', { timeout: 5000 })` 로
이벤트 기반 wait 전환 권장.

#### L2 — fixture PNG 67바이트 — 실 이미지 아님

**파일**: `sp-09-3-ocr-receipt-shell.spec.ts` L294~298

최소 PNG (1x1px)를 hex에서 직접 생성. acceptFile 의 content-type 기반 검증을 우회하지 않으므로
기능적으로는 문제 없으나, 실제 OCR 파싱 TC에서 mock이 아닌 실 BE와 연동 시 빈 이미지로 실패.
Phase 11 sandbox IT 추가 시 realistic fixture 필요 — Phase 11 체크리스트에 추가 권장.

---

## IT 커버리지 평가

| 케이스 | 커버 여부 | 비고 |
|---|---|---|
| DRY_RUN 201 + slipNo | PASS | Case 1 |
| SALES 403 | PASS | Case 2 |
| 빈 파일 422 | PASS | Case 3 |
| 10MB 초과 422 | PASS | Case 4 |
| PDF 포맷 422 | PASS | Case 5 |
| CLOVA placeholder 502 | PASS | Case 6 |
| INBOUND DRAFT 상태 DB 확인 | PASS | Case 7 |
| audit log REQUIRES_NEW 기록 | PASS (WARN) | Case 8 — 격리 미보장 |
| CLOVA 성공 케이스 | MISS | Phase 11 예정 — 의도적 미구현 |
| submitMethod fallback (서버 property) | MISS | application.yml DRY_RUN 기본값 동작 미검증 |

---

## 종합

- **CRITICAL 0건, HIGH 1건, MEDIUM 2건, LOW 2건**
- H1 (REQUIRES_NEW audit IT 격리 미보장) 은 CI 반복 실행 환경에서 flaky 테스트 원인 가능 — cycle 2 fix 권장
- false green 패턴 (|| true / test.skip / page.setContent) 0건 — SP-09-2 회귀 가드 통과
- T5 권한 차단 assertion 강화 필요
