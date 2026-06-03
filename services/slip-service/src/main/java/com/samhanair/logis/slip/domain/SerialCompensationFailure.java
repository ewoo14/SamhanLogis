package com.samhanair.logis.slip.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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

/**
 * 원격 재고 보상 실패 감사 행.
 *
 * <p>slip 트랜잭션이 원본 inventory 실패로 롤백되더라도 보상 실패 사실은 운영 복구 단서로
 * 남아야 하므로 {@link com.samhanair.logis.slip.service.CompensationAuditWriter} 가
 * 별도 트랜잭션으로 append-only 저장한다. 사용자 노출 식별자는 {@code productCode/slipNo}
 * 만 보존하고 시리얼 인스턴스 UUID 는 저장하지 않는다.
 */
@Entity
@Getter
@Table(name = "serial_compensation_failures")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SerialCompensationFailure extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "slip_id", nullable = false)
    private UUID slipId;

    @Column(name = "slip_no", nullable = false, length = 64)
    private String slipNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "slip_type", nullable = false, length = 32)
    private SlipType slipType;

    @Enumerated(EnumType.STRING)
    @Column(name = "phase", nullable = false, length = 32)
    private CompensationPhase phase;

    @Column(name = "product_code", nullable = false, length = 64)
    private String productCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "attempted_operation", nullable = false, length = 32)
    private CompensationOperation attemptedOperation;

    @Column(name = "failure_reason", nullable = false, length = 1000)
    private String failureReason;

    @Column(name = "original_failure_reason", nullable = false, length = 1000)
    private String originalFailureReason;

    @Column(name = "resolved", nullable = false)
    private boolean resolved;

    @Column(name = "occurred_at", nullable = false)
    private LocalDateTime occurredAt;

    private SerialCompensationFailure(Slip slip, CompensationPhase phase, String productCode,
                                      CompensationOperation attemptedOperation, String failureReason,
                                      String originalFailureReason, LocalDateTime occurredAt) {
        if (slip == null) {
            throw new IllegalArgumentException("slip 은 필수입니다");
        }
        if (phase == null) {
            throw new IllegalArgumentException("phase 는 필수입니다");
        }
        if (attemptedOperation == null) {
            throw new IllegalArgumentException("attemptedOperation 은 필수입니다");
        }
        if (occurredAt == null) {
            throw new IllegalArgumentException("occurredAt 은 필수입니다");
        }
        this.slipId = slip.getId();
        this.slipNo = slip.getSlipNo();
        this.slipType = slip.getSlipType();
        this.phase = phase;
        this.productCode = productCode;
        this.attemptedOperation = attemptedOperation;
        this.failureReason = failureReason;
        this.originalFailureReason = originalFailureReason;
        this.resolved = false;
        this.occurredAt = occurredAt;
    }

    /**
     * 보상 실패 감사 행을 생성한다.
     *
     * @param slip 원본 전표
     * @param phase 보상 흐름 단계
     * @param productCode 보상 대상 품목 코드
     * @param attemptedOperation 실패한 보상 동작
     * @param failureReason 보상 예외 요약
     * @param originalFailureReason 원본 예외 요약
     * @param occurredAt 보상 실패 발생 시각
     * @return persist 직전 감사 엔티티
     */
    public static SerialCompensationFailure of(Slip slip, CompensationPhase phase, String productCode,
                                               CompensationOperation attemptedOperation,
                                               String failureReason, String originalFailureReason,
                                               LocalDateTime occurredAt) {
        return new SerialCompensationFailure(slip, phase, productCode, attemptedOperation,
                failureReason, originalFailureReason, occurredAt);
    }
}
