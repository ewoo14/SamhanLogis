package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.slip.publish.PublishFromEstimateRequest;
import com.samhanair.logis.slip.publish.PublishSlipResponse;
import com.samhanair.logis.slip.publish.SlipPublishService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * P0-B (GAS 정합성 에픽) — 웹 estimate-app server-to-server 전용 내부 발행 endpoint.
 *
 * <p>개발책임자 결정 ② (2026-06-10): 웹 estimate-app(무인증 server-to-server)의 견적 finalize →
 * 출고전표 발행은 <b>X-Internal-Token</b> 인증모델 채택. permitAll 노출 금지, 게이트웨이 JWT
 * 경유도 비대상(estimate-app 은 자체 로그인 체계가 없는 legacy GAS UI 포팅).
 *
 * <p>경로가 {@code /internal/} prefix 라 {@code shared:security} 의
 * {@link com.samhanair.logis.security.InternalTokenFilter} 가 적용된다:
 * <ul>
 *   <li>유효 토큰({@code app.security.internal.token} = {@code SAMHAN_INTERNAL_TOKEN}) →
 *       {@code system-internal} principal + ROLE_MASTER 로 인증 → 발행 진행.</li>
 *   <li>토큰 불일치 → 401 즉시 차단 (filter).</li>
 *   <li>토큰 미제시 → 미인증 통과 후 {@code anyRequest().authenticated()} 에서 403 차단.</li>
 * </ul>
 *
 * <p>비즈니스 로직은 {@link SlipPublishController#publishFromEstimate} 와 동일하게
 * {@link SlipPublishService#publishFromEstimate} 위임 — 멱등성(Idempotency-Key)·응답 코드
 * 매트릭스(201/200/409/400)도 동일. 호출자 식별은 {@code X-Caller} 헤더(기본 {@code estimate-app}).
 */
@RestController
@RequestMapping("/internal/slips")
@RequiredArgsConstructor
public class InternalSlipPublishController {

    private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";
    private static final String CALLER_HEADER = "X-Caller";
    private static final String DEFAULT_CALLER = "estimate-app";

    private final SlipPublishService slipPublishService;

    /**
     * 견적 finalize → 출고전표 발행 (내부 토큰 게이트).
     *
     * @param request 발행 요청 본문 ({@link PublishFromEstimateRequest} — 공개 endpoint 와 동일 계약)
     * @param idempotencyKey Idempotency-Key 헤더 (선택)
     * @param callerHeader X-Caller 헤더 (선택, 기본 estimate-app)
     * @return 201 신규 / 200 멱등 재반환 / 409 충돌 / 400 검증 실패
     */
    @Operation(summary = "[내부] 견적 → 출고전표 발행 (X-Internal-Token)",
            description = "웹 estimate-app server-to-server 발행. 공개 /api/v1/slips/from-estimate 와 "
                    + "동일 계약·멱등성, 인증만 내부 토큰 게이트.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "신규 발행 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "멱등 재반환"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "같은 키 + 다른 본문 / 동시 발행 race"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "warehouseCode 매핑 누락 / lines 검증 실패"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "내부 토큰 불일치")
    })
    @PostMapping("/from-estimate")
    public ResponseEntity<ApiResponse<PublishSlipResponse>> publishFromEstimate(
            @Valid @RequestBody PublishFromEstimateRequest request,
            @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) String idempotencyKey,
            @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
        PublishSlipResponse response = slipPublishService.publishFromEstimate(
                request, normalizeKey(idempotencyKey), callerOrDefault(callerHeader));
        HttpStatus status = response.idempotentReplay() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(ApiResponse.ok(response));
    }

    private static String normalizeKey(String idempotencyKey) {
        if (idempotencyKey == null) {
            return null;
        }
        String trimmed = idempotencyKey.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String callerOrDefault(String header) {
        return (header == null || header.isBlank()) ? DEFAULT_CALLER : header;
    }
}
