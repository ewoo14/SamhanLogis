package com.samhanair.logis.inventory.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SourceOperationJournalContractTest {

    @Test
    void journal_preserves_outcome_and_created_id_sets() {
        UUID operationId = UUID.randomUUID();
        UUID slipId = UUID.randomUUID();
        UUID lotId = UUID.randomUUID();
        SourceOperationJournal journal = SourceOperationJournal.create(
                operationId, slipId, 3L,
                JsonNodeFactory.instance.objectNode().put("goods", true),
                SourceOperationOutcome.APPLIED,
                List.of(lotId), List.of());

        assertThat(journal.getSourceOperationId()).isEqualTo(operationId);
        assertThat(journal.getSlipId()).isEqualTo(slipId);
        assertThat(journal.getSlipRevision()).isEqualTo(3L);
        assertThat(journal.getOutcome()).isEqualTo(SourceOperationOutcome.APPLIED);
        assertThat(journal.getCreatedLotIds()).containsExactly(lotId.toString());
        assertThat(journal.getCreatedInstanceIds()).isEmpty();
    }
}
