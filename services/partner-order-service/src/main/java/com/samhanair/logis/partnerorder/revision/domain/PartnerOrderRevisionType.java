package com.samhanair.logis.partnerorder.revision.domain;

/**
 * 거래처 주문 버전 스냅샷의 캡처 유형 (Phase 2.4 버전이력 + 복원).
 *
 * <ul>
 *   <li>{@link #CREATE} — 주문 최초 생성 (revision 1). draft create / from-estimate 경로.</li>
 *   <li>{@link #EDIT} — 헤더 또는 라인 변경 후 캡처. draft update / 본사 직결 수정(PUT) 경로.</li>
 *   <li>{@link #STATUS} — 상태 전이 milestone 기록. confirm(CONFIRMING→CONFIRMED) / cancel(CANCELED) 경로.</li>
 *   <li>{@link #RESTORE} — 특정 시점(source revision) 으로의 point-in-time 복원. DRAFT 상태 전용.</li>
 * </ul>
 *
 * <p>{@link com.samhanair.logis.slip.estimate.revision.domain.EstimateRevisionType} 미러.
 * EstimateRevisionType 과 달리 STATUS 가 추가되어 상태머신 전이(confirm/cancel)을 별도 추적한다.
 */
public enum PartnerOrderRevisionType {
    /** 주문 최초 생성 (draft create 또는 from-estimate). */
    CREATE,
    /** 헤더/라인 내용 변경 캡처 (draft update, 본사 직결 수정). */
    EDIT,
    /** 상태 전이 milestone (confirm → CONFIRMED, cancel → CANCELED). */
    STATUS,
    /** point-in-time 복원 — DRAFT 상태에서만 허용, source_revision_no 에 출처 기록. */
    RESTORE
}
