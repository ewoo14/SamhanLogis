package com.samhanair.logis.partnerorder.scheduler;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link SlipPublishOutboxResultWriter} 결과 tx 메서드의 {@code @Transactional(timeout = ...)} 선언을
 * 리플렉션으로 고정한다 (#854 R5 MED).
 *
 * <p>결과 tx 상한(10초)은 소유권 가드의 {@code SELECT ... FOR UPDATE} 무한 대기를 차단하는 유일한 실효
 * 수단이다 — {@code jakarta.persistence.lock.timeout} 은 PostgreSQL 에서 no-op 이고
 * {@code lock_timeout} 서버 기본값도 무한이라, 상한은 Spring tx timeout(→ JDBC statement timeout →
 * pgjdbc cancel request) 으로만 실효화된다({@link SlipPublishOutboxResultWriter} 클래스 Javadoc 참고).
 * 값을 지우거나 바꿔도 기존 IT 는 전부 GREEN 이라 회귀를 잡지 못했다 — 값 자체를 여기서 고정한다.
 *
 * <p>실 DB/Spring 컨텍스트 없이 순수 리플렉션만 사용하므로 빠르고 결정적이다.
 */
class SlipPublishOutboxResultWriterAnnotationTest {

    /** {@link SlipPublishOutboxResultWriter} 의 private {@code RESULT_TX_TIMEOUT_SECONDS} 와 동일해야 한다. */
    private static final int EXPECTED_RESULT_TX_TIMEOUT_SECONDS = 10;

    @Test
    @DisplayName("commitSuccess/handleRetry/requeueAfterResultFailure/expireIfExhausted 는 모두 timeout=10초")
    void resultTransactionMethods_pinTenSecondTimeout() throws NoSuchMethodException {
        assertThat(timeoutOf("commitSuccess", UUID.class, PublishResult.class))
                .as("commitSuccess")
                .isEqualTo(EXPECTED_RESULT_TX_TIMEOUT_SECONDS);
        assertThat(timeoutOf("handleRetry", UUID.class, ErrorCode.class, String.class))
                .as("handleRetry")
                .isEqualTo(EXPECTED_RESULT_TX_TIMEOUT_SECONDS);
        assertThat(timeoutOf("requeueAfterResultFailure", UUID.class, String.class))
                .as("requeueAfterResultFailure")
                .isEqualTo(EXPECTED_RESULT_TX_TIMEOUT_SECONDS);
        assertThat(timeoutOf("expireIfExhausted", UUID.class))
                .as("expireIfExhausted")
                .isEqualTo(EXPECTED_RESULT_TX_TIMEOUT_SECONDS);
    }

    private int timeoutOf(String methodName, Class<?>... paramTypes) throws NoSuchMethodException {
        Transactional transactional = SlipPublishOutboxResultWriter.class
                .getMethod(methodName, paramTypes)
                .getAnnotation(Transactional.class);
        assertThat(transactional)
                .as("%s 에 @Transactional 선언이 있어야 한다", methodName)
                .isNotNull();
        return transactional.timeout();
    }
}
