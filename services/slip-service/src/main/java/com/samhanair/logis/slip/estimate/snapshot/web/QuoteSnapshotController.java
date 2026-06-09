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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 종합견적서(웹) 견적 저장/불러오기 — legacy 종합견적서 Code.js 노션 견적 DB
 * (saveQuoteSnapshot / getQuoteHistory) 의 우리 DB 대체 엔드포인트.
 *
 * <p>full-path {@code /api/v1/estimates/snapshots} — 웹 estimate-app lib/code.js 가 직접 호출
 * (ESTIMATE_SERVICE_URL=slip-service:8086 직결, slip-bridge 와 동일 패턴). 게이트웨이 경유 시
 * {@code /api/v1/estimates/**} NoStripPrefix 라우트로도 도달.
 *
 * <p>인증: 종합견적서는 사용자 단위 견적 초안 저장이며 estimate-app 이 server-to-server
 * 무인증 호출(감사로그/auth-me 패턴)하므로 별도 @RequirePermission 미적용. 조회는 userEmail
 * 파라미터로 사용자별 격리.
 */
@RestController
@RequestMapping("/api/v1/estimates/snapshots")
@RequiredArgsConstructor
public class QuoteSnapshotController {

    private final QuoteSnapshotService quoteSnapshotService;

    /**
     * 견적 스냅샷 저장 — legacy saveQuoteSnapshot(payload).
     *
     * @param request 저장 요청 (userEmail/createdAt/data/summary/image)
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

    /**
     * 견적 이력 조회 — legacy getQuoteHistory(startDate, endDate).
     *
     * @param userEmail 저장 담당자 이메일 (필수)
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
            @RequestParam(name = "userEmail") String userEmail,
            @RequestParam(name = "startDate", required = false) String startDate,
            @RequestParam(name = "endDate", required = false) String endDate) {
        return ApiResponse.ok(quoteSnapshotService.history(userEmail, startDate, endDate));
    }
}
