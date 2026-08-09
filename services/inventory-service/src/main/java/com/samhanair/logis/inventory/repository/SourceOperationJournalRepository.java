package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.SourceOperationJournal;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SourceOperationJournalRepository extends JpaRepository<SourceOperationJournal, UUID> {
    long countBySourceOperationId(UUID sourceOperationId);
}
