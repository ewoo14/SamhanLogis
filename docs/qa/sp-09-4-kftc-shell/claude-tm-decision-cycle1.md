# SP-09-4 KFTC 오픈뱅킹 — TM 종합 결정 (Claude cycle 1)

**브랜치**: feat/sp-09-4-kftc-shell (commit dee1f20c)  
**작성**: Claude TM (기술 매니저)  
**날짜**: 2026-05-18  
**리뷰어**: Claude BE / FE / Designer / QA / DevOps (5-agent 병렬)

---

## TM 결정: **cycle 2 권고 (BLOCK — CRITICAL 2건 수정 후 재리뷰)**

PR 머지 **보류**. 아래 CRITICAL 2건 수정 후 cycle 2 진입.

---

## 전체 결함 요약

| ID | 심각도 | 섹션 | 항목 | 상태 |
|---|---|---|---|---|
| BE-01 / DO-01 | CRITICAL | BE + DevOps | V11 Flyway 파일명 중복 — CI FAIL 확정 | MUST FIX |
| FE-02 / DS-01 | HIGH | FE + Designer | summary 섹션 `role="status"` 미구현 + 에러 배너 `aria-live` 누락 | MUST FIX |
| BE-03 | HIGH | BE | `status.name().equals("MATCHED")` — enum 직접 비교로 변경 | MUST FIX |
| FE-01 | HIGH | FE | mock.ts 주석 `journalDraftId?` 포함 — UUID 노출 암시 제거 | MUST FIX |
| QA-01 | HIGH | QA | case 9 Mockito stub 순서 오류 — `anyString()` lenient 먼저 등록 | MUST FIX |
| DS-03 / DS-02 | MEDIUM | Designer | monospace font 미적용 + SummaryBadge font-size 불일치 | SHOULD FIX |
| DS-04 | MEDIUM | Designer | Aligo 전용 CSS 토큰 미존재 — 4색 체계 불균형 | SHOULD FIX |
| BE-04 | MEDIUM | BE | effectiveMethod 이중 계산 제거 | SHOULD FIX |
| BE-05 | MEDIUM | BE | T3 Playwright PastOrPresent 날짜 충돌 명확화 | SHOULD FIX |
| FE-03 | MEDIUM | FE | 에러 배너 `aria-live="assertive"` + `aria-atomic="true"` 추가 | SHOULD FIX |
| FE-08 | MEDIUM | FE | mock.ts 2번째 결과 MATCHED + taxInvoiceNo null 불일치 | SHOULD FIX |
| DO-03 | MEDIUM | DevOps | check-credential-plaintext.sh 화이트리스트 SP-09-4 추가 | SHOULD FIX |
| QA-03 | MEDIUM | QA | T3 날짜 시나리오 문서화 명확화 | SHOULD FIX |
| BE-06 | LOW | BE | isPlaceholderKey() equals → contains 강화 | CONSIDER |
| DS-05 | LOW | Designer | HTML mock CSS variable reference 확인 | CONSIDER |
| QA-02 | WARN | QA | T4 RED dev-report Phase 11 issue 번호 연결 | CONSIDER |
| DO-05 | LOW | DevOps | KFTC_BASE_URL Phase 11 전환 TODO 주석 | CONSIDER |

---

## CRITICAL 결함 상세 (block 사유)

### [CRITICAL-1] V11 Flyway 파일명 중복 (BE-01 = DO-01)

```
services/accounting-service/src/main/resources/db/migration/
  V11__add_kftc_deposit_source_type_comment.sql    ← SP-09-4 신규 추가
  V11__add_tax_invoice_issuance_fields.sql         ← 기존 (이전 슬라이스)
```

**영향:** 모든 환경 (로컬 PostgreSQL / CI Testcontainers / 운영) 에서 Flyway 시작 즉시 오류.  
`Found more than one migration with version 11` 예외로 서비스 기동 불가.

**수정 방법:**
```bash
# 현재 최고 버전: V16
# 신규 파일 → V17 으로 renaming
git mv services/accounting-service/src/main/resources/db/migration/V11__add_kftc_deposit_source_type_comment.sql \
        services/accounting-service/src/main/resources/db/migration/V17__add_kftc_deposit_source_type_comment.sql
```

---

### [CRITICAL-2 등급: HIGH] role="status" 미구현 + aria-live 누락 (FE-02/DS-01/FE-03)

decisions.md §5 에 명시된 접근성 요건이 FE 구현에 반영되지 않음.

```jsx
// 수정 필요
<section data-testid="deposit-match-summary" aria-label="입금 매칭 요약">
// 수정 후
<section data-testid="deposit-match-summary" role="status" aria-label="입금 매칭 요약"
         aria-live="polite" aria-atomic="true">

// 에러 배너 수정
<div role="alert" data-testid="deposit-match-error"
     aria-live="assertive" aria-atomic="true">
```

WCAG 2.1 Level AA 요건 및 사내 design-system decisions 문서 위반.

