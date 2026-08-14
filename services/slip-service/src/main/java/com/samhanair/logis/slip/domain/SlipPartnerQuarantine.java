package com.samhanair.logis.slip.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 거래처 원본 부재로 격리한 전표의 원본 식별자와 복원 근거를 보존하는 감사 행. */
@Entity
@Getter
@Table(name = "slip_partner_integrity_quarantine")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SlipPartnerQuarantine extends BaseEntity {
    @Id @GeneratedValue @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;
    @Column(name = "slip_id", nullable = false) private UUID slipId;
    @Column(name = "slip_no", nullable = false, length = 30) private String slipNo;
    @Column(name = "partner_id", nullable = false) private UUID partnerId;
    @Column(name = "partner_code", length = 50) private String partnerCode;
    @Column(name = "slip_status", nullable = false, length = 20) private String slipStatus;
    @Column(name = "reason", nullable = false, columnDefinition = "TEXT") private String reason;
    @Column(name = "source", nullable = false, length = 40) private String source;
    @Column(name = "restored_at") private LocalDateTime restoredAt;
    @Column(name = "restored_by", length = 50) private String restoredBy;
    @Column(name = "restored_partner_code", length = 50) private String restoredPartnerCode;

    /** backfill 실패 입력을 삭제 없이 감사 가능한 격리 근거로 캡처한다. */
    public static SlipPartnerQuarantine capture(Slip slip, String reason) {
        if (slip.getPartnerId() == null) throw new IllegalArgumentException("격리 대상은 partnerId가 필요합니다");
        if (reason == null || reason.isBlank()) throw new IllegalArgumentException("격리 사유가 필요합니다");
        SlipPartnerQuarantine evidence = new SlipPartnerQuarantine();
        evidence.slipId = slip.getId(); evidence.slipNo = slip.getSlipNo();
        evidence.partnerId = slip.getPartnerId(); evidence.partnerCode = slip.getPartnerCode();
        evidence.slipStatus = slip.getStatus().name(); evidence.reason = reason.trim();
        evidence.source = "BACKFILL_UNRESOLVED";
        return evidence;
    }

    /** 거래처 복구 후 확인된 코드로 감사 행을 닫는다. */
    public void markRestored(String actor, String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) throw new IllegalArgumentException("복원 partnerCode가 필요합니다");
        restoredAt = LocalDateTime.now(); restoredBy = actor; restoredPartnerCode = partnerCode.trim();
    }
}
