package com.samhanair.logis.slip.revision.web.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 전표 버전이력 1건 응답 DTO (권한 재편 Phase 2.1 Task 4).
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}): {@code actorId} 는
 * 의도적으로 미노출한다. 사용자 화면에는 {@link #actorName} 표시명만 사용하고, UUID 는
 * 응답 본문에 포함하지 않는다 (audit overlay 와 달리 본 버전이력 응답은 색상 hash 도 actorName
 * 기준이므로 UUID 자체가 불필요).
 *
 * <p>{@link ChangeSummary} 는 직전 revision 스냅샷 대비 변경 규모 요약이다 — FE 가 타임라인
 * 항목마다 "헤더 N개 / 라인 +N -N ~N" 형태로 표시하기 위한 집계값.
 *
 * @param revisionNo slip 별 단조 증가 버전 번호
 * @param revisionType 캡처 유형 (CREATE/EDIT/RESTORE enum name)
 * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
 * @param slipNo 전표번호 스냅샷 (표시용)
 * @param slipDate 전표 날짜 스냅샷
 * @param actorName 변경 주체 표시명 (UUID 비공개 가드, 없으면 null)
 * @param actorColor 변경 주체 색상 hex (presence/coedit 와 동일 팔레트, 없으면 null)
 * @param createdAt 버전 생성 시각 ({@link com.samhanair.logis.common.entity.BaseEntity} createdAt)
 * @param changeSummary 직전 revision 대비 변경 규모 요약
 * @param fieldChanges 직전 revision 대비 필드/품목 셀 단위 변경 목록
 */
public record SlipRevisionResponse(
        int revisionNo,
        String revisionType,
        Integer sourceRevisionNo,
        String slipNo,
        LocalDate slipDate,
        String actorName,
        String actorColor,
        LocalDateTime createdAt,
        ChangeSummary changeSummary,
        List<FieldChange> fieldChanges) {

    /**
     * 직전 revision 스냅샷 대비 변경 규모 요약.
     *
     * <p>최초 revision (직전 없음) 인 경우 {@code headerChanged=0}, {@code lineAdded=현 라인 수},
     * {@code lineRemoved=0}, {@code lineModified=0} 으로 채운다.
     *
     * @param headerChanged 값이 달라진 헤더 필드 수
     * @param lineAdded 추가된 라인 수 (productId 기준 cur 에만 존재)
     * @param lineRemoved 제거된 라인 수 (productId 기준 prev 에만 존재)
     * @param lineModified 수정된 라인 수 (productId 양쪽 존재하나 필드값 다름)
     */
    public record ChangeSummary(
            int headerChanged,
            int lineAdded,
            int lineRemoved,
            int lineModified) {
    }

    /**
     * 직전 revision 대비 필드/셀 단위 변경 1건.
     *
     * <p>UUID 비공개 정책에 따라 {@code actorId}, {@code partnerId}, {@code productId} 등 내부
     * 식별자는 노출하지 않는다. {@code fieldPath} 는 UI 위치 식별용 안정 path 이며 값에는
     * 업무 표시값만 담는다.
     *
     * @param fieldPath 내부 위치 path (예: header.memo, lines[0].quantity)
     * @param label 사용자 표시 라벨
     * @param beforeValue 이전값 (최초 작성/신규 셀은 null)
     * @param afterValue 새값 (삭제/clear 는 null)
     * @param actorName 변경 주체 표시명
     * @param actorColor 변경 주체 색상 hex
     * @param changedAt 변경 시각
     */
    public record FieldChange(
            String fieldPath,
            String label,
            String beforeValue,
            String afterValue,
            String actorName,
            String actorColor,
            LocalDateTime changedAt) {
    }
}
