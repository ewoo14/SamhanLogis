package com.samhanair.logis.partner.revision.web.dto;

import java.time.LocalDateTime;

/**
 * 거래처 버전이력 1건 응답 DTO (권한 재편 Phase 2.3 Task 4).
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}): {@code actorId} 는
 * 의도적으로 미노출한다. 사용자 화면에는 {@link #actorName} 표시명만 사용하고, UUID 는
 * 응답 본문에 포함하지 않는다.
 *
 * <p>{@link ChangeSummary} 는 직전 revision 스냅샷 대비 변경 규모 요약이다 — FE 가 타임라인
 * 항목마다 "헤더 N개 / 자식 +N -N ~N" 형태로 표시하기 위한 집계값. estimate 는 라인(line) 기준이나
 * 거래처는 4탭 자식(단가/할인·배송지·담당자) 기준이라 {@code child*} 로 명명한다.
 *
 * <p>{@code com.samhanair.logis.slip.estimate.revision.web.dto.EstimateRevisionResponse} 미러
 * (estimateNo→partnerCode, estimateDate 컬럼 없음, line→child).
 *
 * @param revisionNo partner 별 단조 증가 버전 번호
 * @param revisionType 캡처 유형 (CREATE/EDIT/RESTORE enum name)
 * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
 * @param partnerCode 거래처 식별자 스냅샷 (표시용)
 * @param actorName 변경 주체 표시명 (UUID 비공개 가드, 없으면 null)
 * @param createdAt 버전 생성 시각 ({@link com.samhanair.logis.common.entity.BaseEntity} createdAt)
 * @param changeSummary 직전 revision 대비 변경 규모 요약
 */
public record PartnerRevisionResponse(
        int revisionNo,
        String revisionType,
        Integer sourceRevisionNo,
        String partnerCode,
        String actorName,
        LocalDateTime createdAt,
        ChangeSummary changeSummary) {

    /**
     * 직전 revision 스냅샷 대비 변경 규모 요약.
     *
     * <p>최초 revision (직전 없음) 인 경우 {@code headerChanged=0}, {@code childAdded=현 자식 수},
     * {@code childRemoved=0}, {@code childModified=0} 으로 채운다.
     *
     * <p>자식 = 단가/할인 정책(1:1) + 배송지(1:N) + 담당자(1:N). 단가/할인은 1:1 이라 prev/cur
     * 존재 여부로 add/remove, 양쪽 존재 시 필드 비교로 modify 를 판정한다. 배송지/담당자는 식별자
     * (id 가 스냅샷에 없으므로 alias / contactName) 기준으로 매칭해 add/remove/modify 를 센다.
     *
     * @param headerChanged 값이 달라진 헤더 필드 수 (41필드 비교)
     * @param childAdded 추가된 자식 수 (cur 에만 존재)
     * @param childRemoved 제거된 자식 수 (prev 에만 존재)
     * @param childModified 수정된 자식 수 (양쪽 존재하나 필드값 다름)
     */
    public record ChangeSummary(
            int headerChanged,
            int childAdded,
            int childRemoved,
            int childModified) {
    }
}
