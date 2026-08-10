package com.samhanair.logis.common.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import java.time.LocalDateTime;
import lombok.Getter;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/** Audit-aware mapped superclass providing soft-delete + JPA auditing fields per plan §8. */
@Getter
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @CreatedBy
    @Column(name = "created_by", nullable = false, updatable = false, length = 50)
    private String createdBy;

    @LastModifiedDate
    @Column(name = "modified_at")
    private LocalDateTime modifiedAt;

    @LastModifiedBy
    @Column(name = "modified_by", length = 50)
    private String modifiedBy;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "deleted_by", length = 50)
    private String deletedBy;

    @Column(name = "is_deleted", nullable = false)
    private Boolean isDeleted = Boolean.FALSE;

    /** 일회성 마스터 이관에서 원천 등록일 또는 이관 시각을 created_at으로 보존한다. */
    public void overrideCreatedAtForImport(LocalDateTime createdAt) {
        if (createdAt == null) {
            throw new IllegalArgumentException("createdAt은 null일 수 없습니다");
        }
        this.createdAt = createdAt;
    }

    public void markDeleted(String userId) {
        markDeleted(userId, LocalDateTime.now());
    }

    /**
     * 삭제 시각을 외부에서 주입하는 soft-delete 오버로드.
     *
     * <p>부모-자식을 한 트랜잭션에서 cascade soft-delete 할 때 각 엔티티가 각자 {@code now()} 를
     * 찍으면 "같은 삭제 작업" 을 시각으로 되짚을 수 없다. 호출자가 단일 시각을 전 대상에 주입하면
     * cascade 복원이 {@code deleted_at} 등호 매칭으로 대상 집합을 정확히 확정할 수 있다.
     */
    public void markDeleted(String userId, LocalDateTime deletedAt) {
        this.isDeleted = Boolean.TRUE;
        this.deletedAt = deletedAt;
        this.deletedBy = userId;
    }

    /**
     * soft-delete 복구 — is_deleted=false 로 마킹하고 deletedAt/deletedBy 를 비운다.
     *
     * <p>JPA {@code @SQLRestriction("is_deleted = false")} 가드를 만족시켜 다시 활성 행으로
     * 노출. 호출자는 비활성화된 row 를 native query 등으로 미리 로드해 두어야 한다.
     */
    public void markRestored() {
        this.isDeleted = Boolean.FALSE;
        this.deletedAt = null;
        this.deletedBy = null;
    }
}
