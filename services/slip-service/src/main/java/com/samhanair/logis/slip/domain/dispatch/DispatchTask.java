package com.samhanair.logis.slip.domain.dispatch;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 배차 작업 (Samhan Public Phase A) — slip-service 안 신규 도메인 (D-DB-01).
 *
 * <p>사용자 노출 식별자 = {@link #taskCode} ({@code DT-YYYYMMDD-NNN}, daily counter).
 * UUID 는 비공개 ([feedback_uuid_no_user_visibility]).
 *
 * <p>상태 머신 — {@link DispatchTaskStatus} 참조.
 */
@Entity
@Getter
@Table(name = "dispatch_task")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DispatchTask extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "task_code", nullable = false, length = 32)
    private String taskCode;

    @Column(name = "dispatch_date", nullable = false)
    private LocalDate dispatchDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private DispatchTaskStatus status;

    @Column(name = "arologis_dispatch_id")
    private UUID arologisDispatchId;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    private DispatchTask(String taskCode, LocalDate dispatchDate) {
        if (taskCode == null || taskCode.isBlank()) {
            throw new IllegalArgumentException("taskCode 필수");
        }
        if (dispatchDate == null) {
            throw new IllegalArgumentException("dispatchDate 필수");
        }
        this.taskCode = taskCode;
        this.dispatchDate = dispatchDate;
        this.status = DispatchTaskStatus.DRAFT;
    }

    /** 신규 DispatchTask 생성 (DRAFT 상태). */
    public static DispatchTask create(String taskCode, LocalDate dispatchDate) {
        return new DispatchTask(taskCode, dispatchDate);
    }

    /** DRAFT → DISPATCHING (배차 완료 trigger). */
    public void markDispatching() {
        if (this.status != DispatchTaskStatus.DRAFT) {
            throw new IllegalStateException("DRAFT 만 DISPATCHING 으로 전이 가능 — 현재=" + this.status);
        }
        this.status = DispatchTaskStatus.DISPATCHING;
    }

    /** DISPATCHING → DISPATCHED (arologis confirm 회신). */
    public void markDispatched(UUID arologisDispatchId) {
        if (this.status != DispatchTaskStatus.DISPATCHING) {
            throw new IllegalStateException("DISPATCHING 만 DISPATCHED 로 전이 가능 — 현재=" + this.status);
        }
        this.status = DispatchTaskStatus.DISPATCHED;
        this.arologisDispatchId = arologisDispatchId;
    }

    /** DISPATCHING → FAILED (arologis unavailable 회신). */
    public void markFailed(String reason) {
        if (this.status != DispatchTaskStatus.DISPATCHING) {
            throw new IllegalStateException("DISPATCHING 만 FAILED 로 전이 가능 — 현재=" + this.status);
        }
        this.status = DispatchTaskStatus.FAILED;
        this.failureReason = reason;
    }
}
