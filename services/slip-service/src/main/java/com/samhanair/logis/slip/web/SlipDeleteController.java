package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.service.SlipDeleteService;
import com.samhanair.logis.slip.web.dto.SlipDeleteRequest;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 입고 전표 soft delete endpoint — SP-08-5-3.
 *
 * <p>WAREHOUSE / MANAGER / MASTER 가 INBOUND 전표를 {@code updatedAt} 낙관적 잠금으로
 * 즉시 삭제한다. 물리 삭제(hard delete)는 절대 수행하지 않으며
 * {@link com.samhanair.logis.slip.service.SlipDeleteService#delete} 를 통한 soft delete 만
 * 허용한다.
 *
 * <p>응답은 성공 시 {@code 200 OK} 에 {@code data: null} 인 {@link ApiResponse} 를 반환한다
 * (SP-08-5-2 SlipUpdateController 응답 패턴 일관).
 */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class SlipDeleteController {

    private final SlipDeleteService deleteService;

    /**
     * INBOUND 전표를 낙관적 잠금으로 soft delete 처리한다.
     *
     * <p>요청 본문의 {@code updatedAt} 이 서버의 최종 수정 시각과 다르면 409 를 반환한다.
     * 검수/처리 단계(INSPECTING 이후) 전표는 422 를 반환한다.
     *
     * @param id         삭제 대상 전표 UUID
     * @param request    삭제 요청 (updatedAt 낙관적 잠금 값)
     * @param callerId   X-User-Id 헤더 (nullable)
     * @param callerName X-User-Name 헤더 (nullable)
     * @return {@code ApiResponse<Void>} (data: null)
     */
    @Operation(
            summary = "입고 전표 soft delete",
            description = "WAREHOUSE/MANAGER/MASTER 가 INBOUND 전표를 updatedAt 낙관적 잠금으로 삭제합니다. "
                    + "물리 삭제 불가, DRAFT/SAVED 단계만 삭제 허용.")
    @DeleteMapping("/{id}")
    @RequirePermission(page = "purchases.slip.delete", action = com.samhanair.logis.security.permission.PermissionAction.DELETE)
    public ApiResponse<Void> delete(
            @PathVariable UUID id,
            @Valid @RequestBody SlipDeleteRequest request,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String callerName) {
        deleteService.delete(id, request, parseActorId(callerId), resolveName(callerId, callerName));
        return ApiResponse.ok(null);
    }

    /**
     * 헤더에서 actorId 를 파싱한다.
     *
     * @apiNote actorId 헤더 미수신 또는 UUID 파싱 실패 시 zero UUID 폴백 (audit 로그 시스템 대리)
     * @param callerId X-User-Id 헤더 값 (nullable)
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
        return ActorDisplayName.resolve(callerId, callerName);
    }
}
