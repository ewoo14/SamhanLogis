package com.samhanair.logis.slip.domain.dispatchgroup;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 차량 단위 가배차 그룹. */
@Entity
@Getter
@Table(name = "dispatch_groups")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DispatchGroup extends BaseEntity {

    @Id @GeneratedValue @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;
    @Column(name = "group_no", nullable = false, length = 50) private String groupNo;
    @Column(name = "dispatch_date", nullable = false) private LocalDate dispatchDate;
    @Column(name = "vehicle_label", nullable = false, length = 100) private String vehicleLabel;
    @Column(name = "carrier_id") private UUID carrierId;
    @Version @Column(name = "version", nullable = false) private Long version;
    @Enumerated(EnumType.STRING) @Column(name = "transfer_status", nullable = false, length = 20)
    private TransferStatus transferStatus = TransferStatus.NOT_SENT;
    @Column(name = "transferred_at") private LocalDateTime transferredAt;

    private DispatchGroup(String groupNo, LocalDate dispatchDate, String vehicleLabel) {
        if (groupNo == null || groupNo.isBlank()) throw new IllegalArgumentException("그룹 번호 필수");
        if (dispatchDate == null) throw new IllegalArgumentException("배차 지정일 필수");
        if (vehicleLabel == null || vehicleLabel.isBlank()) throw new IllegalArgumentException("차량 표시명 필수");
        this.groupNo = groupNo.trim(); this.dispatchDate = dispatchDate; this.vehicleLabel = vehicleLabel.trim();
    }

    public static DispatchGroup create(String groupNo, LocalDate dispatchDate, String vehicleLabel) {
        return new DispatchGroup(groupNo, dispatchDate, vehicleLabel);
    }

    public void update(LocalDate dispatchDate, String vehicleLabel) {
        ensureTransferEditable("수정", "아로로지스 전송 완료 그룹은 수정할 수 없습니다.");
        if (dispatchDate != null) this.dispatchDate = dispatchDate;
        if (vehicleLabel != null && !vehicleLabel.isBlank()) this.vehicleLabel = vehicleLabel.trim();
    }

    public void assignCarrier(Carrier carrier) {
        ensureTransferEditable("운송사를 변경", "아로로지스 전송 완료 그룹은 운송사를 변경할 수 없습니다.");
        if (carrier == null) { this.carrierId = null; return; }
        if (!carrier.isActive()) throw new IllegalStateException("비활성 운송사는 지정할 수 없습니다.");
        this.carrierId = carrier.getId();
    }

    public void clearCarrier() {
        ensureTransferEditable("운송사를 변경", "아로로지스 전송 완료 그룹은 운송사를 변경할 수 없습니다.");
        this.carrierId = null;
    }

    public boolean canTransferToArologis(boolean carrierActive, boolean carrierArologis, boolean hasActiveSlips) {
        return transferStatus != TransferStatus.SENT && carrierActive && carrierArologis && hasActiveSlips;
    }

    public void markTransferSent() {
        if (transferStatus == TransferStatus.SENT) return;
        transferStatus = TransferStatus.SENT;
        transferredAt = LocalDateTime.now();
    }

    public void markTransferFailed() { transferStatus = TransferStatus.FAILED; }

    /** 원격 수신 결과가 유실되어 재확인이 필요한 상태로 남긴다. */
    public void markTransferPending() {
        if (transferStatus != TransferStatus.SENT) {
            transferStatus = TransferStatus.PENDING;
            transferredAt = null;
        }
    }

    private void ensureTransferEditable(String action, String sentMessage) {
        if (transferStatus == TransferStatus.SENT) throw new IllegalStateException(sentMessage);
        if (transferStatus == TransferStatus.PENDING) {
            throw new IllegalStateException("아로로지스 전송 결과 확인 중인 그룹은 " + action + "할 수 없습니다.");
        }
    }

    public void markDeletedWithName(String userId, String actorName) {
        markDeleted(userId); // actorName은 공통 audit의 userId와 별도 표시 필드가 없어 기록 주체로 보존한다.
    }
}
