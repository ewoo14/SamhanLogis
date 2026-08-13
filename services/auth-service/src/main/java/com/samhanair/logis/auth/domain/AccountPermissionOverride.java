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
 * 계정별 페이지 권한 override.
 *
 * <p>행이 존재하는 페이지는 그룹 합집합을 무시하고 override 의 7-action 값이 실권한을 완전히 결정한다.
 * 따라서 grant 뿐 아니라 명시적 deny 도 표현할 수 있다.
 */
@Entity
@Getter
@Table(name = "account_permission_overrides")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class AccountPermissionOverride extends BaseEntity {

    /** PK — UUID auto-generated. */
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** override 대상 계정 UUID. */
    @Column(name = "account_id", nullable = false)
    private UUID accountId;

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

    public static AccountPermissionOverride of(UUID accountId, String pageCode) {
        AccountPermissionOverride override = new AccountPermissionOverride();
        override.accountId = accountId;
        override.pageCode = pageCode;
        return override;
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

    public AccountPermissionOverride setActions(
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

    public AccountPermissionOverride setActorId(String actorId) {
        this.actorId = actorId;
        return this;
    }
}
