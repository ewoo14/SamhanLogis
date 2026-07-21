package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import java.util.List;
import org.springframework.transaction.annotation.Transactional;

/** PostgreSQL RETURNING row를 엔티티로 매핑하는 outbox claim fragment. */
public interface SlipPublishOutboxRepositoryCustom {

    /** 원자 claim 결과 row를 반환한다. */
    @Transactional
    List<SlipPublishOutbox> claimReadyBatch(int batch, int leaseSeconds);
}
