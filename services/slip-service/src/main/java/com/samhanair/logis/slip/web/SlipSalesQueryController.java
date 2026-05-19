package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.slip.service.SlipSalesQueryService;
import com.samhanair.logis.slip.web.dto.SlipSalesQueryResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * accounting-service 세금계산서 일괄발행 배치용 Internal 판매조회 endpoint.
 *
 * <p>audit Slice 2 P0 — accounting-service 의 {@code SlipQueryClient} 가 호출하는
 * {@code GET /internal/slips/sales-query} 를 제공한다.
 *
 * <p>결함 배경: {@code SlipQueryClient.fetchAllSalesRows} 가 본 endpoint 를 호출하지만
 * 기존 {@link SlipInternalController} 에 미구현 → 항상 4xx → 빈 결과 → silent failure.
 * {@code HometaxExportService.previewBatch} 가 항상 빈 홈택스 양식을 생성하는 원인.
 *
 * <p>인증: X-Internal-Token 헤더 ({@link com.samhanair.logis.security.InternalTokenFilter}).
 * {@code /internal/**} prefix 는 SecurityConfig 에서 InternalTokenFilter 적용.
 * {@code @PreAuthorize("hasRole('MASTER')")} 추가 가드.
 *
 * <p>응답 구조: {@code ApiResponse<PageWrapper>} — accounting-service 의
 * {@code dataMap.get("content")} + {@code dataMap.get("last")} 접근 패턴 준수.
 *
 * <p>UUID 비공개 가드: 응답에 슬립 UUID 미포함. {@code slipNo} / {@code partnerCode} 기준.
 */
@Slf4j
@RestController
@RequestMapping("/internal/slips")
@RequiredArgsConstructor
public class SlipSalesQueryController {

    /** accounting-service SlipQueryClient 기본 page size 와 동일. */
    private static final int DEFAULT_PAGE_SIZE = 200;
    private static final int MAX_PAGE_SIZE = 500;

    private final SlipSalesQueryService slipSalesQueryService;

    /**
     * OUTBOUND CONFIRMED 슬립 판매조회 — accounting-service 세금계산서 일괄발행 배치용.
     *
     * <p>accounting-service 의 {@code SlipQueryClient} 는 page 를 0 부터 증가시키며
     * {@code data.last = true} 가 될 때까지 반복 호출한다. 응답 shape:
     * <pre>
     * {
     *   "data": {
     *     "content": [ { partnerCode, partnerName, ... }, ... ],
     *     "last": true/false,
     *     "totalElements": N,
     *     "totalPages": M,
     *     "number": page,
     *     "size": size
     *   }
     * }
     * </pre>
     *
     * @param from        조회 시작일 (yyyy-MM-dd, 필수)
     * @param to          조회 종료일 (yyyy-MM-dd, 필수)
     * @param partnerCode 거래처코드 필터 (선택, null/blank 이면 전체 거래처)
     * @param page        페이지 번호 (0-based, 기본 0)
     * @param size        페이지 크기 (기본 200, 최대 500)
     * @return ApiResponse wrapper 안 판매조회 페이지 응답
     */
    @Operation(
            summary = "Internal 판매조회 — 세금계산서 일괄발행 배치용 (audit Slice 2 P0)",
            description = "X-Internal-Token 인증. OUTBOUND CONFIRMED 슬립 기간 조회. "
                    + "accounting-service SlipQueryClient 가 page 단위로 반복 호출. "
                    + "partnerCode null/blank 이면 전체 거래처.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200",
                    description = "조회 성공 (content 리스트 + last 여부)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "from/to 필수 누락 또는 to < from"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "X-Internal-Token 누락/불일치")
    })
    @GetMapping("/sales-query")
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<Page<SlipSalesQueryResponse>> querySales(
            @Parameter(description = "조회 시작일 (yyyy-MM-dd)", required = true)
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = "조회 종료일 (yyyy-MM-dd)", required = true)
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = "거래처코드 필터 (선택, 정확 일치)")
            @RequestParam(required = false) String partnerCode,
            @Parameter(description = "페이지 번호 (0-based)")
            @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "페이지 크기 (기본 200, 최대 500)")
            @RequestParam(defaultValue = "200") int size) {

        int resolvedSize = Math.min(Math.max(1, size), MAX_PAGE_SIZE);
        PageRequest pageable = PageRequest.of(page, resolvedSize,
                Sort.by("slipDate").ascending().and(Sort.by("seqNo").ascending()));

        log.info("Internal sales-query — from={}, to={}, partnerCode={}, page={}, size={}",
                from, to, partnerCode, page, resolvedSize);

        Page<SlipSalesQueryResponse> result =
                slipSalesQueryService.findSalesForPeriod(from, to, partnerCode, pageable);

        return ApiResponse.ok(result);
    }
}
