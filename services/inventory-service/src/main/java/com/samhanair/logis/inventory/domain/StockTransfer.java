package com.samhanair.logis.inventory.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 이동전표 헤더 (plan §3 Inventory transfer 워크플로우).
 *
 * <p>상태 머신: REQUESTED → PENDING_APPROVAL → APPROVED → SHIPPED → IN_TRANSIT → RECEIVED → CONFIRMED.
 * REJECTED / CANCELED 는 종착. 가상창고가 source 또는 destination 이면 SHIPPED 후 IN_TRANSIT 단계
 * 스킵하고 즉시 RECEIVED 까지 자동 진행 — {@link #ship()} 호출 시 처리.
 *
 * <p>상태 전이 규칙은 메서드 안에서 강제 (불일치 시 BusinessException(CONFLICT)).
 */
@Entity
@Getter
@Table(name = "stock_transfers")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class StockTransfer extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "transfer_no", nullable = false, length = 30)
    private String transferNo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_warehouse_id", nullable = false)
    private Warehouse sourceWarehouse;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "destination_warehouse_id", nullable = false)
    private Warehouse destinationWarehouse;

    @Enumerated(EnumType.STRING)
    @Column(name = "reason", nullable = false, length = 20)
    private TransferReason reason;

    @Column(name = "reason_detail", length = 500)
    private String reasonDetail;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private TransferStatus status;

    @Column(name = "requester_id", nullable = false, length = 50)
    private String requesterId;

    @Column(name = "approver_id", length = 50)
    private String approverId;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "shipped_at")
    private LocalDateTime shippedAt;

    @Column(name = "received_at")
    private LocalDateTime receivedAt;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    @OneToMany(mappedBy = "transfer", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.LAZY)
    private List<StockTransferLine> lines = new ArrayList<>();

    private StockTransfer(String transferNo, Warehouse sourceWarehouse, Warehouse destinationWarehouse,
                          TransferReason reason, String reasonDetail, String requesterId) {
        if (sourceWarehouse == null || destinationWarehouse == null) {
            throw new IllegalArgumentException("출발/도착 창고는 필수입니다");
        }
        if (sourceWarehouse.getId() != null && sourceWarehouse.getId().equals(destinationWarehouse.getId())) {
            throw new IllegalArgumentException("출발 창고와 도착 창고가 동일할 수 없습니다");
        }
        this.transferNo = transferNo;
        this.sourceWarehouse = sourceWarehouse;
        this.destinationWarehouse = destinationWarehouse;
        this.reason = reason;
        this.reasonDetail = reasonDetail;
        this.requesterId = requesterId;
        this.status = TransferStatus.REQUESTED;
        this.requestedAt = LocalDateTime.now();
    }

    /**
     * 새 이동전표 헤더를 REQUESTED 상태로 생성한다. requestedAt = now().
     * source 와 destination 동일 시 IllegalArgumentException.
     *
     * @param transferNo 채번된 이동번호 (YYYY/MM/DD-N, 메뉴/업무 타입 단위 독립 순번)
     * @param sourceWarehouse 출발 창고 (필수)
     * @param destinationWarehouse 도착 창고 (필수, source 와 달라야 함)
     * @param reason 이동 사유 (enum)
     * @param reasonDetail 사유 상세 (선택, 최대 500자)
     * @param requesterId 신청자 user-id
     * @return REQUESTED 상태의 신규 StockTransfer (라인은 별도 addLine 으로 추가)
     * @throws IllegalArgumentException source/destination null 이거나 동일 ID 일 때
     */
    public static StockTransfer create(String transferNo,
                                       Warehouse sourceWarehouse, Warehouse destinationWarehouse,
                                       TransferReason reason, String reasonDetail,
                                       String requesterId) {
        return new StockTransfer(transferNo, sourceWarehouse, destinationWarehouse,
                reason, reasonDetail, requesterId);
    }

    /**
     * 라인 추가 — 헤더와 양방향 연관관계 유지.
     *
     * @param line StockTransferLine.create 로 생성된 라인 (transfer 참조 이미 설정)
     */
    public void addLine(StockTransferLine line) {
        this.lines.add(line);
    }

    /**
     * 결재 대기로 전환 — REQUESTED → PENDING_APPROVAL.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 REQUESTED 가 아닐 때
     */
    public void submitForApproval() {
        requireStatus(TransferStatus.REQUESTED);
        this.status = TransferStatus.PENDING_APPROVAL;
    }

    /**
     * 결재 승인 — REQUESTED 또는 PENDING_APPROVAL → APPROVED. approverId / approvedAt 기록.
     *
     * @param approverId 승인자 user-id
     * @throws BusinessException(CONFLICT) 현재 상태가 REQUESTED/PENDING_APPROVAL 둘 다 아닐 때
     */
    public void approve(String approverId) {
        if (this.status != TransferStatus.REQUESTED && this.status != TransferStatus.PENDING_APPROVAL) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "승인 가능한 상태가 아닙니다: " + this.status.getDisplayName());
        }
        this.status = TransferStatus.APPROVED;
        this.approverId = approverId;
        this.approvedAt = LocalDateTime.now();
    }

    /**
     * 결재 반려 — REQUESTED 또는 PENDING_APPROVAL → REJECTED. reasonText 가 있으면 reasonDetail 갱신.
     *
     * @param approverId 반려자 user-id
     * @param reasonText 반려 사유 (null 이면 기존 reasonDetail 보존)
     * @throws BusinessException(CONFLICT) 현재 상태가 REQUESTED/PENDING_APPROVAL 둘 다 아닐 때
     */
    public void reject(String approverId, String reasonText) {
        if (this.status != TransferStatus.REQUESTED && this.status != TransferStatus.PENDING_APPROVAL) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "반려 가능한 상태가 아닙니다: " + this.status.getDisplayName());
        }
        this.status = TransferStatus.REJECTED;
        this.approverId = approverId;
        this.reasonDetail = reasonText == null ? this.reasonDetail : reasonText;
    }

    /**
     * 출하 — APPROVED → SHIPPED. shippedAt 기록. source/destination 한쪽이라도 가상창고면
     * IN_TRANSIT 단계 스킵하고 즉시 RECEIVED 까지 점프 (receivedAt = shippedAt).
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 APPROVED 가 아닐 때
     */
    public void ship() {
        requireStatus(TransferStatus.APPROVED);
        this.shippedAt = LocalDateTime.now();
        if (sourceWarehouse.isVirtual() || destinationWarehouse.isVirtual()) {
            this.status = TransferStatus.RECEIVED;
            this.receivedAt = this.shippedAt;
        } else {
            this.status = TransferStatus.SHIPPED;
        }
    }

    /**
     * 운송 중 표시 — SHIPPED → IN_TRANSIT (실물 창고 간 이동에 한함).
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 SHIPPED 가 아닐 때
     */
    public void markInTransit() {
        requireStatus(TransferStatus.SHIPPED);
        this.status = TransferStatus.IN_TRANSIT;
    }

    /**
     * 입고 — SHIPPED 또는 IN_TRANSIT → RECEIVED. receivedAt 기록.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 SHIPPED/IN_TRANSIT 둘 다 아닐 때
     */
    public void receive() {
        if (this.status != TransferStatus.SHIPPED && this.status != TransferStatus.IN_TRANSIT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "입고 가능한 상태가 아닙니다: " + this.status.getDisplayName());
        }
        this.status = TransferStatus.RECEIVED;
        this.receivedAt = LocalDateTime.now();
    }

    /**
     * 입고 확정 — RECEIVED → CONFIRMED. confirmedAt 기록. approverId 가 null 이 아니면 갱신.
     *
     * @param approverId 확정자 user-id (null 이면 기존 approverId 보존)
     * @throws BusinessException(CONFLICT) 현재 상태가 RECEIVED 가 아닐 때
     */
    public void confirm(String approverId) {
        requireStatus(TransferStatus.RECEIVED);
        this.status = TransferStatus.CONFIRMED;
        this.confirmedAt = LocalDateTime.now();
        if (approverId != null) {
            this.approverId = approverId;
        }
    }

    /**
     * 취소 — REQUESTED / PENDING_APPROVAL / APPROVED 단계에서만 가능 → CANCELED.
     * SHIPPED 이후는 운영상 회수 절차가 필요하므로 별도 (현 슬라이스 미구현).
     *
     * @param callerId 취소자 user-id (null 이면 기존 approverId 보존)
     * @throws BusinessException(CONFLICT) 현재 상태가 취소 가능 단계 밖일 때
     */
    public void cancel(String callerId) {
        if (this.status != TransferStatus.REQUESTED
                && this.status != TransferStatus.PENDING_APPROVAL
                && this.status != TransferStatus.APPROVED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "취소 가능한 상태가 아닙니다: " + this.status.getDisplayName());
        }
        this.status = TransferStatus.CANCELED;
        if (callerId != null) {
            this.approverId = callerId;
        }
    }

    /**
     * 가상창고 IN_TRANSIT 스킵 여부 — source 또는 destination 한쪽이라도 가상이면 true.
     *
     * @return ship() 호출 시 즉시 RECEIVED 로 점프하는지 여부
     */
    public boolean isVirtualSkip() {
        return sourceWarehouse.isVirtual() || destinationWarehouse.isVirtual();
    }

    private void requireStatus(TransferStatus expected) {
        if (this.status != expected) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "전이 가능한 상태가 아닙니다: 현재 " + this.status.getDisplayName()
                            + ", 필요 " + expected.getDisplayName());
        }
    }
}
