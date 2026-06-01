# item 3-B — partner-order /revisions 500 견고화 (dev-report)

- **작성일**: 2026-06-01
- **브랜치**: `fix/partner-order-bugfix-3b`
- **plan**: `docs/superpowers/plans/2026-06-01-partner-order-bugfix-3b.md`

## B1 (구현) — `/revisions` 500 스냅샷 역직렬화 견고화

**원인**: `PartnerOrderRevisionService.listWithSummary` → `deserialize(snapshot)` 가 `JsonProcessingException` 시 명시적 `ResponseStatusException(500)`. `PartnerOrderSnapshot`/`LineSnapshot` 에 `@JsonIgnoreProperties(ignoreUnknown)` 부재 + 알 수 없는 enum 값 비관용 → **저장된 구 스냅샷의 스키마 진화**(폐기 enum 값/필드 변경) 시 목록 전체가 500.

**수정**:
- `PartnerOrderSnapshot` + 중첩 `LineSnapshot` 에 `@JsonIgnoreProperties(ignoreUnknown = true)`.
- 스냅샷 전용 ObjectMapper 에 `DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_AS_NULL`.
- **목록 graceful**: `/revisions` 목록은 역직렬화 불가 revision 만 `changeSummary=null` 로 처리하고 **200 유지**(정상 revision 은 그대로). 정상 데이터 동작 불변.
- 재현 IT `PartnerOrderRevisionListResilienceIT`(unknown 필드/enum/타입 진화 스냅샷) — CI 실 Testcontainers 검증.

## B2 (descope) — discountInfo 충돌헤더

**조사 결과**: `partner_orders` 스키마·`PartnerOrder` 엔티티·confirm/update payload 어디에도 **discountInfo 저장 원천이 없음**. discountInfo 는 **전환(merge convert) 시점에 입력되는 slip 레벨 값**(`PartnerOrderMergeConvertService` 가 `si.discountInfo()` 사용). `MergeConvertDialog` 는 이미 discountInfo 를 충돌헤더 후보로 보유하며 **직접입력(placeholder) fallback** 이 동작한다.

**판단**: "PartnerOrderDetail BE 보강" 을 **단순 DTO 필드(null) 추가로 충족할 수 없음** — 항상 null 인 필드 + FE 배선은 inert(무동작)이고 오해 소지. 진짜 보강 = **주문 레벨 discountInfo 저장**(V_ 마이그레이션 + 주문 생성/편집 캡처 + 노출) = 별도 기능(버그정리 범위 밖). 현재 머지 dialog 가 직접입력으로 처리하므로 사용자 차단 없음.

→ **B2 본 PR 에서 descope**. 후속 기능으로 분리(주문 discountInfo 저장 필요 시).

## 검증
- CI green(partner-order 모듈 전체 — B1 재현 IT 실 Postgres). compile PASS.
