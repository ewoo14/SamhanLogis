package com.samhanair.logis.notification.client;

import java.time.LocalDate;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * {@link SlipServiceClient} 의 빈 구현체 — slip-service 미연결 환경 / IT 격리용.
 *
 * <p>PR-E1 BE-4 단독 머지 시점에는 slip-service 측 endpoint
 * {@code test} 프로파일에서만 활성화되는 테스트 격리용 placeholder. 기본 운영 프로파일은
 * {@link RestClientSlipServiceClient}가 실제 endpoint를 호출한다.
 */
@Component
@Profile("test")
public class NoopSlipServiceClient implements SlipServiceClient {

    private static final Logger log = LoggerFactory.getLogger(NoopSlipServiceClient.class);

    @Override
    public List<OutboundSlipDto> getOutboundSlips(LocalDate from, LocalDate to) {
        log.error("NoopSlipServiceClient.getOutboundSlips — /internal/slips/outbound 구현체가 없습니다. from={}, to={}",
                from, to);
        throw new IllegalStateException("/internal/slips/outbound client is not configured");
    }
}
