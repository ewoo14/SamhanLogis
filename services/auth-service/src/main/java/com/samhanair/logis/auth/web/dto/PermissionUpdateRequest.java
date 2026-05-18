package com.samhanair.logis.auth.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 단일 권한 갱신 요청 DTO (PUT /admin/permissions).
 *
 * <p>MASTER 만 호출 가능. roleCode + pageCode 조합을 비즈니스 키로 사용하며
 * UUID 는 사용자에게 노출하지 않는다.
 *
 * @param roleCode 역할 코드 (MASTER / MANAGER / ACCOUNTANT / SALES / WAREHOUSE / DISPATCH / INVENTORY)
 * @param pageCode 페이지 코드 (dot-separated, 예: accounting.tax-invoice.emit-nts)
 * @param canView  조회 권한 부여 여부
 * @param canEdit  편집 권한 부여 여부 (true 이면 canView 도 자동 true)
 */
public record PermissionUpdateRequest(

        @NotBlank(message = "역할 코드는 필수입니다")
        @Size(max = 20, message = "역할 코드는 20자 이내여야 합니다")
        @Pattern(regexp = "^[A-Z_]+$", message = "역할 코드는 대문자와 밑줄만 허용됩니다")
        String roleCode,

        @NotBlank(message = "페이지 코드는 필수입니다")
        @Size(max = 100, message = "페이지 코드는 100자 이내여야 합니다")
        @Pattern(regexp = "^[a-z0-9\\-.]+$", message = "페이지 코드는 소문자, 숫자, 하이픈, 점만 허용됩니다")
        String pageCode,

        boolean canView,
        boolean canEdit

) {
}
