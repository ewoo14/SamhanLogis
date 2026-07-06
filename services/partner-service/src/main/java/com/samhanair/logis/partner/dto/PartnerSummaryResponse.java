package com.samhanair.logis.partner.dto;

import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.regex.Pattern;

/**
 * 거래처 페이지 응답 요약 DTO — admin 목록 조회 ({@code GET /admin/partners}) 전용.
 *
 * <p>UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) 일관 — partnerCode 만 노출.
 * 목록 화면에 필요한 최소 필드 (partnerCode / name / bizNo / phone / status / creditLimit /
 * outstandingBalance) 만 포함하여 응답 페이로드 최소화. 단건 상세는 별도 {@link PartnerAdminResponse}.
 *
 * <p>Phase 10 W10-6 — 50 partner 시드 검증을 위한 조회 endpoint 신설 시 도입.
 *
 * @param partnerCode 사용자 노출 식별자
 * @param name 거래처 상호
 * @param bizNo 사업자번호
 * @param phone 연락처
 * @param status 거래 상태
 * @param creditLimit 신용한도
 * @param outstandingBalance 미수금 잔액
 * @param isDeleted soft-delete 여부
 * @param deletedAt 삭제 시각
 * @param deletedByName 삭제자 표시명(UUID 정제 후)
 */
public record PartnerSummaryResponse(
        String partnerCode,
        String name,
        String bizNo,
        String phone,
        PartnerStatus status,
        BigDecimal creditLimit,
        BigDecimal outstandingBalance,
        boolean isDeleted,
        LocalDateTime deletedAt,
        String deletedByName
) {

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    public static PartnerSummaryResponse from(Partner p) {
        return new PartnerSummaryResponse(
                p.getPartnerCode(),
                p.getName(),
                p.getBizNo(),
                p.getPhone(),
                p.getStatus(),
                p.getCreditLimit(),
                p.getOutstandingBalance(),
                Boolean.TRUE.equals(p.getIsDeleted()),
                p.getDeletedAt(),
                resolveActorName(p.getDeletedByName()));
    }

    /**
     * 삭제/복원 표시명 안전 변환.
     *
     * <p>{@code X-User-Name} 이 UUID 형태이면 사용자 화면에 raw UUID 가 노출되지 않도록 null 로 처리한다.
     * {@code deleted_by_name} 컬럼 길이 100자를 넘으면 저장/응답 전에 truncate 한다.
     */
    public static String resolveActorName(String actorName) {
        if (actorName == null || actorName.isBlank()) {
            return null;
        }
        String trimmed = actorName.trim();
        if (UUID_PATTERN.matcher(trimmed).matches()) {
            return null;
        }
        return trimmed.length() > 100 ? trimmed.substring(0, 100) : trimmed;
    }
}
