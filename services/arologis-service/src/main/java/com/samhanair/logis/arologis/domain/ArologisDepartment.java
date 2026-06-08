package com.samhanair.logis.arologis.domain;

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
 * 아로로지스 행정직원 부서.
 *
 * <p>code 는 사용자에게 노출 가능한 업무 식별자이며 활성 행 기준 unique 이다. UUID 는 내부 식별자로만
 * 사용한다.
 *
 * <p>BaseEntity 7 audit + Soft Delete (`@SQLRestriction`) 의무.
 */
@Entity
@Getter
@Table(name = "arologis_department")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ArologisDepartment extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 사용자 노출 부서 코드 — 활성 행 기준 unique. */
    @Column(name = "code", nullable = false, length = 64)
    private String code;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    private ArologisDepartment(String code, String name, int displayOrder) {
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("code 필수");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name 필수");
        }
        this.code = code;
        this.name = name;
        this.displayOrder = displayOrder;
    }

    /** 신규 부서 생성. */
    public static ArologisDepartment create(String code, String name, int displayOrder) {
        return new ArologisDepartment(code, name, displayOrder);
    }

    /** 부서 표시 정보 갱신. */
    public void update(String name, int displayOrder) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name 필수");
        }
        this.name = name;
        this.displayOrder = displayOrder;
    }
}
