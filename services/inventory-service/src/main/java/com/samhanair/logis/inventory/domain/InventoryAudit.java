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
import java.math.BigDecimal;
import java.time.LocalDate;
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
 * 재고 실사 마스터 (Phase 10 P2-6 슬라이스 9). 한국 일반기업회계기준 매년 12월 31일 의무 실사.
 *
 * <p>상태 머신: PLANNED → IN_PROGRESS → COMPLETED. PLANNED/IN_PROGRESS 단계에서는 CANCELLED 가능.
 * COMPLETED 시 라인의 actual_qty 와 expected_qty 차이를 합산하여 totalDiffAmount 산출 →
 * 차이 자동 분개 trigger + Stock 조정 (서비스 레이어에서 InventoryAuditCommittedEvent 발행).
 *
 * <p>차이 분개 (한국 일반기업회계기준 코드):
 * <ul>
 *   <li>차이 (+) — 차변 1462 재고자산 / 대변 9399 재고감모손실 (환입)</li>
 *   <li>차이 (-) — 차변 9399 재고감모손실 / 대변 1462 재고자산</li>
 * </ul>
 *
 * <p>BaseEntity 7 audit fields. soft-delete only.
 */
@Entity
@Getter
@Table(name = "inventory_audits")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class InventoryAudit extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "audit_no", nullable = false, length = 30)
    private String auditNo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @Column(name = "audit_date", nullable = false)
    private LocalDate auditDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private AuditStatus status;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "total_diff_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalDiffAmount;

    @OneToMany(mappedBy = "audit", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.LAZY)
    private List<InventoryAuditLine> lines = new ArrayList<>();

    private InventoryAudit(String auditNo, Warehouse warehouse, LocalDate auditDate) {
        if (warehouse == null) {
            throw new IllegalArgumentException("창고는 필수입니다");
        }
        if (auditDate == null) {
            throw new IllegalArgumentException("실사 일자는 필수입니다");
        }
        this.auditNo = auditNo;
        this.warehouse = warehouse;
        this.auditDate = auditDate;
        this.status = AuditStatus.PLANNED;
        this.totalDiffAmount = BigDecimal.ZERO;
    }

    /**
     * 새 재고 실사를 PLANNED 상태로 생성한다. snapshot 라인은 별도 addLine 으로 추가.
     *
     * @param auditNo 채번된 실사번호 (yyyy/MM/dd-N)
     * @param warehouse 대상 창고 (필수)
     * @param auditDate 실사 기준 일자 (필수)
     * @return PLANNED 상태의 신규 InventoryAudit
     * @throws IllegalArgumentException warehouse 또는 auditDate 가 null 일 때
     */
    public static InventoryAudit create(String auditNo, Warehouse warehouse, LocalDate auditDate) {
        return new InventoryAudit(auditNo, warehouse, auditDate);
    }

    /**
     * 라인 추가 — 헤더와 양방향 연관관계 유지. PLANNED 단계의 snapshot 또는 IN_PROGRESS 의 입력용.
     *
     * @param line {@link InventoryAuditLine#snapshot} 으로 생성된 라인
     */
    public void addLine(InventoryAuditLine line) {
        this.lines.add(line);
    }

    /**
     * 실사 시작 — PLANNED → IN_PROGRESS. startedAt = now().
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 PLANNED 가 아닐 때
     */
    public void start() {
        requireStatus(AuditStatus.PLANNED);
        this.status = AuditStatus.IN_PROGRESS;
        this.startedAt = LocalDateTime.now();
    }

    /**
     * 실사 완료 — IN_PROGRESS → COMPLETED. completedAt = now(). totalDiffAmount 를 라인 합으로 갱신.
     *
     * <p>이 메서드는 도메인 상태 전이만 수행한다. 차이 자동 분개 / Stock 조정 trigger 는
     * 서비스 레이어({@code InventoryAuditService.complete}) 에서 본 메서드 호출 후 별도 처리.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 IN_PROGRESS 가 아닐 때
     */
    public void complete() {
        requireStatus(AuditStatus.IN_PROGRESS);
        this.status = AuditStatus.COMPLETED;
        this.completedAt = LocalDateTime.now();
        this.totalDiffAmount = lines.stream()
                .map(InventoryAuditLine::getDiffAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * 실사 취소 — PLANNED 또는 IN_PROGRESS → CANCELLED. cancelledAt = now().
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 PLANNED/IN_PROGRESS 둘 다 아닐 때
     */
    public void cancel() {
        if (this.status != AuditStatus.PLANNED && this.status != AuditStatus.IN_PROGRESS) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "취소 가능한 상태가 아닙니다: " + this.status.getDisplayName());
        }
        this.status = AuditStatus.CANCELLED;
        this.cancelledAt = LocalDateTime.now();
    }

    /**
     * 라인 입력 가능 여부 — IN_PROGRESS 단계에서만 actual_qty 입력/수정 허용.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 IN_PROGRESS 가 아닐 때
     */
    public void requireInProgressForLineInput() {
        requireStatus(AuditStatus.IN_PROGRESS);
    }

    private void requireStatus(AuditStatus expected) {
        if (this.status != expected) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "전이 가능한 상태가 아닙니다: 현재 " + this.status.getDisplayName()
                            + ", 필요 " + expected.getDisplayName());
        }
    }
}
