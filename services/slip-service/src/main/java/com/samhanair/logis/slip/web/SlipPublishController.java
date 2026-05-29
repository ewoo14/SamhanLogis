package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.slip.domain.SlipSourceType;
import com.samhanair.logis.slip.publish.PublishFromEstimateRequest;
import com.samhanair.logis.slip.publish.PublishFromPartnerOrderRequest;
import com.samhanair.logis.slip.publish.PublishSlipResponse;
import com.samhanair.logis.slip.publish.SlipPublishService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Phase 6 M5 (slip-service-integration) — 통합 발행 endpoint.
 *
 * <p>설계: {@code docs/migration/phase6/M5-slip-service-integration.md} (Sync REST 채택).
 *
 * <p>호출자:
 * <ul>
 *   <li>{@code POST /api/v1/slips/from-estimate} — estimate-app v2 의 견적 finalize 시
 *       즉시 출고전표 자동 발행 (legacy {@code sendOrderFromUi} → e-Count {@code SaleList POST}
 *       1:1 대체).</li>
 *   <li>{@code POST /api/v1/slips/from-partner-order} — partner-order-service M4 의 협력사
 *       주문 승인 시 출고전표 발행 (M4 SlipServiceClient — 별도 PR).</li>
 *   <li>{@code GET  /api/v1/slips/by-source} — idempotency 보조 조회 (재시도/디버깅).</li>
 * </ul>
 *
 * <p>Idempotency:
 * <ul>
 *   <li>{@code Idempotency-Key} 헤더 필수 권장 (없어도 동작하지만 중복 발행 보호 X).</li>
 *   <li>같은 키 + 같은 본문 → {@code 200 OK} + 기존 slipNo (replay flag=true)</li>
 *   <li>같은 키 + 다른 본문 → {@code 409 Conflict}</li>
 *   <li>새 키 + 새 본문 → {@code 201 Created} + 신규 slipNo</li>
 * </ul>
 *
 * <p>권한: 본 endpoint 들은 service-to-service 호출이므로 SALES/MANAGER/MASTER + INTEGRATION
 * 역할만 허용 (현 슬라이스에서는 SALES/MANAGER/MASTER 매트릭스 그대로 + 향후 INTEGRATION 추가).
 * estimate-app v2 / partner-order-service 가 gateway 를 통해 호출하므로 X-User-Role 헤더가
 * 필수.
 */
@RestController
@RequestMapping("/api/v1/slips")
@RequiredArgsConstructor
public class SlipPublishController {

    private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";
    private static final String CALLER_HEADER = "X-User-Id";

    private final SlipPublishService slipPublishService;

    /**
     * estimate-app v2 → 출고전표 발행.
     *
     * <p>응답 코드:
     * <ul>
     *   <li>201 Created — 신규 발행</li>
     *   <li>200 OK — 멱등 재반환 (같은 키 + 같은 본문)</li>
     *   <li>409 Conflict — 같은 키 + 다른 본문 / 동시 발행 race 충돌</li>
     *   <li>400 Bad Request — warehouseCode 매핑 누락 / lines 비어있음 / qty 형식 오류</li>
     * </ul>
     *
     * @param request 발행 요청 본문
     * @param idempotencyKey Idempotency-Key 헤더 (선택)
     * @param callerHeader X-User-Id 헤더 (gateway 주입)
     * @return ApiResponse&lt;PublishSlipResponse&gt;
     */
    @Operation(summary = "견적 → 출고전표 발행",
            description = "estimate-app v2 의 견적 finalize → 즉시 출고전표 자동 발행. "
                    + "Idempotency-Key 헤더로 중복 발행 보호.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "신규 발행 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "멱등 재반환"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "같은 키 + 다른 본문 / 동시 발행 race"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "warehouseCode 매핑 누락 / lines 검증 실패")
    })
    @PostMapping("/from-estimate")
    @RequirePermission(page = "slip.publish.from-estimate", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<PublishSlipResponse>> publishFromEstimate(
            @Valid @RequestBody PublishFromEstimateRequest request,
            @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) String idempotencyKey,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        PublishSlipResponse response = slipPublishService.publishFromEstimate(
                request, normalizeKey(idempotencyKey), callerOrSystem(callerHeader));
        HttpStatus status = response.idempotentReplay() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(ApiResponse.ok(response));
    }

    /**
     * partner-order-service M4 → 출고전표 발행. {@link #publishFromEstimate} 와 응답 코드 매트릭스 동일.
     *
     * @param request 발행 요청 본문
     * @param idempotencyKey Idempotency-Key 헤더
     * @param callerHeader X-User-Id 헤더
     */
    @Operation(summary = "협력사 주문 → 출고전표 발행",
            description = "partner-order-service M4 의 주문 승인 → 출고전표 발행.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "신규 발행 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "멱등 재반환"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "같은 키 + 다른 본문 / 동시 발행 race"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "warehouseCode 매핑 누락 / lines 검증 실패")
    })
    @PostMapping("/from-partner-order")
    @RequirePermission(page = "slip.publish.from-partner-order", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ResponseEntity<ApiResponse<PublishSlipResponse>> publishFromPartnerOrder(
            @Valid @RequestBody PublishFromPartnerOrderRequest request,
            @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) String idempotencyKey,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        PublishSlipResponse response = slipPublishService.publishFromPartnerOrder(
                request, normalizeKey(idempotencyKey), callerOrSystem(callerHeader));
        HttpStatus status = response.idempotentReplay() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(ApiResponse.ok(response));
    }

    /**
     * 발행 출처 기준 조회 — sourceType + sourceId 조합으로 슬립 목록 반환.
     *
     * <p>주 사용처:
     * <ul>
     *   <li>호출자 retry 시점에 이미 발행되어 있는지 사전 확인</li>
     *   <li>회계 cross-check (같은 estimate 가 여러 슬립으로 발행되었는지 감사)</li>
     * </ul>
     *
     * @param sourceType ESTIMATE / PARTNER_ORDER / MANUAL / MIGRATED_ECOUNT
     * @param sourceId estimateNumber / partnerOrderId 등
     * @return 매칭된 슬립 목록 (정상적으로 0~1건)
     */
    @Operation(summary = "발행 출처 기준 조회",
            description = "sourceType + sourceId 로 발행된 슬립 조회 (idempotency 보조).")
    @GetMapping("/by-source")
    @RequirePermission(page = "slip.publish.from-estimate", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ApiResponse<List<PublishSlipResponse>> findBySource(
            @RequestParam SlipSourceType sourceType,
            @RequestParam String sourceId) {
        return ApiResponse.ok(slipPublishService.findBySource(sourceType, sourceId));
    }

    private static String normalizeKey(String idempotencyKey) {
        if (idempotencyKey == null) {
            return null;
        }
        String trimmed = idempotencyKey.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String callerOrSystem(String header) {
        return (header == null || header.isBlank()) ? "system" : header;
    }
}
