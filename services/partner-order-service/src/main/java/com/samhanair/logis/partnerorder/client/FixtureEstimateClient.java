package com.samhanair.logis.partnerorder.client;

import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 임시 estimate client.
 *
 * <p>현 시점에는 partner-order-service 에서 호출 가능한 estimate-service endpoint 가 없으므로 운영
 * 기본값은 미조회로 둔다. IT 는 {@code @MockBean EstimateClient} 로 실제 snapshot 계약을 검증한다.
 */
@Component
public class FixtureEstimateClient implements EstimateClient {

    @Override
    public Optional<EstimateSnapshot> findById(UUID estimateId) {
        return Optional.empty();
    }
}
