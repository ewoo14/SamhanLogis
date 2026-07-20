package com.samhanair.logis.partnerorder.scheduler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Outbox claim row의 외부 발행 orchestration.
 *
 * <p>이 클래스에는 트랜잭션을 두지 않는다. claim tx가 반환된 뒤 HTTP를 수행하고,
 * {@link SlipPublishOutboxResultWriter}가 결과별 짧은 트랜잭션을 연다. 발행 성공 후 결과 tx
 * 직전 프로세스가 죽으면 lease reaper가 row를 재claim하고 동일 idempotency-key로 재발행한다.
 * slip-service의 idempotency replay가 at-least-once 중복을 흡수한다.
 */
@Component
@RequiredArgsConstructor
public class SlipPublishOutboxProcessor {

    private final SlipServiceClient slipServiceClient;
    private final ObjectMapper objectMapper;
    private final SlipPublishOutboxResultWriter resultWriter;

    /** scheduler가 원자 claim한 단일 row를 HTTP 밖/결과 tx 분리로 처리한다. */
    public void processOne(SlipPublishOutbox claimed) {
        PublishResult result;
        try {
            Map<String, Object> payload = parsePayload(claimed.getRequestPayload());
            result = slipServiceClient.publishFromPartnerOrder(
                    payload, claimed.getIdempotencyKey());
        } catch (RuntimeException ex) {
            resultWriter.handleRetry(claimed.getId(), errorCodeOf(ex), ex.getMessage());
            return;
        }

        try {
            resultWriter.commitSuccess(claimed.getId(), result);
        } catch (RuntimeException persistenceFailure) {
            // HTTP 성공을 실패 재시도로 잘못 분류하지 않도록 별도 recovery tx에서만 PENDING 복귀한다.
            try {
                resultWriter.requeueAfterResultFailure(
                        claimed.getId(), persistenceFailure.getMessage());
            } catch (RuntimeException recoveryFailure) {
                persistenceFailure.addSuppressed(recoveryFailure);
            }
            throw persistenceFailure;
        }
    }

    private ErrorCode errorCodeOf(RuntimeException ex) {
        return ex instanceof BusinessException businessException
                ? businessException.getErrorCode()
                : null;
    }

    private Map<String, Object> parsePayload(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException ex) {
            throw new RuntimeException("outbox payload 파싱 실패: " + ex.getMessage(), ex);
        }
    }
}
