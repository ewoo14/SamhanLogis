package com.samhanair.logis.slip.revision.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.revision.service.SlipRedlineService;
import com.samhanair.logis.slip.revision.web.dto.SlipRedlineResponse;
import io.swagger.v3.oas.annotations.Operation;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** S2d-1 전표 셀 인라인 레드라인 조회 endpoint. */
@RestController
@RequestMapping("/slips/{slipId}")
@RequiredArgsConstructor
public class SlipRedlineController {

    private final SlipRedlineService redlineService;

    /**
     * 전표 anchor 이후 누적 레드라인 조회.
     *
     * @param slipId 대상 전표 UUID
     * @return anchor 존재 여부와 변경 필드별 layer 목록
     */
    @Operation(summary = "전표 셀 레드라인 조회",
            description = "S2d-1 — 임계 전이 anchor 이후 저장 revision 기반 필드별 누적 레드라인")
    @GetMapping("/redline")
    @RequirePermission(page = "slip.audit-overlay", action = PermissionAction.VIEW)
    public ApiResponse<SlipRedlineResponse> getRedline(@PathVariable UUID slipId) {
        return ApiResponse.ok(redlineService.computeRedline(slipId));
    }
}
