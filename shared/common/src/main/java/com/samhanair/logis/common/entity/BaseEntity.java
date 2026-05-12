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

    public void markDeleted(String userId) {
        this.isDeleted = Boolean.TRUE;
        this.deletedAt = LocalDateTime.now();
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
