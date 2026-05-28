package com.samhanair.logis.slip.web.dispatch;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.dto.dispatch.SlipBoardResponse;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskBoardQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배차 메뉴 좌측 패널 — 미배차 출고전표 페이지네이션 (BE Task B11, D-DB-06).
 *
 * <p>인증: ROLE_DISPATCH / ROLE_MANAGER / ROLE_MASTER. 사용자-facing GET 은 {@code @RequirePermission} VIEW 가드를 적용한다.
 *
 * <p>SP-D3 동적 권한 이중 가드:
 * <ul>
 *   <li>{@code dispatch.board} 페이지 코드 — GET 에 VIEW 가드 적용</li>
 *   <li>canView=false 이면 명시적 deny → 403</li>
 * </ul>
 */
@Slf4j
@Tag(name = "Dispatch Board (Admin)")
@RestController
@RequestMapping("/admin/dispatch-board")
@RequiredArgsConstructor
public class DispatchBoardAdminController {

    /** SP-D3 — 배차 보드 페이지 코드. */
    private static final String DISPATCH_BOARD_PAGE_CODE = "dispatch.board";

    private final DispatchTaskBoardQueryService queryService;
    private final DynamicPermissionClient dynamicPermissionClient;

    /**
     * 미배차 출고전표 페이지 조회 — default: today ±1일 + UNDISPATCHED + 50/회.
     *
     * <p>SP-D3 동적 권한 VIEW 가드 — dispatch.board pageCode 적용.
     *
     * @param roleHeader X-User-Role header (api-gateway 전파)
     */
    @Operation(summary = "미배차 출고전표 페이지", description = "default: Asia/Seoul today ±1일 + UNDISPATCHED + 50/회")
    @GetMapping("/undispatched-slips")
    @RequirePermission(page = "dispatch.board", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public Page<SlipBoardResponse> listUnDispatchedSlips(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Set<SlipDispatchStatus> statuses,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestHeader(value = "X-User-Role", required = false) String roleHeader
    ) {
        // SP-D3 동적 권한 VIEW 가드 — dispatch.board
        checkViewPermission(roleHeader);
        return queryService.findUnDispatchedSlips(from, to, statuses, page, size)
                .map(SlipBoardResponse::from);
    }

    // =========================================================================
    // SP-D3 동적 권한 헬퍼
    // =========================================================================

    /**
     * SP-D3 동적 VIEW 권한 검증 — dispatch.board 페이지 코드.
     *
     * <p>actorRole null/blank 이면 건너뜀.
     * canView=false 이면 명시적 deny → 403.
     *
     * @param actorRole 요청자 role (X-User-Role header)
     */
    private void checkViewPermission(String actorRole) {
        if (actorRole == null || actorRole.isBlank()) {
            return;
        }
        boolean canView = dynamicPermissionClient.canView(actorRole, DISPATCH_BOARD_PAGE_CODE);
        if (!canView) {
            log.warn("[SP-D3] 동적 VIEW 권한 차단 — roleCode={} pageCode={}", actorRole, DISPATCH_BOARD_PAGE_CODE);
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "동적 권한 설정에 의해 배차 보드 조회 권한이 차단되었습니다.");
        }
    }
}
