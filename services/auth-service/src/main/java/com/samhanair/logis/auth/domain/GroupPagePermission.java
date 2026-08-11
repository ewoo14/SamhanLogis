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
 * 권한그룹 단위 페이지 권한 행.
 *
 * <p>계정이 여러 그룹에 배속되면 이 행들의 7-action 값을 페이지별 OR 로 합산한다.
 */
@Entity
@Getter
@Table(name = "group_page_permissions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class GroupPagePermission extends BaseEntity {

    /** PK — UUID auto-generated. */
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 권한그룹 UUID. */
    @Column(name = "group_id", nullable = false)
    private UUID groupId;

    /** 페이지 코드. 기존 account_page_permissions 와 동일하게 String 으로 저장한다. */
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

    public static GroupPagePermission of(UUID groupId, String pageCode) {
        GroupPagePermission permission = new GroupPagePermission();
        permission.groupId = groupId;
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

    public GroupPagePermission setActions(
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

    public GroupPagePermission setActorId(String actorId) {
        this.actorId = actorId;
        return this;
    }
}
