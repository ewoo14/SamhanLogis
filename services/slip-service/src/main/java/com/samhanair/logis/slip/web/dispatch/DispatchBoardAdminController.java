package com.samhanair.logis.slip.web.dispatch;

import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.dto.dispatch.SlipBoardResponse;
import com.samhanair.logis.slip.service.dispatch.DispatchTaskBoardQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배차 메뉴 좌측 패널 — 미배차 출고전표 페이지네이션 (BE Task B11, D-DB-06).
 *
 * <p>인증: ROLE_MANAGER / ROLE_MASTER ({@code @PreAuthorize}).
 */
@Tag(name = "Dispatch Board (Admin)")
@RestController
@RequestMapping("/admin/dispatch-board")
@RequiredArgsConstructor
@PreAuthorize("hasAnyAuthority('ROLE_MANAGER','ROLE_MASTER')")
public class DispatchBoardAdminController {

    private final DispatchTaskBoardQueryService queryService;

    /** 미배차 출고전표 페이지 조회 — default: today ±1일 + UNDISPATCHED + 50/회. */
    @Operation(summary = "미배차 출고전표 페이지", description = "default: Asia/Seoul today ±1일 + UNDISPATCHED + 50/회")
    @GetMapping("/undispatched-slips")
    public Page<SlipBoardResponse> listUnDispatchedSlips(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Set<SlipDispatchStatus> statuses,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        return queryService.findUnDispatchedSlips(from, to, statuses, page, size)
                .map(SlipBoardResponse::from);
    }
}
