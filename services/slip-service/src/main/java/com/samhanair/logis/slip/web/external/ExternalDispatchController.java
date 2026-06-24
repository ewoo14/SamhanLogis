package com.samhanair.logis.slip.web.external;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.dto.external.CreateExternalDispatchRequest;
import com.samhanair.logis.slip.dto.external.ExternalDispatchResponse;
import com.samhanair.logis.slip.service.external.ExternalDispatchService;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 타배송사 발송 admin API. */
@RestController
@RequestMapping("/admin/external-dispatches")
@RequiredArgsConstructor
public class ExternalDispatchController {

    private static final String CALLER_HEADER = "X-User-Id";

    private final ExternalDispatchService service;

    /** 선택 전표를 외부기사/배송사에게 SMS 발송한다. 화면 식별자는 배송사명/전화번호/전표번호다. */
    @PostMapping
    @RequirePermission(page = "dispatch.board", action = PermissionAction.CREATE)
    public ApiResponse<ExternalDispatchResponse> dispatchBySms(
            @Valid @RequestBody CreateExternalDispatchRequest request,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerId
    ) {
        return ApiResponse.ok(service.dispatchBySms(request, parseCaller(callerId)));
    }

    private static UUID parseCaller(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "X-User-Id 헤더는 UUID 형식이어야 합니다.");
        }
    }
}
