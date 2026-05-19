package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.CardMaster;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** MIG-2 카드/계좌 마스터 repository. */
public interface CardMasterRepository extends JpaRepository<CardMaster, UUID> {

    Optional<CardMaster> findByCardCodeAndIsDeletedFalse(String cardCode);

    boolean existsByCardCodeAndIsDeletedFalse(String cardCode);
}
