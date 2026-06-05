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
 * 동적 권한그룹.
 *
 * <p>MASTER 는 {@code isSystemMaster=true} 인 빌트인 그룹으로 표현하며, enforcement 는 기존
 * MASTER bypass 를 유지한다. 그 외 역할 기반 기본 그룹은 일반 그룹으로 생성되어 이후 수정/삭제 가능하다.
 */
@Entity
@Getter
@Table(name = "permission_groups")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PermissionGroup extends BaseEntity {

    /** PK — UUID auto-generated. 사용자 화면 노출 금지. */
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 권한그룹 표시명. 활성 행 기준 unique. */
    @Column(name = "name", nullable = false, length = 100)
    private String name;

    /** 관리자용 설명. */
    @Column(name = "description", length = 255)
    private String description;

    /** 시스템 빌트인 그룹 여부. Phase A 에서는 MASTER 그룹만 true. */
    @Column(name = "is_builtin", nullable = false)
    private boolean builtin;

    /** MASTER 전권 bypass 와 연결되는 시스템 마스터 그룹 여부. */
    @Column(name = "is_system_master", nullable = false)
    private boolean systemMaster;

    public static PermissionGroup create(String name, String description) {
        PermissionGroup group = new PermissionGroup();
        group.name = name;
        group.description = description;
        group.builtin = false;
        group.systemMaster = false;
        return group;
    }

    /** 표시명과 설명을 변경한다. 빌트인 변경 가드는 서비스 계층에서 수행한다. */
    public void rename(String name, String description) {
        this.name = name;
        this.description = description;
    }
}
