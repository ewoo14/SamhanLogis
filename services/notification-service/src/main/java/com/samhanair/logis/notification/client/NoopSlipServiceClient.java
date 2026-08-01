package com.samhanair.logis.notification.client;

import java.time.LocalDate;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

/**
 * {@link SlipServiceClient} 의 빈 구현체 — slip-service 미연결 환경 / IT 격리용.
 *
 * <p>PR-E1 BE-4 단독 머지 시점에는 slip-service 측 endpoint
 * {@code GET /internal/slips/outbound} 가 부재할 수 있으므로 운영 빌드 부팅이 깨지지 않도록 본
 * placeholder 가 default 로 활성. 실제 구현체 (RestClient 기반) 는 후속 슬라이스에서 추가하며 본
 * placeholder 는 {@link ConditionalOnMissingBean} 으로 자동 비활성화.
 */
@Component
@ConditionalOnMissingBean(value = SlipServiceClient.class, ignored = NoopSlipServiceClient.class)
public class NoopSlipServiceClient implements SlipServiceClient {

    private static final Logger log = LoggerFactory.getLogger(NoopSlipServiceClient.class);

    @Override
    public List<OutboundSlipDto> getOutboundSlips(LocalDate from, LocalDate to) {
        log.error("NoopSlipServiceClient.getOutboundSlips — /internal/slips/outbound 구현체가 없습니다. from={}, to={}",
                from, to);
        throw new IllegalStateException("/internal/slips/outbound client is not configured");
    }
}
