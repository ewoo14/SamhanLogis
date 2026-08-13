package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.common.security.ActorDisplayName;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.service.SalesSlipDeleteService;
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
 * 매출 전표 soft delete endpoint — SP-08-6-3.
 *
 * <p>SALES / MANAGER / MASTER 가 OUTBOUND 전표를 {@code updatedAt} 낙관적 잠금으로
 * 즉시 삭제한다. 물리 삭제(hard delete)는 절대 수행하지 않으며
 * {@link SalesSlipDeleteService#delete} 를 통한 soft delete 만 허용한다.
 *
 * <p>엔드포인트: {@code DELETE /slips/{id}/sales}
 * - 매입 endpoint {@code DELETE /slips/{id}} 와 URL 분리 — 권한/도메인 맥락 명확화
 * - 성공 시 {@code 200 OK} 에 {@code data: null} 인 {@link ApiResponse} 반환
 *   (SP-08-5-3 {@link SlipDeleteController} 응답 패턴 일관)
 */
@RestController
@RequestMapping("/slips")
@RequiredArgsConstructor
public class SalesSlipDeleteController {

    private final SalesSlipDeleteService deleteService;

    /**
     * OUTBOUND 전표를 낙관적 잠금으로 soft delete 처리한다.
     *
     * <p>요청 본문의 {@code updatedAt} 이 서버의 최종 수정 시각과 다르면 409 를 반환한다.
     * 출고 진행 단계(SENT 이후) 전표는 422 를 반환한다.
     * INVENTORY / WAREHOUSE / ACCOUNTANT 역할은 403 을 반환한다.
     *
     * @param id         삭제 대상 전표 UUID
     * @param request    삭제 요청 (updatedAt 낙관적 잠금 값)
     * @param callerId   X-User-Id 헤더 (nullable)
     * @param callerName X-User-Name 헤더 (nullable)
     * @return {@code ApiResponse<Void>} (data: null)
     */
    @Operation(
            summary = "매출 전표 soft delete",
            description = "SALES/MANAGER/MASTER 가 OUTBOUND 전표를 updatedAt 낙관적 잠금으로 삭제합니다. "
                    + "물리 삭제 불가, DRAFT/SAVED 단계만 삭제 허용. 출고 진행(SENT 이후) 시 422.")
    @DeleteMapping("/{id}/sales")
    @RequirePermission(page = "sales.slip.edit", action = com.samhanair.logis.security.permission.PermissionAction.DELETE)
    public ApiResponse<Void> delete(
            @PathVariable UUID id,
            @Valid @RequestBody SlipDeleteRequest request,
            @RequestHeader(value = HttpHeaderConstants.CALLER_ID_HEADER, required = false) String callerId,
            @RequestHeader(value = HttpHeaderConstants.CALLER_NAME_HEADER, required = false) String callerName) {
        deleteService.delete(id, request, parseActorId(callerId), resolveName(callerName));
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

    /**
     * X-User-Name 헤더에서 actorName 을 결정한다.
     *
     * <p>UUID 비공개 정책: UUID 문자열은 사용자 노출 금지 대상이므로
     * callerName 헤더 미수신 시 "system" 으로 폴백한다.
     *
     * @param callerName X-User-Name 헤더 (nullable)
     * @return actorName (사용자 이름 또는 "system")
     */
    private String resolveName(String callerName) {
        return ActorDisplayName.resolve(null, callerName);
    }
}
