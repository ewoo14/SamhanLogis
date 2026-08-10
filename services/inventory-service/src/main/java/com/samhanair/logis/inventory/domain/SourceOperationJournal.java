package com.samhanair.logis.inventory.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/** 정방향 inventory mutation 한 호출의 source 및 생성 집합을 보존하는 append-only journal. */
@Entity
@Getter
@Table(name = "source_operation_journals")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SourceOperationJournal extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "source_operation_id", nullable = false, unique = true, updatable = false)
    private UUID sourceOperationId;

    @Column(name = "slip_id")
    private UUID slipId;

    @Column(name = "slip_revision")
    private Long slipRevision;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "product_snapshot", nullable = false, columnDefinition = "jsonb")
    private JsonNode productSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(name = "outcome", nullable = false, length = 24)
    private SourceOperationOutcome outcome;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "created_lot_ids", nullable = false, columnDefinition = "jsonb")
    private List<String> createdLotIds;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "created_instance_ids", nullable = false, columnDefinition = "jsonb")
    private List<String> createdInstanceIds;

    private SourceOperationJournal(UUID sourceOperationId, UUID slipId, Long slipRevision,
                                   JsonNode productSnapshot, SourceOperationOutcome outcome,
                                   List<String> createdLotIds, List<String> createdInstanceIds) {
        this.sourceOperationId = sourceOperationId;
        this.slipId = slipId;
        this.slipRevision = slipRevision;
        this.productSnapshot = productSnapshot;
        this.outcome = outcome;
        this.createdLotIds = List.copyOf(createdLotIds);
        this.createdInstanceIds = List.copyOf(createdInstanceIds);
    }

    public static SourceOperationJournal create(UUID sourceOperationId, UUID slipId, Long slipRevision,
                                                JsonNode productSnapshot, SourceOperationOutcome outcome,
                                                List<UUID> createdLotIds, List<UUID> createdInstanceIds) {
        return new SourceOperationJournal(sourceOperationId, slipId, slipRevision, productSnapshot, outcome,
                createdLotIds.stream().map(UUID::toString).toList(),
                createdInstanceIds.stream().map(UUID::toString).toList());
    }
}
