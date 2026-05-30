package com.samhanair.logis.partnerorder.revision.domain;

/**
 * 거래처 주문 버전 스냅샷의 캡처 유형 (Phase 2.4 버전이력 + 복원).
 *
 * <ul>
 *   <li>{@link #CREATE} — 주문 최초 생성 (revision 1). draft create / from-estimate / confirm 경로.</li>
 *   <li>{@link #EDIT} — 헤더 또는 라인 변경 후 캡처. draft update / 본사 직결 수정(PUT) 경로.</li>
 *   <li>{@link #STATUS} — 상태 전이 milestone 기록. cancel(CANCELED) 경로.</li>
 *   <li>{@link #RESTORE} — 특정 시점(source revision) 으로의 point-in-time 복원.</li>
 *   <li>{@link #DELETE} — soft-delete 직전 상태 스냅샷. 삭제된 주문도 이 revision 을 통해
 *       버전이력에서 복원 가능하다 (undelete + 시점 내용 적용).</li>
 * </ul>
 *
 * <p>{@link com.samhanair.logis.slip.estimate.revision.domain.EstimateRevisionType} 미러.
 * EstimateRevisionType 과 달리 STATUS / DELETE 가 추가되어 상태머신 전이(confirm/cancel) 및
 * soft-delete 이벤트를 별도 추적한다.
 */
public enum PartnerOrderRevisionType {
    /** 주문 최초 생성 (draft create, from-estimate, confirm 경로 포함). */
    CREATE,
    /** 헤더/라인 내용 변경 캡처 (draft update, 본사 직결 수정). */
    EDIT,
    /** 상태 전이 milestone (cancel → CANCELED 등). */
    STATUS,
    /** point-in-time 복원 — source_revision_no 에 출처 기록. */
    RESTORE,
    /**
     * soft-delete 직전 스냅샷 — "삭제도 되돌릴 수 있는 변경"으로 취급한다.
     * 복원 경로에서 이 revision 을 타겟으로 지정하면 undelete + 시점 내용이 적용된다.
     */
    DELETE
}
