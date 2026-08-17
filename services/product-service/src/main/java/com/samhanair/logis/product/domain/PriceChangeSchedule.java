package com.samhanair.logis.product.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 단가변동 카테고리별 적용일 설정.
 *
 * <p>category 는 order-app {@code PartnerOrderLine.categoryKey} 와 같은 문자열 키를 저장한다.
 * S1 범위에서는 홈멀티({@code homemulti}), 싱글중대형({@code singleSets}),
 * 상업멀티({@code commercialMulti}), 구형({@code oldProducts}) 4종만 허용한다.
 *
 * <p>effectiveDate 는 KST 업무일 기준의 자정 경계 날짜다. 주문 앱은 납기일이 이 날짜 이상이면
 * 인상 후 단가를 선택한다. 삭제는 {@link BaseEntity#markDeleted(String)} 기반 soft-delete 만
 * 허용하며, 활성 행 조회는 {@link SQLRestriction} 으로 제한한다.
 */
@Entity
@Getter
@Table(name = "price_change_schedule")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PriceChangeSchedule extends BaseEntity {

    /** order-app PartnerOrderLine.categoryKey 허용 목록. 응답 순서도 이 목록을 따른다. */
    public static final List<String> CATEGORY_KEYS = List.of(
            "homemulti",
            "singleSets",
            "commercialMulti",
            "oldProducts");

    private static final Set<String> CATEGORY_KEY_SET = Set.copyOf(CATEGORY_KEYS);

    /** {@link #defaultPreChange} 기본값 — 인상 후 단가를 기본으로 한다. */
    public static final Boolean DEFAULT_PRE_CHANGE = Boolean.FALSE;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * order-app PartnerOrderLine.categoryKey 와 정합되는 견적 카테고리 키.
     *
     * <p>길이 30 은 {@code PartnerOrderLine.category_key VARCHAR(30)} 및 V22 마이그레이션
     * ({@code price_change_schedule.category VARCHAR(30)}) 과의 의도된 정합이다 (#688 S3 정찰
     * 적발 — 기존 length=32 는 물리 스키마와 불일치하는 오기, 실제 허용값은 4종 모두 15자 이하라
     * 기능 영향은 없으나 스키마 문서 정확성을 위해 정정).
     */
    @Column(name = "category", nullable = false, length = 30)
    private String category;

    /** KST 업무일 기준 단가변동 적용 시작일. */
    @Column(name = "effective_date", nullable = false)
    private LocalDate effectiveDate;

    /**
     * 견적 카테고리별 변동단가 체크박스 초기값 (S4a, #17).
     *
     * <p>estimate-app 이 {@code GET /products/internal/price-change-default-variant} 로 조회해
     * 견적 작성 화면의 변동단가 체크박스 기본 상태를 초기화하는 데 사용한다.
     * 기본값은 {@link #DEFAULT_PRE_CHANGE}(인상 후 단가 기본)다.
     */
    @Column(name = "default_pre_change", nullable = false)
    private Boolean defaultPreChange = DEFAULT_PRE_CHANGE;

    private PriceChangeSchedule(String category, LocalDate effectiveDate) {
        validateCategory(category);
        validateEffectiveDate(effectiveDate);
        this.category = category;
        this.effectiveDate = effectiveDate;
    }

    /**
     * 신규 단가변동 스케줄을 생성한다.
     *
     * @param category order-app categoryKey 4종 중 하나
     * @param effectiveDate KST 의미의 적용 시작일
     * @return 활성 단가변동 스케줄
     */
    public static PriceChangeSchedule create(String category, LocalDate effectiveDate) {
        return new PriceChangeSchedule(category, effectiveDate);
    }

    /**
     * 카테고리의 단가변동 적용일을 변경한다.
     *
     * @param effectiveDate KST 의미의 적용 시작일
     */
    public void updateEffectiveDate(LocalDate effectiveDate) {
        validateEffectiveDate(effectiveDate);
        this.effectiveDate = effectiveDate;
    }

    /**
     * 적용일 / 변동단가 기본값을 부분 갱신한다 (S4a admin write API).
     *
     * <p>{@code null} 인자는 기존 값을 유지하는 null-keep partial update 관례를 따른다
     * (dc-config-service {@code EstimateConfig#update} 와 동일 관례 — 서로 다른 Gradle 모듈이라
     * {@code @link} 로 직접 연결하지 않는다).
     *
     * @param effectiveDate KST 의미의 적용 시작일. null 이면 기존 값 유지
     * @param defaultPreChange 변동단가 체크박스 초기값. null 이면 기존 값 유지
     */
    public void update(LocalDate effectiveDate, Boolean defaultPreChange) {
        this.effectiveDate = dateOrCurrent(effectiveDate, this.effectiveDate);
        this.defaultPreChange = booleanOrCurrent(defaultPreChange, this.defaultPreChange);
    }

    private static LocalDate dateOrCurrent(LocalDate value, LocalDate current) {
        return value == null ? current : value;
    }

    private static Boolean booleanOrCurrent(Boolean value, Boolean current) {
        return value == null ? current : value;
    }

    private static void validateCategory(String category) {
        if (category == null || !CATEGORY_KEY_SET.contains(category)) {
            throw new IllegalArgumentException("category 는 order-app categoryKey 4종만 허용됩니다.");
        }
    }

    private static void validateEffectiveDate(LocalDate effectiveDate) {
        if (effectiveDate == null) {
            throw new IllegalArgumentException("effectiveDate 필수");
        }
    }
}
