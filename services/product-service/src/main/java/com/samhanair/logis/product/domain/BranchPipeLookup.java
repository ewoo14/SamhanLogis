package com.samhanair.logis.product.domain;

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
 * 분기관 lookup — 분기계산 시트 row 2~100 = 99 row.
 *
 * <p>출처: Migration Plan §2.1.5 (G13 결정). branchCode = A열 (1509/2512/2812/3419 등).
 *
 * <p><b>주의</b>: G13 게이트 — A열 코드 의미는 사용자 매핑 표 검토 후 실 시드.
 * dry-run mode 에서 99 row 추출 → docs/dev-reports/m1a-product-seed-dryrun.md 산출.
 */
@Entity
@Getter
@Table(name = "branch_pipe_lookup")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class BranchPipeLookup extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** A열 코드 (1509/2512/2812/3419 등). */
    @Column(name = "branch_code", nullable = false, length = 16)
    private String branchCode;

    /** 분기관 사양 (사용자 spot-check 후 채움). */
    @Column(name = "description", length = 255)
    private String description;

    /** B열 합계. */
    @Column(name = "summary_qty")
    private Integer summaryQty;

    private BranchPipeLookup(String branchCode, String description, Integer summaryQty) {
        this.branchCode = branchCode;
        this.description = description;
        this.summaryQty = summaryQty;
    }

    public static BranchPipeLookup seed(String branchCode, String description, Integer summaryQty) {
        if (branchCode == null || branchCode.isBlank())
            throw new IllegalArgumentException("branchCode 필수");
        return new BranchPipeLookup(branchCode, description, summaryQty);
    }

    public void updateDescription(String description) {
        this.description = description;
    }

    /**
     * 시트 sync update — branchCode natural key 는 유지하고 시트 실값만 반영한다.
     *
     * @param description 시트에 실값이 없으면 null
     * @param summaryQty 시트에 실값이 없으면 null
     */
    public void updateFromSheet(String description, Integer summaryQty) {
        this.description = description;
        this.summaryQty = summaryQty;
    }
}
