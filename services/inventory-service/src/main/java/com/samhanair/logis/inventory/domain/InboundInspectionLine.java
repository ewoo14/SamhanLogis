package com.samhanair.logis.inventory.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 입고 검수 라인 — P0-9 검수 UI 슬라이스.
 *
 * <p>slip-service 의 SlipLine UUID 를 {@link #slipLineId} 로 logical reference 한다 (FK 미강제 — MSA 경계).
 * 라인 단위로 실제 검수 수량({@link #inspectedQty}) 과 불량 수량({@link #defectQty}) 을 기록한다.
 *
 * <p>정상 수량 = {@code inspectedQty - defectQty} — 검수 완료 시 이 값이 재고에 반영된다.
 *
 * <p>불량 수량이 없으면 {@link #defectQty} 는 0, {@link #defectReason} 은 null.
 */
@Entity
@Getter
@Table(name = "inbound_inspection_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class InboundInspectionLine extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inspection_id", nullable = false)
    private InboundInspection inspection;

    /** slip-service 의 SlipLine UUID — logical reference (FK 미강제). */
    @Column(name = "slip_line_id", nullable = false)
    private UUID slipLineId;

    /** 모델코드 snapshot — UUID 비공개 가드, 사용자 노출 식별자. */
    @Column(name = "model_code", length = 100)
    private String modelCode;

    /** 제품명 snapshot. */
    @Column(name = "product_name", length = 200)
    private String productName;

    /** 슬립 수량 (검수 기준 수량). */
    @Column(name = "expected_qty", nullable = false)
    private int expectedQty;

    /** 실제 검수 수량 — 검수 결과 저장 전 null. */
    @Column(name = "inspected_qty")
    private Integer inspectedQty;

    /** 불량 수량 — 불량 없으면 0. */
    @Column(name = "defect_qty")
    private Integer defectQty;

    /** 불량 사유 — 불량 없으면 null. */
    @Column(name = "defect_reason", length = 500)
    private String defectReason;

    /**
     * 검수 라인을 생성한다 — 슬립 라인의 snapshot 정보를 받아 초기화.
     *
     * @param inspection  헤더 엔티티 (영속 상태)
     * @param slipLineId  slip-service 의 SlipLine UUID (logical reference)
     * @param modelCode   모델코드 snapshot (선택)
     * @param productName 제품명 snapshot (선택)
     * @param expectedQty 슬립 수량 (0 이상)
     * @return 영속화 전 InboundInspectionLine 인스턴스
     */
    public static InboundInspectionLine create(InboundInspection inspection,
                                               UUID slipLineId,
                                               String modelCode,
                                               String productName,
                                               int expectedQty) {
        InboundInspectionLine line = new InboundInspectionLine();
        line.inspection = inspection;
        line.slipLineId = slipLineId;
        line.modelCode = modelCode;
        line.productName = productName;
        line.expectedQty = Math.max(0, expectedQty);
        line.defectQty = 0;
        return line;
    }

    /**
     * 검수 결과를 기록한다. 도메인 메서드 — setter 직접 호출 금지.
     *
     * <p>규칙:
     * <ul>
     *   <li>{@code inspectedQty} 는 0 이상이어야 한다.</li>
     *   <li>{@code defectQty} 는 0 이상, {@code inspectedQty} 이하여야 한다.</li>
     * </ul>
     *
     * @param inspectedQty 실제 검수 수량 (0 이상)
     * @param defectQty    불량 수량 (0 이상, inspectedQty 이하)
     * @param defectReason 불량 사유 (defectQty > 0 이면 권장, 최대 500자)
     * @throws BusinessException(INVALID_INPUT) 수량 규칙 위반 시
     */
    public void recordResult(int inspectedQty, int defectQty, String defectReason) {
        if (inspectedQty < 0) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "검수 수량은 0 이상이어야 합니다");
        }
        if (defectQty < 0 || defectQty > inspectedQty) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "불량 수량은 0 이상이며 검수 수량(" + inspectedQty + ") 이하여야 합니다");
        }
        this.inspectedQty = inspectedQty;
        this.defectQty = defectQty;
        this.defectReason = defectReason;
    }

    /**
     * 정상 수량을 반환한다 — {@code inspectedQty - defectQty}.
     * 검수 결과 미입력 시 0 반환.
     *
     * @return 재고에 반영할 정상 수량 (0 이상)
     */
    public int normalQty() {
        if (inspectedQty == null) {
            return 0;
        }
        return inspectedQty - (defectQty == null ? 0 : defectQty);
    }
}
