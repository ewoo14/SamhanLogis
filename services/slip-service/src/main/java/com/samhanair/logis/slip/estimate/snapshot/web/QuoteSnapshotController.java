package com.samhanair.logis.slip.estimate.snapshot.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.slip.estimate.snapshot.service.QuoteSnapshotService;
import com.samhanair.logis.slip.estimate.snapshot.web.dto.QuoteSnapshotResponse;
import com.samhanair.logis.slip.estimate.snapshot.web.dto.SaveQuoteSnapshotRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import java.util.UUID;

/**
 * 종합견적서(웹) 견적 저장/불러오기 — legacy 종합견적서 Code.js 노션 견적 DB
 * (saveQuoteSnapshot / getQuoteHistory) 의 우리 DB 대체 엔드포인트.
 *
 * <p>full-path {@code /internal/estimates/snapshots} — 웹 estimate-app lib/code.js 가 직접 호출
 * (ESTIMATE_SERVICE_URL=slip-service:8086 직결, slip-bridge 와 동일 패턴).
 *
 * <p>인증 (P0-A 하드닝, 2026-06-10): {@code /internal/} prefix → {@code InternalTokenFilter}
 * 가 X-Internal-Token 검증 → system-internal principal. SecurityConfig 의 {@code /internal/**}
 * 규칙으로 토큰 미제시 403 / 불일치 401 / 유효 통과. 기존 무인증 permitAll 폐기(저민감 견적
 * 초안이라도 server-to-server 게이트 일원화 — 결정 ②). 목록은 전체 조회를 기본으로 하고,
 * 선택적으로 userEmail로 작성자 범위를 좁힌다.
 */
@RestController
@RequestMapping("/internal/estimates/snapshots")
@RequiredArgsConstructor
public class QuoteSnapshotController {

    private final QuoteSnapshotService quoteSnapshotService;

    /**
     * 견적 스냅샷 저장 — legacy saveQuoteSnapshot(payload).
     *
     * @param request 저장 요청 (작성자/JSON 상태/계산 합계)
     * @return 저장된 스냅샷 메타 (201)
     */
    @Operation(summary = "견적 저장 (종합견적서)",
            description = "종합견적서 UI 작업상태 전체(base64 blob)를 저장. legacy 노션 견적 DB 대체.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "저장 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "userEmail/data 누락")
    })
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<QuoteSnapshotResponse> save(@Valid @RequestBody SaveQuoteSnapshotRequest request) {
        return ApiResponse.ok(quoteSnapshotService.save(request));
    }

    /** 저장된 견적 수정 — 요청 이메일이 작성자와 같을 때만 허용한다. */
    @PutMapping("/{id}")
    public ApiResponse<QuoteSnapshotResponse> update(@PathVariable UUID id,
            @Valid @RequestBody SaveQuoteSnapshotRequest request) {
        return ApiResponse.ok(quoteSnapshotService.update(id, request));
    }

    /**
     * 견적 이력 조회 — legacy getQuoteHistory(startDate, endDate).
     *
     * @param userEmail 작성자 필터 (생략 시 전체 작성자)
     * @param startDate 조회 시작일 (yyyy-MM-dd 또는 ISO, 선택)
     * @param endDate 조회 종료일 (선택)
     * @return 저장일시 내림차순 스냅샷 목록 (blob 포함 — 그대로 복원용)
     */
    @Operation(summary = "견적 이력 조회 (종합견적서)",
            description = "사용자별 저장 견적 목록(최신순). 복원용 base64 blob 포함. legacy getQuoteHistory 대체.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공")
    })
    @GetMapping
    public ApiResponse<List<QuoteSnapshotResponse>> history(
            @RequestParam(name = "userEmail", required = false) String userEmail,
            @RequestParam(name = "startDate", required = false) String startDate,
            @RequestParam(name = "endDate", required = false) String endDate) {
        return ApiResponse.ok(quoteSnapshotService.history(userEmail, startDate, endDate));
    }

    /**
     * 거래처명 부분검색 이력 — legacy getQuoteHistoryByCustomer(custName) (#31).
     *
     * @param userEmail 작성자 필터 (생략 시 전체 작성자)
     * @param custName 거래처명 키워드 (부분 일치, 필수)
     * @return 저장일시 내림차순 최근 30건 (blob 포함)
     */
    @Operation(summary = "거래처별 견적 이력 조회 (종합견적서)",
            description = "사용자별 + 거래처명 부분검색 최근 30건(최신순). legacy getQuoteHistoryByCustomer 대체.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "조회 성공")
    })
    @GetMapping("/by-customer")
    public ApiResponse<List<QuoteSnapshotResponse>> historyByCustomer(
            @RequestParam(name = "userEmail", required = false) String userEmail,
            @RequestParam(name = "custName") String custName) {
        return ApiResponse.ok(quoteSnapshotService.historyByCustomer(userEmail, custName));
    }
}
