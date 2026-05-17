package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.slip.service.SalesSlipUpdateService;
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
 * 매출 전표 direct PUT 수정 endpoint (SP-08-6-2).
 *
 * <p>SALES/MANAGER/MASTER 가 기존 SlipEditRequest 승인 요청 흐름과 별개로 OUTBOUND 전표를
 * 즉시 수정하는 경로. {@link SlipUpdateController} (매입) 와 대칭 패턴으로 구성한다.
 *
 * <p>엔드포인트: {@code PUT /slips/{id}/sales}
 * - 매입 endpoint {@code PUT /slips/{id}} 와 URL 분리 — 권한/도메인 맥락 명확화
 */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class SalesSlipUpdateController {

    private final SalesSlipUpdateService updateService;

    /**
     * OUTBOUND 전표 헤더와 라인을 낙관적 잠금으로 즉시 수정한다.
     *
     * @param id 전표 ID (UUID)
     * @param request 수정 요청 본문 ({@code updatedAt} 필수 — 낙관적 잠금 토큰)
     * @param callerId X-User-Id 헤더 (audit 기록용, nullable)
     * @param callerName X-User-Name 헤더 (audit 기록용, nullable)
     * @return 수정 후 전표 상세 응답 (ApiResponse 래퍼)
     */
    @Operation(summary = "매출 전표 즉시 수정",
            description = "SALES/MANAGER/MASTER 가 OUTBOUND 전표 헤더와 라인을 updatedAt 낙관적 잠금으로 수정합니다.")
    @PutMapping("/{id}/sales")
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")
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
