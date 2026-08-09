package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.service.SlipRestoreService;
import com.samhanair.logis.slip.web.dto.SlipResponse;
import io.swagger.v3.oas.annotations.Operation;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/** 전표 목록 soft-delete 복원 endpoint (E2). */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class SlipRestoreController {

    private final SlipRestoreService restoreService;

    @Operation(summary = "판매전표 목록 삭제행 복원",
            description = "soft-deleted 전표를 복원합니다. 동일 전표번호 활성행이 있으면 409 를 반환합니다.")
    @PostMapping("/{id}/restore")
    @RequirePermission(page = "sales.slip.list", action = PermissionAction.RESTORE)
    public ApiResponse<SlipResponse> restore(@PathVariable UUID id,
                                             @RequestHeader(value = "X-User-Id", required = false)
                                             String requesterId) {
        return ApiResponse.ok(SlipResponse.from(restoreService.restore(id, requesterId)));
    }
}
