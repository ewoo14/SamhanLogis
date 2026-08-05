package com.samhanair.logis.notification.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * {@link BlockedPartnerLookupClient} 의 테스트 프로파일 전용 빈 구현체.
 *
 * <p>운영 환경에서는 {@link RestClientBlockedPartnerLookupClient}가 실제 partner-service의
 * 활성 BLOCK 행을 조회한다.
 */
@Component
@Profile("test")
public class NoopBlockedPartnerLookupClient implements BlockedPartnerLookupClient {

    private static final Logger log = LoggerFactory.getLogger(NoopBlockedPartnerLookupClient.class);

    @Override
    public boolean isBlocked(String partnerCode) {
        log.debug("NoopBlockedPartnerLookupClient.isBlocked — partnerCode={} (placeholder, false)", partnerCode);
        return false;
    }
}
