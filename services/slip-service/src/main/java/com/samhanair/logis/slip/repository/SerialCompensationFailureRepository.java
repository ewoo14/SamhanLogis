package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 원격 재고 보상 실패 감사 저장소.
 */
public interface SerialCompensationFailureRepository
        extends JpaRepository<SerialCompensationFailure, UUID> {
}
