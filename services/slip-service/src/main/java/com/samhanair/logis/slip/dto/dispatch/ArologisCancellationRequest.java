package com.samhanair.logis.slip.dto.dispatch;

import java.util.UUID;

/**
 * Samhan Public → arologis 취소 요청 outbound payload — Phase C (BE Task B2).
 *
 * <p>전송 endpoint: {@code POST /internal/arologis/dispatches/{arologisDispatchId}/cancellation-request}
 * (X-Internal-Token).
 *
 * @param samhanDispatchTaskId Samhan Public 의 DispatchTask UUID (회신 시 멱등 키)
 * @param reason 배차담당자가 입력한 사유 (선택)
 */
public record ArologisCancellationRequest(UUID samhanDispatchTaskId, String reason) {}
