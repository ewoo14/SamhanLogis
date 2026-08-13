package com.samhanair.logis.accounting.domain;

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
 * 계정과목 마스터 (한국 일반기업회계기준 표준 계정과목, Plan §3 + 메모리
 * {@code project_korean_accounting.md}).
 *
 * <p>Flyway V1 시드 50+ 행으로 7-그룹 ({@link AccountCategory}) 전체 셋업.
 * 코드 체계는 V101 이카운트 정본 — VARCHAR(6) (예: "1019" 현금).
 *
 * <p>BaseEntity 7 audit + soft-delete (@SQLRestriction). 코드는 변경 불가 (PK).
 */
@Entity
@Getter
@Table(name = "chart_of_accounts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ChartOfAccount extends BaseEntity {

    /** 계정 코드 — VARCHAR(10) PK. 예: "1019"(현금). */
    @Id
    @Column(name = "code", length = 10, nullable = false)
    private String code;

    /** 계정명 — 한국어 (최대 100자). 예: "현금", "보통예금". */
    @Column(name = "name", length = 100, nullable = false)
    private String name;

    /** 7-그룹 카테고리. */
    @Enumerated(EnumType.STRING)
    @Column(name = "category", length = 30, nullable = false)
    private AccountCategory category;

    /**
     * 부모 계정 코드 (self FK). 통제 계정(부모) → 보조 계정(자식) 트리.
     * Root 계정(예: "100" 자산)은 null.
     */
    @Column(name = "parent_code", length = 10)
    private String parentCode;

    /**
     * leaf 여부 — 분개 라인에 사용 가능한 계정인지 (true=사용 가능). 통제 계정은 false.
     */
    @Column(name = "is_leaf", nullable = false)
    private boolean isLeaf;

    /** 트리 화면 정렬 순번. */
    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    private ChartOfAccount(String code, String name, AccountCategory category,
                           String parentCode, boolean isLeaf, int displayOrder) {
        this.code = code;
        this.name = name;
        this.category = category;
        this.parentCode = parentCode;
        this.isLeaf = isLeaf;
        this.displayOrder = displayOrder;
    }

    /**
     * 계정과목 생성 — 시드 / 추후 admin endpoint 진입 시 사용. code 중복은 PK 충돌로 보호.
     *
     * @param code 계정 코드 (1~6자, 한국 표준)
     * @param name 계정명 (1~100자)
     * @param category 7-그룹
     * @param parentCode 부모 코드 (root 면 null)
     * @param isLeaf 분개 가능 여부
     * @param displayOrder 정렬 순번
     */
    public static ChartOfAccount create(String code, String name, AccountCategory category,
                                        String parentCode, boolean isLeaf, int displayOrder) {
        if (code == null || code.isBlank() || code.length() > 10) {
            throw new IllegalArgumentException("계정 코드는 1~10자 필수입니다");
        }
        if (name == null || name.isBlank() || name.length() > 100) {
            throw new IllegalArgumentException("계정명은 1~100자 필수입니다");
        }
        if (category == null) {
            throw new IllegalArgumentException("category 는 필수입니다");
        }
        return new ChartOfAccount(code, name, category, parentCode, isLeaf, displayOrder);
    }

    public void renameFromEcount(String name, AccountCategory category, String parentCode, boolean isLeaf) {
        if (name == null || name.isBlank() || name.length() > 100) {
            throw new IllegalArgumentException("계정명은 1~100자 필수입니다");
        }
        this.name = name;
        this.category = category == null ? this.category : category;
        this.parentCode = parentCode;
        this.isLeaf = isLeaf;
    }
}
