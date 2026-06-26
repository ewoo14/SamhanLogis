package com.samhanair.logis.notification.repository;

import com.samhanair.logis.notification.domain.PushDeviceToken;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** 푸시 디바이스 토큰 저장소 — active row 는 entity SQLRestriction 으로만 조회된다. */
@Repository
public interface PushDeviceTokenRepository extends JpaRepository<PushDeviceToken, UUID> {

    Optional<PushDeviceToken> findByToken(String token);

    List<PushDeviceToken> findAllByUserIdOrderByLastSeenAtDesc(UUID userId);
}
