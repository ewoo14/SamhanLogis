# MIG-12 follow-up — V32 partial UNIQUE + Lookup auth 격상 — 설계 (Design Spec)

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-12-followup-tax-invoice-line-unique-lookup-auth`
> 입력: MIG-1~11 사후 재점검 (옵션 A 12단계 첫 적용) 결과 발견 결함

---

## 1. 개요

2026-05-21 사용자 명시 옵션 A (Codex fix → Claude verify) 적용 전 머지된 MIG-1~11 사후 재점검 결과 발견된 **MAJOR 1 + P1 1** follow-up.

- baseline: 이카운트 마이그레이션 시리즈 11 슬라이스 모두 머지 완료 (2026-05-20)
- 옵션 A 12단계 첫 적용 슬라이스

---

## 2. 결함 처리

### 🚨 MAJOR — V32 partial UNIQUE 마이그레이션

**문제**: `ux_tax_invoice_lines_invoice_line` UNIQUE INDEX 가 partial(WHERE is_deleted=FALSE) 없이 생성 → soft-delete 컨벤션 위반 → JPA TaxInvoiceService cancel + re-issue 워크플로우 차단.

**fix**: V32 Flyway DROP + RECREATE partial:
```sql
DROP INDEX IF EXISTS ux_tax_invoice_lines_invoice_line;
CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_invoice_lines_invoice_line_active
    ON tax_invoice_lines (tax_invoice_id, line_no)
    WHERE is_deleted = FALSE;
```

회귀 가드 IT (`TaxInvoiceLineSoftDeleteIT`):
- soft-deleted line 의 (invoice, line_no) 재발행 시 UNIQUE 충돌 X 검증
- active line 의 (invoice, line_no) 중복 시 UNIQUE 충돌 ✅ 검증

### P1 — Lookup auth 격상

**문제**: `ProductLookupClient` (inventory-service) + `PartnerLookupClient` (accounting-service) 가 401/403 응답을 `Optional.empty()` 로 silent 처리 → token mis-config 시 모든 lookup 이 `*_LOOKUP_MISS` 로 가려짐 → 운영자 인지 어려움.

**fix**:
- 401/403 → `BusinessException(MIG12_INTERNAL_AUTH_MISS)` throw (fail-fast)
- 404 / 200 빈 결과 → 기존 `Optional.empty()` 유지 (정상 lookup miss)
- 5xx / IOException → 기존 처리 유지

`ErrorCode.MIG12_INTERNAL_AUTH_MISS(SERVICE_UNAVAILABLE, "내부 서비스 인증 실패 — X-Internal-Token 설정 확인 필요")` 신규.

---

## 3. 산출 예정 (10~15 file, 약 0.5~1K LOC)

| 영역 | Flyway | 신규 |
|---|---|---|
| accounting-service | V32 | `ux_tax_invoice_lines_invoice_line` DROP + partial RECREATE + 회귀 IT |
| accounting-service | — | `PartnerLookupClient` 401/403 격상 + 단위 테스트 |
| inventory-service | — | `ProductLookupClient` 401/403 격상 + 단위 테스트 |
| shared/common | — | ErrorCode `MIG12_INTERNAL_AUTH_MISS` 1종 신규 |

---

## 4. 결정 (D-MIG-12-XX)

- D-MIG-12-01 follow-up 통합 PR (V32 + Lookup auth 격상)
- D-MIG-12-02 V32 = DROP + CREATE partial UNIQUE (PG `IF NOT EXISTS` 가드)
- D-MIG-12-03 token mis-config = `SERVICE_UNAVAILABLE(503)` (운영자 인지 용이)
- D-MIG-12-04 ErrorCode MIG12 1종 (최소)
- D-MIG-12-05 PageCode 추가 X (기존 endpoint 재사용)
- D-MIG-12-06 PM 자율 연속 진행 + 옵션 A 12단계 첫 적용
- D-MIG-12-07 회귀 IT `TaxInvoiceLineSoftDeleteIT` + LookupClient 단위 테스트 4 cases (token null/blank/401/403)

---

## 5. 옵션 A 12단계 적용 (신규)

```
1.  Claude 5-agent 병렬 review
2.  TM Claude 통합 PR comment 즉시
3.  Claude fix
4.  commit + push
5.  Codex 5-section review
6.  TM Codex 통합 PR comment 즉시
7.  Codex fix
8.  commit + push
9.  ✨ **Claude verify (BE + QA spot-check fix diff)** — 5-agent 전체 재실행 X
10. ✨ **MAJOR/P0 발견 시 1f Claude fix** (P1 이하 백로그)
11. 사이클 종료 조건: 잔존 결함 0 + CI watch PASS
12. PM 마지막 종합 + 자동 머지
```

---

🤖 PM Claude (Opus 4.7) — 2026-05-21 follow-up
