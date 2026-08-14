package com.samhanair.logis.slip.web.dispatch;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.dto.dispatch.SlipBoardResponse;
import com.samhanair.logis.slip.service.SlipService;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskBoardQueryService;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;
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
    private final SlipService slipService;

    /**
     * 미배차 출고전표 페이지 조회 — default: today ±1일 + UNDISPATCHED + 50/회.
     *
     * <p>SP-D3 동적 권한 VIEW 가드 — dispatch.board pageCode 적용.
     *
     */
    @Operation(summary = "미배차 출고전표 페이지", description = "default: Asia/Seoul today ±1일 + UNDISPATCHED + 50/회")
    @GetMapping("/undispatched-slips")
    @RequirePermission(page = "dispatch.board", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<Page<SlipBoardResponse>> listUnDispatchedSlips(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Set<SlipDispatchStatus> statuses,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        // SP-D3 동적 권한 VIEW 가드 — dispatch.board
        return ApiResponse.ok(queryService.findUnDispatchedSlips(from, to, statuses, page, size));
    }

    /**
     * 배차보드 전표확인용 출고전표 상세 조회.
     *
     * <p>일반 {@code GET /slips/{id}} 는 출고 전표 권한({@code sales.slip.list})을 유지한다.
     * 본 endpoint 는 배차보드 사용자가 전표 확인 모달을 열 수 있도록 {@code dispatch.board VIEW}
     * 권한으로만 노출하며, 출고전표가 아닌 경우는 차단한다.
     *
     * @param id 전표 UUID (path param 전용, 화면 표시 금지)
     * @return 출고전표 미리보기용 상세 응답
     */
    @Operation(summary = "배차보드 전표확인 상세", description = "dispatch.board VIEW 권한으로 출고전표 미리보기 상세를 조회한다.")
    @GetMapping("/slips/{id}")
    @RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)
    public ApiResponse<SlipDetailResponse> getSlipDetailForDispatchBoard(
            @org.springframework.web.bind.annotation.PathVariable UUID id) {
        SlipDetailResponse response = slipService.getOne(id);
        if (response.slipType() != SlipType.OUTBOUND) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "배차 보드 전표확인은 출고전표만 조회할 수 있습니다.");
        }
        return ApiResponse.ok(response);
    }
}
