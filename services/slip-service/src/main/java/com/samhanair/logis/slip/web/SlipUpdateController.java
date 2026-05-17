package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.slip.service.SlipUpdateService;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import com.samhanair.logis.slip.web.dto.SlipUpdateRequest;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 매입 전표 direct PUT 수정 endpoint.
 *
 * <p>기존 {@link com.samhanair.logis.slip.editrequest.web.SlipEditRequestController}
 * 승인 요청 흐름과 공존하는 즉시 수정 경로다.
 */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class SlipUpdateController {

    private final SlipUpdateService updateService;

    /**
     * INBOUND 전표 헤더와 라인을 낙관적 잠금으로 즉시 수정한다.
     */
    @Operation(summary = "매입 전표 즉시 수정",
            description = "WAREHOUSE/MANAGER/MASTER 가 INBOUND 전표 헤더와 라인을 updatedAt 낙관적 잠금으로 수정합니다.")
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")
    public ApiResponse<SlipDetailResponse> update(
            @PathVariable UUID id,
            @Valid @RequestBody SlipUpdateRequest request,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String callerName) {
        return ApiResponse.ok(updateService.update(id, request, parseActorId(callerId),
                resolveName(callerId, callerName)));
    }

    /**
     * 헤더에서 actorId 를 파싱한다.
     *
     * @apiNote actorId 헤더 미수신 또는 UUID 파싱 실패 시 zero UUID 폴백 (audit 로그 시스템 대리)
     * @param callerId X-Caller-Id 헤더 값 (nullable)
     * @return 파싱된 UUID, 또는 {@code 00000000-0000-0000-0000-000000000000}
     */
    private UUID parseActorId(String callerId) {
        if (callerId == null || callerId.isBlank()) {
            return new UUID(0L, 0L);
        }
        try {
            return UUID.fromString(callerId);
        } catch (IllegalArgumentException ex) {
            return new UUID(0L, 0L);
        }
    }

    private String resolveName(String callerId, String callerName) {
        if (callerName != null && !callerName.isBlank()) {
            return callerName;
        }
        if (callerId != null && !callerId.isBlank()) {
            return callerId;
        }
        return "system";
    }
}
