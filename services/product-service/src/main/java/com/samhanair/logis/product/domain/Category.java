package com.samhanair.logis.product.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 제품 카테고리 — 단일 부모 자기참조 트리 (개발책임자 결재). 깊이 무제한,
 * 강제 검사는 운영 정책으로 처리한다 (코드 강제 X). soft-deleted via {@link SQLRestriction}.
 *
 * <p>Phase INV-S S1: {@code serialManaged} 필드 추가 — 에어컨/판넬 계열 카테고리는
 * {@code true} (개별 시리얼 인스턴스 관리), 부자재/배관 등은 {@code false} (batch lot 관리).
 *
 * <p><b>판넬 카테고리(PANEL 등) 주의</b>: 현재 V2 시드에 판넬 카테고리는 미정의이다.
 * 판넬 카테고리 추가 시 별도 Flyway 마이그레이션으로 {@code serial_managed=true} 지정이 필요하며,
 * Java seeder 경로에서도 {@link #markSerialManaged(boolean)} 을 호출해야 한다.
 */
@Entity
@Getter
@Table(name = "categories")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Category extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "code", nullable = false, length = 50)
    private String code;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Category parent;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    /**
     * 개별시리얼 관리 여부 — {@code true}: 에어컨/판넬 등 stock_instances 대상,
     * {@code false}: 부자재/배관 등 기존 stock_lots(batch) 대상.
     * V9 마이그레이션으로 추가 (기존 row DEFAULT FALSE). Phase INV-S S1.
     */
    @Column(name = "serial_managed", nullable = false)
    private boolean serialManaged;

    private Category(String code, String name, Category parent, int displayOrder) {
        this.code = code;
        this.name = name;
        this.parent = parent;
        this.displayOrder = displayOrder;
        this.serialManaged = false;
    }

    /**
     * 카테고리 생성 팩토리 — create() 시그니처 무변경. serialManaged 기본값 false.
     * 개별시리얼 지정은 {@link #markSerialManaged(boolean)} 도메인 메서드로 후속 호출.
     *
     * @param code         카테고리 코드 (unique)
     * @param name         카테고리 명칭
     * @param parent       상위 카테고리 (루트이면 null)
     * @param displayOrder 정렬 순서
     * @return 새 Category 인스턴스 (serialManaged=false)
     */
    public static Category create(String code, String name, Category parent, int displayOrder) {
        return new Category(code, name, parent, displayOrder);
    }

    public void rename(String name) {
        this.name = name;
    }

    public void changeParent(Category parent) {
        this.parent = parent;
    }

    public void changeDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    /**
     * 관리방식 지정 — 개별시리얼(true)/batch(false). Phase INV-S S1.
     * inventory-service 가 이 플래그로 stock_instances 생성 여부를 판정한다.
     *
     * @param serialManaged true 이면 에어컨/판넬 계열(개별 시리얼), false 이면 batch
     */
    public void markSerialManaged(boolean serialManaged) {
        this.serialManaged = serialManaged;
    }
}
