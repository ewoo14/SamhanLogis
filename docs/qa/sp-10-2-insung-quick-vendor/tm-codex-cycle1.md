# 🟢 Codex TM 5-Section Cross-Check Review — SP-10-2 Cycle 1

**HEAD**: `f82a5ad5`
**PR**: #245
**Claude 리뷰 cross-check**: [#issuecomment-4479408586](https://github.com/ewoo14/SamhanLogis/pull/245#issuecomment-4479408586)

## 종합 판정: **FIX 요청** — Claude 22건 valid + Codex 추가 P1 2건

### A. Claude 발견 평가 (22건 → 모두 valid)

| # | 영역 | 결함 | 평가 | 사유 (file:line) |
|---|---|---|---|---|
| P0-1 | BE | vendor_order_id 미저장 | ✅ valid | `InsungQuickDriverMatcher:65` / `Vehicle:130` / `InsungWebhookService:77` — externalRefId 만 채움, webhook lookup 단절 |
| P0-2 | CI/BE | IT unique constraint | ✅ valid | TC-1/2/4 같은 `LocalDate.now(), DAY` fixture: `InsungQuickIntegrationIT:155,181,248` |
| P0-3 | FE/QA | sandbox-banner testid | ✅ valid | FE `insung-sandbox-banner` (`DispatchDetailPage:377`), spec `sandbox-banner` (`:257,316`) |
| P0-4 | QA | detail route dispatch=null | ✅ valid | `routes/index.tsx:39-45` wrapper mock fetch 부재 |
| P1-1~6 | BE/Designer/DevOps | 상태 후퇴/HMAC 우회/wireframe testid/aria-live/CI paths | ✅ valid | 모두 anchoring 확인 |
| P2-1~12 | 각 영역 | 문서/testid/dark mode/잔재 | ✅ valid | 모두 anchoring 확인 |

### B. Codex 자체 추가 발견 (Claude 놓침)

**C-P1-1 — delivered webhook idempotency 깨짐**
> 재수신 시 기존 signature 확인 없이 매번 저장. class Javadoc 은 idempotent 주장하지만 `signatureRepository.save(sig)` 만 수행, unique constraint 없음.
> `InsungWebhookService.java:199-224` / `SignatureRepository.java:15` / `Signature.java:30`

**C-P1-2 — nullable webhook payload 500 유발 가능**
> service 는 blank `vendorOrderId` skip 하지만 controller 응답이 `Map.of(..., req.vendorOrderId())` — null 시 NPE. `@Valid` 검증도 없음.
> `ArologisInternalController.java:168, 174, 199, 205, 229, 235`

### C. Cycle 2 fix 권장 우선순위

**P0 (M)** — `vendorOrderId` Vehicle 저장 + IT fixture date/type 분리 + sandbox testid 정합 + detail route data loading/mock 복구

**P1 (M~L)** — webhook 상태 가드 + HMAC raw-body 검증 / blank secret hard fail + CI paths 추가 + aria-live 상수 / signature idempotency 가드 (unique constraint 또는 findExisting) + nullable response 방어

**P2 (S~M)** — 문서/testid/contrast/env-template/error-code 정리

### D. 종합 판정

- **FIX 요청**
- 머지 차단 사유: 4 P0 + Codex 추가 2 P1 (운영 안정성)
- cycle 3 안 머지 가능성: **가능** (단 P0-1 + HMAC raw body 수정은 테스트 보강 없으면 재발 가능)

### E. 한국어 boundary 결과

- ✅ UUID 비공개: 화면 노출 위반 없음 (`driverCode`/`vendorOrderId` vendor 식별자)
- ✅ 한국어 commit: head `f82a5ad5` 본문 한국어 일관
- ✅ 도메인 명칭: `아로로지스`/`Samhan Public` 일관

---

**TM 결정: FIX 요청 → cycle 2 통합 fix → head B 재검**

Codex TM — 2026-05-19
