package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.service.DailyClosingAmountUpdateService;
import com.samhanair.logis.slip.web.dto.DailyClosingAmountUpdateRequest;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 일마감 표의 금액 세 열만 수정하는 별도 권한 endpoint. */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class DailyClosingAmountUpdateController {
    private final DailyClosingAmountUpdateService service;

    @PutMapping("/{id}/daily-closing-amount")
    @RequirePermission(page = "sales.slip.edit",
            action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ApiResponse<SlipDetailResponse> update(
            @PathVariable UUID id,
            @Valid @RequestBody DailyClosingAmountUpdateRequest request,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String callerName) {
        UUID actorId;
        try {
            actorId = callerId == null ? new UUID(0L, 0L) : UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            actorId = new UUID(0L, 0L);
        }
        return ApiResponse.ok(service.update(id, request, actorId, ActorDisplayName.resolve(null, callerName)));
    }
}
