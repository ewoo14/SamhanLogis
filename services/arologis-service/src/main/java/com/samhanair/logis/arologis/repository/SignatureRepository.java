package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.Signature;
import com.samhanair.logis.arologis.domain.SignatureSource;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Signature 저장소 — stop 단위 서명 lookup.
 */
@Repository
public interface SignatureRepository extends JpaRepository<Signature, UUID> {

    List<Signature> findAllByStopIdOrderByCapturedAtDesc(UUID stopId);

    Optional<Signature> findByStopIdAndSource(UUID stopId, SignatureSource source);
}
