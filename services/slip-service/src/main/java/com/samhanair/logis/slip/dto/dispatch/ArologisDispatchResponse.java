package com.samhanair.logis.slip.dto.dispatch;

import java.time.Instant;
import java.util.UUID;

/**
 * arologis 의 배차 발송 ack 응답 — BE Task B8.
 *
 * <p>매칭은 비동기로 진행되며 별도 회신 endpoint
 * ({@code POST /internal/slip/dispatch-tasks/{id}/confirm|unavailable}) 으로 결과 통보.
 *
 * @param arologisDispatchId arologis 내부 Dispatch UUID (회신 시 매칭 추적용)
 * @param samhanDispatchTaskId 발송 시 전달한 Samhan Public DispatchTask UUID (echo)
 * @param acknowledgedAt arologis 수신 시각
 * @param matchingStartedAt 매칭 trigger 시각
 */
public record ArologisDispatchResponse(
        UUID arologisDispatchId,
        UUID samhanDispatchTaskId,
        Instant acknowledgedAt,
        Instant matchingStartedAt
) {}
