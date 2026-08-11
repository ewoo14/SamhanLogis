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
 * 역할별 페이지 권한 템플릿.
 *
 * <p>enforcement 에 직접 사용하지 않고, MASTER UI 에서 계정 권한을 초기화/복사할 때만 사용한다.
 */
@Entity
@Getter
@Table(name = "role_page_permission_templates")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class RolePagePermissionTemplate extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "role_code", nullable = false, length = 20)
    private String roleCode;

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

    public static RolePagePermissionTemplate of(String roleCode, String pageCode) {
        RolePagePermissionTemplate template = new RolePagePermissionTemplate();
        template.roleCode = roleCode;
        template.pageCode = pageCode;
        return template;
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

    public RolePagePermissionTemplate grant(PermissionAction action) {
        set(action, true);
        return this;
    }

    public RolePagePermissionTemplate revoke(PermissionAction action) {
        set(action, false);
        return this;
    }

    public RolePagePermissionTemplate setActions(
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

    public RolePagePermissionTemplate setActorId(String actorId) {
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
