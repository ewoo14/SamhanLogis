package com.samhanair.logis.slip.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link SlipLineResponse#from(SlipLine)} 매핑 단위 테스트.
 *
 * <p>PR #461 (PR-3 V34) 신규 세트 전개 식별 필드 {@code setHead} / {@code parentSetModel} 가
 * {@link SlipLine} → DTO 로 정확히 전사되는지 박제한다. 두 필드는 {@code from()} 매핑이
 * {@code line.isSetHead()} / {@code line.getParentSetModel()} 를 누락하면 silent 하게
 * 기본값(false/null)으로 떨어지므로 명시 단언으로 회귀를 차단한다.
 *
 * <p>기존 매핑(specification / unitPriceWithVat / supplyAmount / vatAmount / lineTotal)도
 * 함께 회귀 단언한다.
 */
@DisplayName("SlipLineResponse.from 매핑 테스트")
class SlipLineResponseTest {

    private static final UUID SOURCE_WH = UUID.randomUUID();
    private static final UUID DEST_WH = UUID.randomUUID();
    private static final UUID PARTNER = UUID.randomUUID();
    private static final UUID PRODUCT = UUID.randomUUID();

    @Test
    @DisplayName("세트 전개 구성품 — setHead=true / parentSetModel 정확 전사")
    void from_setExpansionComponent_mapsSetHeadAndParentModel() {
        Slip slip = newOutbound();
        SlipLine line = SlipLine.create(slip, PRODUCT, "실내기", "M-IN-1", "220V",
                2, new BigDecimal("1000.00"), "구성품 메모");
        // 세트 전개 첫 구성품 표시 — parentSetModel='SET-XXX', setHead=true.
        line.assignBundleComponent("SET-XXX", true);

        SlipLineResponse response = SlipLineResponse.from(line);

        // PR-3 신규 두 필드 — 본 PR 매핑의 핵심.
        assertThat(response.setHead()).isTrue();
        assertThat(response.parentSetModel()).isEqualTo("SET-XXX");

        // 회귀 — 기존 식별/규격/수량 매핑.
        assertThat(response.productId()).isEqualTo(PRODUCT);
        assertThat(response.productName()).isEqualTo("실내기");
        assertThat(response.modelName()).isEqualTo("M-IN-1");
        assertThat(response.specification()).isEqualTo("220V");
        assertThat(response.quantity()).isEqualTo(2);
        assertThat(response.note()).isEqualTo("구성품 메모");

        // 회귀 — 단가/금액 계산 필드(supplyAmount=lineTotal, vat=10%, withVat=단가×1.1).
        assertThat(response.unitPrice()).isEqualByComparingTo(new BigDecimal("1000.00"));
        assertThat(response.lineTotal()).isEqualByComparingTo(new BigDecimal("2000.00"));
        assertThat(response.supplyAmount()).isEqualByComparingTo(new BigDecimal("2000.00"));
        assertThat(response.vatAmount()).isEqualByComparingTo(new BigDecimal("200.00"));
        assertThat(response.unitPriceWithVat()).isEqualByComparingTo(new BigDecimal("1100.00"));
    }

    @Test
    @DisplayName("일반 단품 라인 — setHead=false / parentSetModel=null 기본값 전사")
    void from_plainLine_mapsDefaultsForSetFields() {
        Slip slip = newOutbound();
        // assignBundleComponent 미호출 — 세트 전개 표시 없음.
        SlipLine line = SlipLine.create(slip, PRODUCT, "에어컨", "M-1", null,
                1, new BigDecimal("500.00"), null);

        SlipLineResponse response = SlipLineResponse.from(line);

        assertThat(response.setHead()).isFalse();
        assertThat(response.parentSetModel()).isNull();
        assertThat(response.specification()).isNull();
    }

    @Test
    @DisplayName("재수렴 6차(#937) A안: 단가 권위 도메인을 응답에 전사한다 — "
            + "FE 표시 계층이 두 단가 컬럼을 추측하지 않으려면 이 값이 응답에 실려야 한다")
    void from_mapsUnitPriceDomain() {
        Slip slip = newOutbound();
        SlipLine authoritative = SlipLine.createFromAuthoritativeAmounts(slip, PRODUCT, "에어컨",
                "M-1", null, 2, new BigDecimal("100000"), new BigDecimal("200000"),
                new BigDecimal("20000"), new BigDecimal("220000"), null, null);
        SlipLine plain = SlipLine.create(slip, PRODUCT, "에어컨", "M-1", null,
                1, new BigDecimal("500.00"), null);

        // RED(수정 전): null — 응답에 도메인이 없어 FE 가 legacy 휴리스틱으로 떨어지고
        // 읽기전용 표가 사용자 입력 100,000 을 110,000 으로 유도했다(라이브 실증 D-1R6).
        assertThat(SlipLineResponse.from(authoritative).unitPriceDomain()).isEqualTo("VAT_INCLUSIVE");
        assertThat(SlipLineResponse.from(plain).unitPriceDomain()).isEqualTo("SUPPLY");
    }

    private Slip newOutbound() {
        return Slip.createOutbound("2026/06/11-1", LocalDate.of(2026, 6, 11), 1,
                SOURCE_WH, DEST_WH, PARTNER, "삼한공조",
                DeliveryTag.SALE, null, "user-1");
    }
}
