package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.SourceOperationOutcome;
import com.samhanair.logis.inventory.repository.SourceOperationJournalRepository;
import com.samhanair.logis.inventory.service.SourceOperationJournalWriter;
import com.samhanair.logis.inventory.web.dto.SourceOperationContext;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

/** RED-B: 같은 local transaction 롤백 시 source journal도 함께 사라지는지 검증한다. */
@SpringBootTest(classes = InventoryServiceApplication.class)
class SourceOperationJournalRollbackIT extends AbstractPostgresIT {

    @Autowired private SourceOperationJournalWriter writer;
    @Autowired private SourceOperationJournalRepository repository;
    @Autowired private TransactionTemplate transactionTemplate;

    @Test
    void journal_commit_and_rollback_share_the_same_transaction() {
        UUID committed = UUID.randomUUID();
        UUID committedSlip = UUID.randomUUID();
        transactionTemplate.executeWithoutResult(status -> writer.record(
                new SourceOperationContext(committed, committedSlip, 1L), product(),
                SourceOperationOutcome.APPLIED, List.of(), List.of()));
        assertThat(repository.countBySourceOperationId(committed)).isEqualTo(1);

        UUID rolledBack = UUID.randomUUID();
        UUID rolledBackSlip = UUID.randomUUID();
        assertThatThrownBy(() -> transactionTemplate.executeWithoutResult(status -> {
            writer.record(new SourceOperationContext(rolledBack, rolledBackSlip, 1L), product(),
                    SourceOperationOutcome.APPLIED, List.of(), List.of());
            throw new IllegalStateException("RED-B rollback probe");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(repository.countBySourceOperationId(rolledBack)).isZero();
    }

    private ProductSummary product() {
        return new ProductSummary(UUID.randomUUID(), "테스트품목", "TEST-001", "TEST-001",
                UUID.randomUUID(), BigDecimal.ONE, "ACTIVE", false, true, "SINGLE");
    }
}
