package com.samhanair.logis.auth.service.dto;

/**
 * 단일 역할-페이지 권한 정보 DTO.
 *
 * <p>UUID 비공개 정책: id 필드는 포함하지 않는다.
 * 사용자 식별자는 {@code roleCode} + {@code pageCode} 비즈니스 키로만 표현.
 *
 * @param roleCode    역할 코드 (예: ACCOUNTANT)
 * @param pageCode    페이지 코드 (예: accounting.tax-invoice.emit-nts)
 * @param displayName 페이지 한국어 명칭 (PageCode enum 에서 조회, 미등록 시 pageCode 그대로 사용)
 * @param canView     조회 권한 여부
 * @param canEdit     편집 권한 여부
 * @param isOverride  DB override row 존재 여부 (false = fallback 정책 적용 중)
 */
public record PermissionDto(
        String roleCode,
        String pageCode,
        String displayName,
        boolean canView,
        boolean canEdit,
        boolean isOverride
) {
}
