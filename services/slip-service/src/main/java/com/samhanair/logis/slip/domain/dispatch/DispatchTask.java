package com.samhanair.logis.slip.domain.dispatch;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 배차 작업 (Samhan Public Phase A) — slip-service 안 신규 도메인 (D-DB-01).
 *
 * <p>사용자 노출 식별자 = {@link #taskCode} ({@code yyyy/MM/dd-N}, daily counter).
 * UUID 는 비공개 ([feedback_uuid_no_user_visibility]).
 *
 * <p>상태 머신 — {@link DispatchTaskStatus} 참조.
 *
 * <p>Phase C (수정/취소 흐름, D-DC-01~09) — DISPATCHED 상태에서 수정/취소 요청 → 아로로지스 수락/거부 →
 * 재 dispatch 또는 취소. 4 신규 column ({@code modificationReason} / {@code rejectionReason} /
 * {@code modificationRequestedAt} / {@code modificationDecidedAt}).
 */
@Entity
@Getter
@Table(name = "dispatch_task")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DispatchTask extends BaseEntity {

    /** 협업 수정완료가 차단되는 물리 종결 단계. */
    private static final Set<DispatchTaskStatus> COLLAB_LOCKED_STATUSES =
            EnumSet.of(DispatchTaskStatus.CANCEL_ACCEPTED, DispatchTaskStatus.CANCELLED);

    private static final int MEMO_MAX_LENGTH = 1000;

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

    @Column(name = "memo", length = MEMO_MAX_LENGTH)
    private String memo;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    // ---------- Phase C (수정/취소 흐름) 신규 4 column ----------
    @Column(name = "modification_reason", length = 500)
    private String modificationReason;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @Column(name = "modification_requested_at")
    private LocalDateTime modificationRequestedAt;

    @Column(name = "modification_decided_at")
    private LocalDateTime modificationDecidedAt;

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
        this.version = 0L;
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

    /**
     * arologis 발송 ack 로 받은 Dispatch UUID 를 confirm 전 임시 기록한다.
     *
     * <p>부분 발송/재배차 루프에서 confirm 이 도착하기 전 수정·취소 요청이 다시 발생해도 arologis
     * cancel 대상이 유실되지 않도록 한다. 상태 전이는 수행하지 않는다.
     */
    public void recordPendingArologisDispatchId(UUID arologisDispatchId) {
        if (arologisDispatchId == null) {
            return;
        }
        if (this.status != DispatchTaskStatus.DRAFT && this.status != DispatchTaskStatus.DISPATCHING) {
            throw new IllegalStateException(
                    "발송 대기/진행 중인 작업만 arologisDispatchId 기록 가능 — 현재=" + this.status);
        }
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

    // ---------- Phase C 신규 전이 메서드 (D-DC-02 ~ D-DC-08) ----------

    /**
     * DISPATCHED → MODIFICATION_REQUESTED (D-DC-02). DISPATCHED 상태에서만 호출 가능.
     *
     * @param reason 배차담당자가 입력한 사유 (선택)
     */
    public void markModificationRequested(String reason) {
        if (this.status != DispatchTaskStatus.DISPATCHED) {
            throw new IllegalStateException(
                    "MODIFICATION_REQUESTED 는 DISPATCHED 에서만 가능 — 현재=" + this.status);
        }
        this.status = DispatchTaskStatus.MODIFICATION_REQUESTED;
        this.modificationReason = reason;
        this.modificationRequestedAt = LocalDateTime.now();
    }

    /**
     * MODIFICATION_REQUESTED → MODIFICATION_ACCEPTED (D-DC-04). 아로로지스 수락 시.
     * 이후 배차담당자가 편집 모드로 진입하고 {@link #markBackToDraftForRedispatch()} 로 재 [배차 완료] 시작.
     */
    public void markModificationAccepted() {
        if (this.status != DispatchTaskStatus.MODIFICATION_REQUESTED) {
            throw new IllegalStateException(
                    "MODIFICATION_ACCEPTED 는 MODIFICATION_REQUESTED 에서만 가능 — 현재=" + this.status);
        }
        this.status = DispatchTaskStatus.MODIFICATION_ACCEPTED;
        this.modificationDecidedAt = LocalDateTime.now();
    }

    /**
     * MODIFICATION_REQUESTED → MODIFICATION_REJECTED (D-DC-06). 아로로지스 거부 시.
     *
     * @param rejectionReason 아로로지스가 입력한 거부 사유
     */
    public void markModificationRejected(String rejectionReason) {
        if (this.status != DispatchTaskStatus.MODIFICATION_REQUESTED) {
            throw new IllegalStateException(
                    "MODIFICATION_REJECTED 는 MODIFICATION_REQUESTED 에서만 가능 — 현재=" + this.status);
        }
        this.status = DispatchTaskStatus.MODIFICATION_REJECTED;
        this.rejectionReason = rejectionReason;
        this.modificationDecidedAt = LocalDateTime.now();
    }

    /**
     * DISPATCHED → CANCEL_REQUESTED (D-DC-02). DISPATCHED 상태에서만 호출 가능.
     *
     * @param reason 배차담당자가 입력한 사유 (선택)
     */
    public void markCancelRequested(String reason) {
        if (this.status != DispatchTaskStatus.DISPATCHED) {
            throw new IllegalStateException(
                    "CANCEL_REQUESTED 는 DISPATCHED 에서만 가능 — 현재=" + this.status);
        }
        this.status = DispatchTaskStatus.CANCEL_REQUESTED;
        this.modificationReason = reason;
        this.modificationRequestedAt = LocalDateTime.now();
    }

    /**
     * CANCEL_REQUESTED → CANCEL_ACCEPTED (D-DC-05). 아로로지스 취소 수락 시. 정정 단계 — 이후 자동으로
     * {@link #markCancelled()} 로 final 전이.
     */
    public void markCancelAccepted() {
        if (this.status != DispatchTaskStatus.CANCEL_REQUESTED) {
            throw new IllegalStateException(
                    "CANCEL_ACCEPTED 는 CANCEL_REQUESTED 에서만 가능 — 현재=" + this.status);
        }
        this.status = DispatchTaskStatus.CANCEL_ACCEPTED;
        this.modificationDecidedAt = LocalDateTime.now();
    }

    /**
     * CANCEL_REQUESTED → CANCEL_REJECTED (D-DC-06). 아로로지스 취소 거부 시.
     *
     * @param rejectionReason 아로로지스가 입력한 거부 사유
     */
    public void markCancelRejected(String rejectionReason) {
        if (this.status != DispatchTaskStatus.CANCEL_REQUESTED) {
            throw new IllegalStateException(
                    "CANCEL_REJECTED 는 CANCEL_REQUESTED 에서만 가능 — 현재=" + this.status);
        }
        this.status = DispatchTaskStatus.CANCEL_REJECTED;
        this.rejectionReason = rejectionReason;
        this.modificationDecidedAt = LocalDateTime.now();
    }

    /**
     * CANCEL_ACCEPTED → CANCELLED (final). slip UNDISPATCHED 복귀 + arologis Dispatch soft-delete
     * 이후 호출.
     */
    public void markCancelled() {
        if (this.status != DispatchTaskStatus.CANCEL_ACCEPTED) {
            throw new IllegalStateException(
                    "CANCELLED 는 CANCEL_ACCEPTED 에서만 가능 — 현재=" + this.status);
        }
        this.status = DispatchTaskStatus.CANCELLED;
    }

    /**
     * MODIFICATION_ACCEPTED → DRAFT (D-DC-08). 배차담당자가 편집 작업 후 [배차 완료] 재 클릭 시점에 호출 →
     * 이후 {@link #markDispatching()} 가 정상 진행. arologis 측 기존 Dispatch 는 별도 soft-delete 호출
     * 로 처리 (delete-recreate, D-DC-04).
     */
    public void markBackToDraftForRedispatch() {
        if (this.status != DispatchTaskStatus.MODIFICATION_ACCEPTED) {
            throw new IllegalStateException(
                    "DRAFT 재 진입은 MODIFICATION_ACCEPTED 에서만 가능 — 현재=" + this.status);
        }
        this.status = DispatchTaskStatus.DRAFT;
        // arologisDispatchId 는 새 dispatch 발송 후 markDispatched() 에서 재 설정.
        this.arologisDispatchId = null;
    }

    /**
     * 협업 수정완료 가능 단계인지 검증한다.
     *
     * <p>배차 협업 편집은 memo 같은 soft overlay 만 허용한다. 단 취소 수락/취소 완료 상태는
     * 물리 종결 단계이므로 더 이상 1-인 수정완료로 덮어쓰지 않는다.
     */
    public void guardCollabModifiable() {
        if (COLLAB_LOCKED_STATUSES.contains(this.status)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "배차 협업 수정완료가 불가능한 상태입니다: " + this.status);
        }
    }

    /**
     * 협업 수정완료로 배차 비고를 덮어쓴다.
     *
     * @param memo 비고. null 은 비움으로 보존한다.
     * @return this
     */
    public DispatchTask overlayMemo(String memo) {
        guardCollabModifiable();
        validateOverlayLength(memo, "배차 비고", MEMO_MAX_LENGTH);
        this.memo = memo;
        return this;
    }

    private void validateOverlayLength(String value, String fieldName, int maxLength) {
        if (value != null && value.length() > maxLength) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    fieldName + "은(는) " + maxLength + "자 이하여야 합니다");
        }
    }
}
