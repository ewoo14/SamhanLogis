package com.samhanair.logis.auth.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.security.permission.PermissionAction;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 계정 단위 페이지 권한 행.
 *
 * <p>Phase 1 권한 재편의 유일한 enforcement 소스다. MASTER 는 Aspect 에서 bypass 하므로
 * 이 테이블에 전권 row 를 만들지 않는다.
 */
@Entity
@Getter
@Table(name = "account_page_permissions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class AccountPagePermission extends BaseEntity {

    /** PK — UUID auto-generated. 사용자 화면 노출 금지. */
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 권한을 부여할 계정 UUID. */
    @Column(name = "account_id", nullable = false)
    private UUID accountId;

    /** 페이지 코드. */
    @Column(name = "page_code", nullable = false, length = 100)
    private String pageCode;

    @Column(name = "actor_id", length = 100)
    private String actorId;

    @Column(name = "can_view", nullable = false)
    private boolean canView;

    @Column(name = "can_create", nullable = false)
    private boolean canCreate;

    @Column(name = "can_update", nullable = false)
    private boolean canUpdate;

    @Column(name = "can_delete", nullable = false)
    private boolean canDelete;

    @Column(name = "can_restore", nullable = false)
    private boolean canRestore;

    @Column(name = "can_download", nullable = false)
    private boolean canDownload;

    @Column(name = "can_print", nullable = false)
    private boolean canPrint;

    public static AccountPagePermission of(UUID accountId, String pageCode) {
        AccountPagePermission permission = new AccountPagePermission();
        permission.accountId = accountId;
        permission.pageCode = pageCode;
        return permission;
    }

    public boolean allows(PermissionAction action) {
        return switch (action) {
            case VIEW -> canView;
            case CREATE -> canCreate;
            case UPDATE -> canUpdate;
            case DELETE -> canDelete;
            case RESTORE -> canRestore;
            case DOWNLOAD -> canDownload;
            case PRINT -> canPrint;
        };
    }

    public AccountPagePermission grant(PermissionAction action) {
        set(action, true);
        return this;
    }

    public AccountPagePermission revoke(PermissionAction action) {
        set(action, false);
        return this;
    }

    public AccountPagePermission setActions(
            boolean canView,
            boolean canCreate,
            boolean canUpdate,
            boolean canDelete,
            boolean canRestore,
            boolean canDownload,
            boolean canPrint) {
        this.canView = canView;
        this.canCreate = canCreate;
        this.canUpdate = canUpdate;
        this.canDelete = canDelete;
        this.canRestore = canRestore;
        this.canDownload = canDownload;
        this.canPrint = canPrint;
        return this;
    }

    public AccountPagePermission setActorId(String actorId) {
        this.actorId = actorId;
        return this;
    }

    private void set(PermissionAction action, boolean allowed) {
        switch (action) {
            case VIEW -> canView = allowed;
            case CREATE -> canCreate = allowed;
            case UPDATE -> canUpdate = allowed;
            case DELETE -> canDelete = allowed;
            case RESTORE -> canRestore = allowed;
            case DOWNLOAD -> canDownload = allowed;
            case PRINT -> canPrint = allowed;
        }
    }
}
