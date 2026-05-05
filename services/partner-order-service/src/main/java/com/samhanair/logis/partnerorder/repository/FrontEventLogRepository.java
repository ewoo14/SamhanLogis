package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.domain.FrontEventLog;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FrontEventLogRepository extends JpaRepository<FrontEventLog, UUID> {
}
