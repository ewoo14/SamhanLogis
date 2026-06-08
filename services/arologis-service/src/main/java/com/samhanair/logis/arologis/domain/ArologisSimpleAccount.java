package com.samhanair.logis.arologis.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;

/**
 * 아로로지스 간이 계정과목.
 *
 * <p>단식부기 간이 회계용 계정과목 마스터이다. accounting-service ChartOfAccount 선례를 따라 사용자
 * 노출 식별자인 {@code code} 를 PK 로 사용하고 UUID 는 두지 않는다. 복식부기의 부모/자식 트리, leaf
 * 구분, 통제 계정 개념은 사용하지 않는다.
 *
 * <p>BaseEntity 7 audit + Soft Delete ({@code @SQLRestriction}) 의무. 코드는 변경 불가(PK).
 */
@Entity
@Getter
@Table(name = "arologis_simple_account")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ArologisSimpleAccount extends BaseEntity {

    /** 계정 코드 — VARCHAR(8) PK. 사용자 노출 업무 식별자. */
    @Id
    @Column(name = "code", length = 8, nullable = false)
    private String code;

    /** 계정명 — 한국어 (최대 100자). 예: "현금", "운송수입". */
    @Column(name = "name", length = 100, nullable = false)
    private String name;

    /** 계정 유형 4분류. */
    @Enumerated(EnumType.STRING)
    @Column(name = "type", length = 20, nullable = false)
    private AccountType type;

    /** 화면 표시 정렬 순번. */
    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    /** 활성 여부. false 면 신규 거래 등록 대상에서 제외(과거 거래는 유지). */
    @Column(name = "active", nullable = false)
    private boolean active;

    private ArologisSimpleAccount(String code, String name, AccountType type, int displayOrder, boolean active) {
        if (code == null || code.isBlank() || code.length() > 8) {
            throw new IllegalArgumentException("계정 코드는 1~8자 필수입니다");
        }
        if (name == null || name.isBlank() || name.length() > 100) {
            throw new IllegalArgumentException("계정명은 1~100자 필수입니다");
        }
        if (type == null) {
            throw new IllegalArgumentException("type 은 필수입니다");
        }
        this.code = code;
        this.name = name;
        this.type = type;
        this.displayOrder = displayOrder;
        this.active = active;
    }

    /** 신규 계정과목 생성. */
    public static ArologisSimpleAccount create(
            String code, String name, AccountType type, int displayOrder, boolean active) {
        return new ArologisSimpleAccount(code, name, type, displayOrder, active);
    }
}
