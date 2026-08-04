package com.samhanair.logis.slip.domain.dispatchgroup;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 배차 그룹에 편입된 전표의 구조적 참조. */
@Entity
@Getter
@Table(name = "dispatch_group_slips")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DispatchGroupSlip extends BaseEntity {
    @Id @GeneratedValue @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false) private UUID id;
    @Column(name = "group_id", nullable = false) private UUID groupId;
    @Column(name = "slip_id", nullable = false) private UUID slipId;
    @Enumerated(EnumType.STRING) @Column(name = "inclusion_type", nullable = false, length = 20)
    private InclusionType inclusionType;
    @Column(name = "sequence", nullable = false) private int sequence;

    private DispatchGroupSlip(UUID groupId, UUID slipId, InclusionType inclusionType, int sequence) {
        if (groupId == null || slipId == null || inclusionType == null) throw new IllegalArgumentException("편입 참조 필수");
        if (sequence <= 0) throw new IllegalArgumentException("정차 순서는 1 이상");
        this.groupId = groupId; this.slipId = slipId; this.inclusionType = inclusionType; this.sequence = sequence;
    }
    public static DispatchGroupSlip create(UUID groupId, UUID slipId, InclusionType inclusionType, int sequence) {
        return new DispatchGroupSlip(groupId, slipId, inclusionType, sequence);
    }
    public void updateSequence(int sequence) {
        if (sequence <= 0) throw new IllegalArgumentException("정차 순서는 1 이상");
        this.sequence = sequence;
    }
}
