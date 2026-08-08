package com.samhanair.logis.inventory.service;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.SourceOperationJournal;
import com.samhanair.logis.inventory.domain.SourceOperationOutcome;
import com.samhanair.logis.inventory.repository.SourceOperationJournalRepository;
import com.samhanair.logis.inventory.web.dto.SourceOperationContext;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** 정방향 mutation transaction 안에서 source journal 한 행을 기록한다. */
@Component
@RequiredArgsConstructor
public class SourceOperationJournalWriter {
    private final SourceOperationJournalRepository repository;

    public void record(SourceOperationContext context, ProductSummary product,
                       SourceOperationOutcome outcome, List<UUID> createdLotIds,
                       List<UUID> createdInstanceIds) {
        SourceOperationContext safe = context == null ? new SourceOperationContext(null, null, null) : context;
        repository.save(SourceOperationJournal.create(
                safe.operationIdOrGenerate(), safe.slipId(), safe.slipRevision(), snapshot(product), outcome,
                createdLotIds, createdInstanceIds));
    }

    private ObjectNode snapshot(ProductSummary product) {
        ObjectNode node = JsonNodeFactory.instance.objectNode();
        if (product != null) {
            node.put("goods", product.goods());
            node.put("productType", product.productType());
            node.put("serialManaged", product.serialManaged());
            node.put("productCode", product.productCode());
        }
        return node;
    }
}
