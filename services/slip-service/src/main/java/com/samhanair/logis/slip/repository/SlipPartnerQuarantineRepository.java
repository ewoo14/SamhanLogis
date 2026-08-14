package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.SlipPartnerQuarantine;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 거래처 원본 부재 전표의 격리 근거 저장소. */
public interface SlipPartnerQuarantineRepository extends JpaRepository<SlipPartnerQuarantine, UUID> {
    Optional<SlipPartnerQuarantine> findBySlipId(UUID slipId);
    List<SlipPartnerQuarantine> findAllBySlipNoInAndRestoredAtIsNull(Collection<String> slipNos);
}
