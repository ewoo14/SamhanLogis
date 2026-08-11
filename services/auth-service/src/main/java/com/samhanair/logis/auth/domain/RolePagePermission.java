package com.samhanair.logis.auth.domain;

import com.samhanair.logis.common.entity.BaseEntity;
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
 * 동적 RBAC 권한 override 행 — 마스터가 역할별 페이지 권한을 DB 에서 직접 제어.
 *
 * <p>전략:
 * <ul>
 *   <li>이 테이블에 (roleCode, pageCode) 활성 row 가 존재하면 DB 권한 우선 적용.</li>
 *   <li>row 가 없으면 {@code DynamicPermissionService} 가 서비스 기본 정책(fallback) 반환.</li>
 *   <li>기존 {@code @PreAuthorize} 는 보존 — 이 엔티티는 '추가 override' 레이어이다.</li>
 * </ul>
 *
 * <p>Soft-delete 만 사용 ({@link SQLRestriction} 으로 select 단계 자동 필터).
 * 물리 삭제 금지. 삭제 시 {@link BaseEntity#markDeleted(String)} 호출.
 *
 * <p>UUID 비공개 정책: 사용자 화면에 이 엔티티의 {@code id}(UUID)는 노출하지 않는다.
 * {@code roleCode} + {@code pageCode} 비즈니스 식별자만 API 응답에 포함한다.
 */
@Entity
@Getter
@Table(name = "role_page_permissions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class RolePagePermission extends BaseEntity {

    /** PK — UUID auto-generated. 사용자 화면 노출 금지. */
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * 역할 코드 — {@code com.samhanair.logis.common.security.Role} enum name.
     * 예: MASTER / MANAGER / ACCOUNTANT / SALES / WAREHOUSE / DISPATCH / INVENTORY
     */
    @Column(name = "role_code", nullable = false, length = 20)
    private String roleCode;

    /**
     * 페이지 코드 — dot-separated 계층 구조.
     * 예: {@code accounting.tax-invoice.emit-nts}, {@code dispatch.board}
     */
    @Column(name = "page_code", nullable = false, length = 100)
    private String pageCode;

    /** 화면 표시와 분리된 권한 변경 요청자 역추적 키. */
    @Column(name = "actor_id", length = 100)
    private String actorId;

    /**
     * 페이지 진입(조회) 가능 여부.
     * {@code false} = 메뉴 비활성화 + API 403.
     */
    @Column(name = "can_view", nullable = false)
    private boolean canView;

    /**
     * 페이지 내 변경(편집/삭제) 가능 여부.
     * {@code false} = 읽기 전용 모드 또는 403.
     */
    @Column(name = "can_edit", nullable = false)
    private boolean canEdit;

    // -----------------------------------------------------------------------
    // Factory
    // -----------------------------------------------------------------------

    /**
     * 신규 권한 override 행 생성 팩토리.
     *
     * @param roleCode 역할 코드 (non-null)
     * @param pageCode 페이지 코드 (non-null)
     * @param canView  조회 가능 여부
     * @param canEdit  편집 가능 여부
     * @return 영속화 전 신규 인스턴스
     */
    public static RolePagePermission create(String roleCode, String pageCode,
                                            boolean canView, boolean canEdit) {
        RolePagePermission p = new RolePagePermission();
        p.roleCode = roleCode;
        p.pageCode = pageCode;
        p.canView = canView;
        p.canEdit = canEdit;
        return p;
    }

    // -----------------------------------------------------------------------
    // 도메인 메서드 — status / mutable 필드는 domain method 만 사용
    // -----------------------------------------------------------------------

    /**
     * 조회 권한 부여.
     *
     * @return 메서드 체이닝을 위해 {@code this} 반환
     */
    public RolePagePermission grantView() {
        this.canView = true;
        return this;
    }

    /**
     * 조회 권한 박탈.
     * 조회 권한이 없으면 편집 권한도 자동 박탈 ({@code canEdit = false}).
     *
     * @return 메서드 체이닝을 위해 {@code this} 반환
     */
    public RolePagePermission revokeView() {
        this.canView = false;
        this.canEdit = false;  // 조회 불가 시 편집도 불가
        return this;
    }

    /**
     * 편집 권한 부여.
     * 편집 권한을 부여하면 조회 권한도 자동 부여된다 (편집 ⊆ 조회).
     *
     * @return 메서드 체이닝을 위해 {@code this} 반환
     */
    public RolePagePermission grantEdit() {
        this.canView = true;  // 편집 가능 = 조회도 가능
        this.canEdit = true;
        return this;
    }

    /**
     * 편집 권한 박탈 (조회 권한은 유지).
     *
     * @return 메서드 체이닝을 위해 {@code this} 반환
     */
    public RolePagePermission revokeEdit() {
        this.canEdit = false;
        return this;
    }

    /**
     * 조회/편집 권한을 한꺼번에 갱신.
     *
     * <p>마스터 화면에서 체크박스 2개를 한 번에 저장할 때 사용.
     * 비즈니스 규칙: {@code canEdit = true} 이면 {@code canView = true} 강제.
     *
     * @param canView 새로운 조회 권한 값
     * @param canEdit 새로운 편집 권한 값
     * @return 메서드 체이닝을 위해 {@code this} 반환
     */
    public RolePagePermission updatePermissions(boolean canView, boolean canEdit) {
        if (canEdit) {
            // 편집 권한 부여 시 조회 권한 자동 보장
            this.canView = true;
            this.canEdit = true;
        } else {
            this.canView = canView;
            this.canEdit = false;
        }
        return this;
    }

    public RolePagePermission setActorId(String actorId) {
        this.actorId = actorId;
        return this;
    }
}
