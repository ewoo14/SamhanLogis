# MIG-16 BE Minor 백로그 청소 — 설계 (Design Spec)

> 작성일: 2026-05-21
> branch: `spec/2026-05-21-mig-16-be-minor-cleanup`
> 입력: MIG-14 사후 5-agent + Codex review 백로그

---

## 1. 개요

MIG-15 머지 후 PM 자율 연속 진행 (F → G → E → J → H → I) — **F BE Minor 청소**.

- baseline: MIG-1~15 모두 머지
- 옵션 C 21단계 ([feedback_cycle_n2_mandatory])

---

## 2. 청소 항목

### 2.1 partnerNames N+1 lookup (MIG-14 BE-MIN-3)
- `AccountingAdminQueryService.java:312-320` — 페이지 행마다 PartnerLookupClient.findByPartnerId 1회 호출 (50행 = 50 HTTP)
- **fix**: partner-service `/internal/partners/lookup-by-ids` batch endpoint 신규 + Service 의 batch 호출 패턴 (1 HTTP)

### 2.2 AGING 500 hard cap (MIG-14 BE-MIN-4)
- `AccountingAdminQueryService.java:124-143` — AGING_LIMIT=500 정적 cap
- **fix**: 페이지네이션 도입 (page/size 파라미터) + AccountingAdminQueryController 의 `/aging-snapshot` endpoint 갱신

### 2.3 PartnerAgingSnapshot refresh 토스트 (MIG-14 FE-MIN-3)
- `PartnerAgingSnapshotPage.tsx` — refresh 성공/실패 토스트 부재 (사용자 인지 어려움)
- **fix**: react-hot-toast 또는 기존 toast 컴포넌트로 성공 ("새로고침 완료") / 실패 토스트

### 2.4 Permission 캐시 로딩 flash 회피 (MIG-14 FE-MIN-1)
- `AppLayout.tsx:224-236` — dynamicCanAccess 가 캐시 미로드 시 true 반환 → admin 메뉴 6건 flash
- **fix**: 권한 로딩 중에는 admin 메뉴 hidden (skeleton loader 또는 빈 영역)

---

## 3. 산출 예정 (15~25 file, 약 400~600 LOC)

| 영역 | 변경 |
|---|---|
| partner-service | `/internal/partners/lookup-by-ids` batch endpoint 신규 + PartnerInternalController IT |
| accounting-service | AccountingAdminQueryService batch partner lookup + AGING pagination |
| AccountingAdminQueryController | /aging-snapshot page/size 파라미터 + Pageable 타입 |
| clients/desktop | PartnerAgingSnapshotPage refresh 토스트 + AppLayout 권한 로딩 처리 |
| dev-report + DECISIONS | D-MIG-16-01~04 |

---

## 4. 결정 (D-MIG-16-XX)

- D-MIG-16-01 partner-service `/internal/partners/lookup-by-ids` batch endpoint (UUID[] → Map<id,name>)
- D-MIG-16-02 AccountingAdminQueryService 의 partnerNames N+1 → 1 batch HTTP
- D-MIG-16-03 AGING_LIMIT=500 → Pageable page/size (기본 100, 최대 500)
- D-MIG-16-04 PartnerAgingSnapshotPage refresh 토스트 (성공 + 실패)
- D-MIG-16-05 AppLayout 권한 로딩 중 admin 메뉴 hidden (캐시 false 반환 패턴 SP-D 일관성 변경)
- D-MIG-16-06 PM 자율 연속 + 옵션 C 21단계

---

🤖 PM Claude (Opus 4.7) — 2026-05-21 자율 연속
