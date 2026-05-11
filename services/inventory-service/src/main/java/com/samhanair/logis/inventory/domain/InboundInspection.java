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
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
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
 * 입고 검수 헤더 — P0-9 검수 UI 슬라이스.
 *
 * <p>slip-service 의 INBOUND 전표 1건당 1건의 검수 레코드가 생성된다.
 * {@link #slipId} 는 slip-service 의 Slip UUID 로 logical reference (FK 미강제 — MSA 경계).
 * {@link #slipNo} 는 UUID 비공개 가드 의무 준수를 위한 사용자 노출 식별자 snapshot.
 *
 * <p>상태 머신:
 * <pre>
 *   PENDING → (inspect 저장) → PENDING (검수 결과만 기록, 상태 불변)
 *   PENDING → complete() → COMPLETED (재고 반영 후)
 *   PENDING → cancel()  → CANCELED
 * </pre>
 *
 * <p>낙관적 락({@link Version}) 으로 동시 complete 호출 충돌을 방지한다.
 * {@link #stockApplied} 플래그로 중복 재고 반영을 방지한다.
 *
 * <p>BaseEntity 7 audit fields. soft-delete only.
 */
@Entity
@Getter
@Table(name = "inbound_inspections")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class InboundInspection extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** slip-service Slip UUID — logical reference (FK 미강제). */
    @Column(name = "slip_id", nullable = false)
    private UUID slipId;

    /**
     * 슬립번호 snapshot — UUID 비공개 가드 의무 준수.
     * 사용자 노출 식별자 (예: 2025/01/10-001).
     */
    @Column(name = "slip_no", length = 30)
    private String slipNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private InspectionStatus status;

    /** 검수 담당자 user-id (검수 결과 저장 시 기입). */
    @Column(name = "inspector_id", length = 50)
    private String inspectorId;

    /** 검수 완료 일시. */
    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    /**
     * 재고 반영 여부 — {@link #complete()} 성공 시 true.
     * idempotent 가드: true 이면 중복 complete() 호출 차단.
     */
    @Column(name = "stock_applied", nullable = false)
    private boolean stockApplied;

    @OneToMany(mappedBy = "inspection", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.LAZY)
    private List<InboundInspectionLine> lines = new ArrayList<>();

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    /**
     * 새 입고 검수를 PENDING 상태로 생성한다.
     *
     * <p>{@code id} 는 팩토리 호출 시점에 {@link UUID#randomUUID()} 로 미리 할당된다.
     * JPA 영속화 시 {@code @UuidGenerator} 가 이미 할당된 id 를 재사용하므로 동작이 일관된다.
     * 단위 테스트에서 DB 없이 {@code getId()} 를 참조해도 null 이 아닌 것이 보장된다.
     *
     * @param slipId  slip-service Slip UUID (logical reference)
     * @param slipNo  슬립번호 snapshot (UUID 비공개 가드)
     * @return PENDING 상태의 신규 InboundInspection (영속화 전, id 미리 할당)
     * @throws IllegalArgumentException slipId 가 null 일 때
     */
    public static InboundInspection create(UUID slipId, String slipNo) {
        if (slipId == null) {
            throw new IllegalArgumentException("slipId 는 필수입니다");
        }
        InboundInspection inspection = new InboundInspection();
        inspection.id = UUID.randomUUID();   // 단위 테스트 / 서비스 레이어 양쪽 null-safe 보장
        inspection.slipId = slipId;
        inspection.slipNo = slipNo;
        inspection.status = InspectionStatus.PENDING;
        inspection.stockApplied = false;
        inspection.version = 0L;
        return inspection;
    }

    /**
     * 검수 라인을 추가하고 양방향 연관관계를 유지한다.
     *
     * @param line {@link InboundInspectionLine#create} 로 생성된 라인
     */
    public void addLine(InboundInspectionLine line) {
        this.lines.add(line);
    }

    /**
     * 검수 결과를 일괄 저장한다 — PENDING 상태에서만 허용.
     * 라인 상태를 업데이트하고 inspectorId 를 기입한다. 상태는 PENDING 유지.
     *
     * @param inspectorId 검수 담당자 user-id
     * @throws BusinessException(CONFLICT) 현재 상태가 PENDING 이 아닐 때
     */
    public void recordInspectorId(String inspectorId) {
        requirePending();
        this.inspectorId = inspectorId;
    }

    /**
     * 검수 완료 처리 — PENDING → COMPLETED.
     * {@link #stockApplied} 가 이미 true 이면 멱등 처리로 즉시 반환.
     * completedAt = now().
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 PENDING 이 아닐 때
     * @throws BusinessException(CONFLICT) 검수 결과가 모든 라인에 입력되지 않았을 때
     */
    public void complete() {
        requirePending();
        boolean allFilled = lines.stream()
                .allMatch(l -> l.getInspectedQty() != null);
        if (!allFilled) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "검수 결과가 입력되지 않은 라인이 있습니다. 모든 라인의 검수 수량을 입력해주세요.");
        }
        this.status = InspectionStatus.COMPLETED;
        this.completedAt = LocalDateTime.now();
    }

    /**
     * 재고 반영 완료 마킹 — {@link #complete()} 호출 후 서비스 레이어에서 재고 반영이 완료된 뒤 호출.
     *
     * @throws BusinessException(CONFLICT) 이미 재고 반영이 완료된 경우 (중복 반영 차단)
     */
    public void markStockApplied() {
        if (this.stockApplied) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 재고가 반영된 검수입니다");
        }
        this.stockApplied = true;
    }

    /**
     * 검수 취소 — PENDING → CANCELED.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 PENDING 이 아닐 때
     */
    public void cancel() {
        requirePending();
        this.status = InspectionStatus.CANCELED;
    }

    private void requirePending() {
        if (this.status != InspectionStatus.PENDING) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "PENDING 상태에서만 가능합니다: 현재 상태 = " + this.status);
        }
    }
}