---

### [MUST FIX] enum 직접 비교 (BE-03)

```java
// 수정 전
.filter(r -> r.status().name().equals("MATCHED"))
// 수정 후
.filter(r -> r.status() == DepositMatchStatus.MATCHED)
```

DepositMatchStatus 상수명 리팩터링 시 컴파일 타임 오류가 발생하지 않는 패턴. 도메인 메서드 원칙 위반.

---

### [MUST FIX] mock.ts journalDraftId 주석 (FE-01)

```javascript
// 수정 전 (mock.ts L4043)
// results[].fields: depositorName / amount / transactionDate / matchedPartnerCode? / matchedTaxInvoiceNo? / journalDraftId? / status
// 수정 후
// results[].fields: depositorName / amount / transactionDate / matchedPartnerCode? / matchedTaxInvoiceNo? / status
// (journalDraftId 는 BE 내부용 — FE 응답 및 화면 미노출, UUID 비공개 원칙)
```

---

### [MUST FIX] Mockito stub 순서 (QA-01)

```java
// 수정 전
when(partnerLookupClient.findByPartnerCode("(주)삼성상사")).thenReturn(Optional.of(...));
lenient().when(partnerLookupClient.findByPartnerCode(anyString())).thenReturn(Optional.empty());

// 수정 후
lenient().when(partnerLookupClient.findByPartnerCode(anyString())).thenReturn(Optional.empty());
when(partnerLookupClient.findByPartnerCode("(주)삼성상사")).thenReturn(Optional.of(...));
```

---

## SHOULD FIX 항목 정리 (cycle 2 포함 권장)

| 항목 | 수정 내용 | 담당 |
|---|---|---|
| DS-03 / DS-02 | SummaryBadge font-size 32px, monospace font-family 적용 | FE |
| DS-04 | `--color-aligo-*` 6종 tokens.css + index.ts 추가 | Designer |
| BE-04 | effectiveMethod 이중 계산 단일화 | BE |
| FE-08 | mock.ts 2번째 결과 MATCHED+nullInvoice → UNMATCHED | FE |
| DO-03 | check-credential-plaintext.sh 화이트리스트 sp-09-4 추가 | DevOps |
| QA-03 | T3 spec 에 FE 클라이언트 사이드 검증 범위 명확화 주석 | QA |

---

## PASS 항목 (변경 불필요)

| 항목 | 결과 |
|---|---|
| KftcClient interface 분리 + DRY_RUN/KFTC 분기 | PASS |
| REQUIRES_NEW audit 별도 bean (self-invocation 아님) | PASS |
| placeholder 4 키워드 런타임 차단 | PASS |
| UUID 비공개 (journalDraftId FE 응답 미포함) | PASS |
| 한국어 Javadoc 전체 작성 | PASS |
| 권한 ACCOUNTANT/MANAGER/MASTER 격리 IT 검증 | PASS |
| 422/502 HTTP status 정확 | PASS |
| @MockBean 격리 6개 external client | PASS |
| PATTERN_KFTC 스캐너 정확성 | PASS |
| env-template 3개 민감 키 빈 값 유지 | PASS |
| T1~T3 Playwright testid 1:1 일치 | PASS |
| KFTC 토큰 6종 CSS + index.ts 등록 | PASS |
| WCAG AA 이상 대비비 (kftc-text / kftc-50) | PASS |
| T4 RED Phase 11 미구현 의도 명시 | PASS |
| false green 패턴 (`|| true` / `test.skip(!ok)`) 없음 | PASS |
| HashRouter URL 정합 | PASS |
| DRY_RUN 고정 + Phase 11 안내 배너 | PASS |

---

## cycle 2 조건

BE agent 가 아래 수정 후 commit 하면 cycle 2 진입:

1. `V11__add_kftc_deposit_source_type_comment.sql` → `V17__` renaming
2. `DepositMatchController.java` enum 직접 비교 수정
3. `DepositMatchShellIT.java` case 9 stub 순서 수정
4. `mock.ts` L4043 주석 `journalDraftId?` 제거
5. `DepositMatchPage.tsx` summary `role="status"` + 에러 배너 `aria-live` 추가

SHOULD FIX 항목들(DS-03/DS-04/BE-04/FE-08/DO-03/QA-03)은 cycle 2 리뷰 전 포함 권장.

---

## 현 슬라이스 완성도 평가

| 구분 | 평가 |
|---|---|
| BE 아키텍처 | 85% (V11 충돌 + enum 비교 수정 후 95%) |
| FE 구현 | 80% (UUID 주석 + 접근성 수정 후 90%) |
| Designer 토큰 | 85% (Aligo 토큰 + font 수정 후 95%) |
| QA 커버리지 | 85% (stub 순서 + T3 명확화 후 93%) |
| DevOps 보안 | 90% (V11 + 화이트리스트 수정 후 98%) |

**종합: cycle 2 수정 후 머지 가능 수준.**
