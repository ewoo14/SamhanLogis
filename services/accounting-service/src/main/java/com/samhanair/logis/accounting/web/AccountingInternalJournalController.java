package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.JournalService;
import com.samhanair.logis.accounting.web.dto.CreateJournalRequest;
import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;
import com.samhanair.logis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * accounting-service 내부용 분개 생성 endpoint.
 *
 * <p>inventory-service 같은 형제 service 가 {@code X-Internal-Token} 으로 호출하는 전용 경로다.
 * 공개 {@code /accounting/journals} endpoint 의 {@code @RequirePermission} / gateway 사용자
 * 신원 의존성을 사용하지 않고, {@code /internal/**} 보안 필터가 부여한 {@code ROLE_MASTER}
 * 내부 주체만 허용한다.
 */
@RestController
@RequestMapping("/internal/accounting/journals")
@RequiredArgsConstructor
public class AccountingInternalJournalController {

    private final JournalService journalService;

    /**
     * public 분개 생성 endpoint 와 동일한 요청/응답 shape 로 DRAFT 분개를 생성한다.
     *
     * <p>비즈니스 로직은 복제하지 않고 {@link JournalService#create(CreateJournalRequest)} 를
     * 그대로 재사용한다.
     *
     * @param request 분개 생성 요청
     * @return 201 + 생성된 분개 상세
     */
    @Operation(summary = "분개 생성 (internal)",
            description = "inventory-service 자동 분개 생성용. X-Internal-Token 필수.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "입력 검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "내부 토큰 누락 또는 불일치")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<JournalDetailResponse> create(@Valid @RequestBody CreateJournalRequest request) {
        return ApiResponse.ok(journalService.createInventoryAuditAdjustment(request));
    }
}
