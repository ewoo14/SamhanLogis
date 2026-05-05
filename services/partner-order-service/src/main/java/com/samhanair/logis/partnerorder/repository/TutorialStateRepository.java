package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.domain.TutorialState;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TutorialStateRepository extends JpaRepository<TutorialState, UUID> {
    Optional<TutorialState> findByPartnerCode(String partnerCode);
}
