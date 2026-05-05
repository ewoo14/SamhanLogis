package com.samhanair.logis.partnerorder.domain;

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

/**
 * 튜토리얼 완료 상태 (legacy saveTutorialState 9423 → 본 entity). M2 partner-auth-service 의
 * mirror — partner-order-service 도 자체 보관해 cross-device 동기화 + 빠른 조회.
 *
 * <p>partnerCode UNIQUE — 거래처당 1 row.
 */
@Entity
@Getter
@Table(name = "partner_tutorial_state")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class TutorialState extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "partner_code", nullable = false, length = 50, unique = true)
    private String partnerCode;

    /** legacy 의 endTut 결과 — true 시 튜토리얼 모달 표시 안 함. */
    @Column(name = "completed", nullable = false)
    private boolean completed;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    private TutorialState(String partnerCode, boolean completed) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new IllegalArgumentException("partnerCode 필수");
        }
        this.partnerCode = partnerCode;
        this.completed = completed;
        if (completed) {
            this.completedAt = LocalDateTime.now();
        }
    }

    /** 신규 TutorialState (보통 completed=true 단일 PATCH 로 생성). */
    public static TutorialState of(String partnerCode, boolean completed) {
        return new TutorialState(partnerCode, completed);
    }

    /** 상태 토글 (보통 false → true). */
    public void mark(boolean completed) {
        this.completed = completed;
        this.completedAt = completed ? LocalDateTime.now() : null;
    }
}
