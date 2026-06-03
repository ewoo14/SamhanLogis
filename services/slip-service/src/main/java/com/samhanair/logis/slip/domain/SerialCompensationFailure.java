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

    /**
     * 보상 실패가 발생한 시각. REQUIRES_NEW 독립 커밋 지연으로 BaseEntity {@code createdAt}
     * (DB 삽입 시각) 과 미세하게 달라질 수 있어 별도 보존한다.
     */
    @Column(name = "occurred_at", nullable = false)
    private LocalDateTime occurredAt;

    /** 자동 재시도 누적 횟수. max-retries 도달 시 후보에서 제외(수동 정합 대상 유지). (D-SER-27) */
    @Column(name = "retry_count", nullable = false)
    private int retryCount;

    /** 마지막 자동 재시도 시각 (운영 가시성). */
    @Column(name = "last_retry_at")
    private LocalDateTime lastRetryAt;

    /** 다음 자동 재시도 가능 시각 (지수 백오프). NULL 이면 즉시 후보. */
    @Column(name = "next_retry_at")
    private LocalDateTime nextRetryAt;

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
        // ProductSummary 레거시 생성자가 productCode=null 을 반환할 수 있어 NOT NULL 제약 위반이
        // 감사 저장 단계에서 suppressed 로 묻히기 전에 조기 fail-fast 한다.
        if (productCode == null || productCode.isBlank()) {
            throw new IllegalArgumentException("productCode 는 필수입니다");
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
        this.retryCount = 0;
        this.lastRetryAt = null;
        this.nextRetryAt = null;
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

    /**
     * 운영자가 수동 재고 정합을 완료했음을 표시한다.
     *
     * <p>감사 행 자체는 append-only 이지만 {@code resolved} 는 복구 워크플로우의 운영 상태이므로
     * 명시 전이를 허용한다. 이미 해소된 행이면 멱등 no-op 으로 둔다.
     */
    public void resolve() {
        if (this.resolved) {
            return;
        }
        this.resolved = true;
    }

    /**
     * 자동 재시도가 성공해 보상이 정합됐음을 표시한다. (D-SER-27)
     *
     * <p>마지막 재시도 시각을 기록하고 {@link #resolve()} 로 해소 처리한다. next_retry_at 은
     * 더 이상 의미가 없으므로 비운다.
     *
     * @param retriedAt 재시도 성공 시각
     */
    public void recordRetrySuccess(LocalDateTime retriedAt) {
        this.retryCount += 1;
        this.lastRetryAt = retriedAt;
        this.nextRetryAt = null;
        resolve();
    }

    /**
     * 자동 재시도가 실패했음을 기록하고 다음 재시도 시각(백오프)을 설정한다. (D-SER-27)
     *
     * <p>append-only 본문은 불변이며 재시도 상태만 갱신한다. resolved 는 그대로 false 로 둔다.
     *
     * @param retriedAt 재시도 시도 시각
     * @param nextRetryAt 다음 재시도 가능 시각(지수 백오프)
     */
    public void recordRetryFailure(LocalDateTime retriedAt, LocalDateTime nextRetryAt) {
        this.retryCount += 1;
        this.lastRetryAt = retriedAt;
        this.nextRetryAt = nextRetryAt;
    }

    /**
     * 보존기간이 지난 해소 완료 감사 행을 soft-delete 한다.
     *
     * <p>미해소({@code resolved=false}) 행은 운영 복구 단서이므로 정리 대상이 될 수 없다.
     * 호출자는 retention 후보 조회에서 resolved=true 를 보장해야 하며, 본 메서드는
     * {@link BaseEntity#markDeleted(String)} 에만 위임해 audit 7필드 일관성을 유지한다.
     *
     * @param actor 정리 수행자 식별자
     */
    public void softDelete(String actor) {
        markDeleted(actor);
    }
}
