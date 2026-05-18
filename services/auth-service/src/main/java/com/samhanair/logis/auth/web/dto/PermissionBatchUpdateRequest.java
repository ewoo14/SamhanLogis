package com.samhanair.logis.auth.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 다건 권한 일괄 갱신 요청 DTO (POST /admin/permissions/batch).
 *
 * <p>마스터 화면에서 체크박스 다중 토글 시 한 번에 여러 권한을 갱신.
 * 최대 100건 제한 — 초과 시 400 반환.
 *
 * @param permissions 갱신할 권한 목록 (1건 이상, 최대 100건)
 */
public record PermissionBatchUpdateRequest(

        @NotEmpty(message = "권한 목록은 1건 이상이어야 합니다")
        @Size(max = 100, message = "한 번에 최대 100건까지 갱신할 수 있습니다")
        @Valid
        List<PermissionUpdateRequest> permissions

) {
}
