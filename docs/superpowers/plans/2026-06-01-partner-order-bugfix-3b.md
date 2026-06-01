# partner-order 버그 정리 (item 3-B) Implementation Plan

> Codex 구현([[feedback_codex_implements_claude_reviews]]). Claude 기획·리뷰. B1 은 **재현 IT 우선**(real Testcontainers, CI 검증).

**Goal:** partner-order `/revisions` 500(스냅샷 역직렬화 견고화) + `PartnerOrderDetailResponse` discountInfo 노출(D2 충돌헤더 BE 갭) 수정.

**배경:** D2/2.6d 후속 비차단 백로그. `/revisions` 500 은 QA 발견(서비스 존재, 특정 데이터 조건). discountInfo 는 D2 병합 충돌헤더 dialog 가 주문 상세에서 읽어야 하나 응답에 부재.

---

## Task B1: `/revisions` 500 — 스냅샷 역직렬화 견고화

**진단 (Claude):** `PartnerOrderRevisionService.listWithSummary` → `deserialize(revision.getSnapshot())` 가 `JsonProcessingException` 시 명시적 `ResponseStatusException(500)`. `PartnerOrderSnapshot` record 에 `@JsonIgnoreProperties(ignoreUnknown=true)` 없음. RestoreIT(#320)는 현재 스키마로 스냅샷을 만들어 통과 → 실제 500 은 **저장된 구 스냅샷의 스키마 진화**(제거/이름변경된 enum 값, 필드 타입 변경, unknown 필드) 트리거 추정.

**Files:**
- Test: `services/partner-order-service/src/test/java/.../revision/.../PartnerOrderRevisionListResilienceIT.java` (신규, CI-covered = partner-order 모듈 전체 실행)
- Modify: `revision/snapshot/PartnerOrderSnapshot.java` (+ 중첩 라인/스냅샷 타입) / `revision/service/PartnerOrderRevisionService.java` (deserialize/summarize)

- [ ] **Step 1: 재현 IT (실패 먼저)** — partner_order + revision 을 저장하되 **snapshot JSON 을 의도적으로 진화**시킨 케이스로 `GET /revisions`(또는 listWithSummary) 호출 → 현재 500 재현. 후보 3종 중 실제 트리거 확인: ① unknown 필드 추가 ② 알 수 없는 enum 값(예: status/revisionType 의 폐기 값) ③ 타입 불일치. **어떤 게 실제 500 인지 IT 로 확정**(Boot 기본 ObjectMapper 는 unknown-property 관용 → ②/③ 가능성 높음).
- [ ] **Step 2: 견고화** — 확정된 실패 모드에 맞춰: `@JsonIgnoreProperties(ignoreUnknown=true)`(스냅샷 + 중첩) + 알 수 없는 enum 관용(`DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_AS_NULL` 또는 전용 ObjectMapper) + `summarize` null-safe. 단, **역직렬화 실패가 정말 불가피한 경우(손상 데이터)** 는 500 대신 graceful(해당 revision 의 summary 만 비우고 목록은 반환) 처리 검토.
- [ ] **Step 3: 재현 IT 통과 + 회귀 0** (RestoreIT 등 기존 통과 유지). compile.
- [ ] **Step 4: Commit.**

## Task B2: `PartnerOrderDetailResponse` discountInfo 노출

**진단 (Claude):** `PartnerOrderDetailResponse`(record) 에 discountInfo 필드 부재. D2 병합 충돌헤더 dialog 가 주문별 discountInfo 를 비교/선택해야 하나 BE 미노출. PartnerOrderMergeConvertService 는 slip info 의 discountInfo 를 쓰지만 상세 응답엔 없음.

**Files:**
- Modify: `web/dto/PartnerOrderDetailResponse.java` + 매핑 위치(상세 조회 서비스) / (필요시) PartnerOrder 엔티티에서 discountInfo 출처 확인

- [ ] **Step 1: discountInfo 출처 확인** — partner_order 헤더(또는 라인/연결 slip info)에 discountInfo 가 어디 저장되는지. PartnerOrder 엔티티 필드 또는 파생.
- [ ] **Step 2: 응답에 discountInfo 추가** — `PartnerOrderDetailResponse` 에 `String discountInfo` 추가 + 상세 조회 매핑에서 채움. (화면 미노출 UUID 규칙 무관 — 일반 텍스트.)
- [ ] **Step 3: 테스트** — 상세 조회 시 discountInfo 반환 검증.
- [ ] **Step 4: Commit.**

## 검증 / QA
- **CI green**(partner-order 모듈 전체 실행 — B1 재현 IT 실 Postgres 검증). Docker 실 QA: 가능 시 실 /revisions(진화 스냅샷)→200 + discountInfo 노출 확인.

## 문서
- dev-report `docs/dev-reports/item-3b-partner-order-bugfix.md`. DECISIONS 해당 시.
