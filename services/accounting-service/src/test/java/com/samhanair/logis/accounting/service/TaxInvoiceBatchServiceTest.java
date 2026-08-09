package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.domain.SupplierProfile;
import com.samhanair.logis.accounting.repository.SupplierProfileRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchExclusionRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import com.samhanair.logis.accounting.web.dto.HomtaxRow;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * TaxInvoiceBatchService 단위 테스트 — 공급자 프로필 동적 조회 검증.
 *
 * <p>TC 목록:
 * <ol>
 *   <li>{@code toHomtaxRow_usesSupplierProfile}: primary 사업자 변경 후 변환 결과 반영 검증</li>
 *   <li>{@code toHomtaxRow_fallback_whenNoPrimary}: primary 미존재 시 fallback 값 사용 검증</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class TaxInvoiceBatchServiceTest {

    @Mock private TaxInvoiceBatchRepository batchRepository;
    @Mock private TaxInvoiceBatchExclusionRepository exclusionRepository;
    @Mock private SlipQueryClient slipQueryClient;
    @Mock private ObjectMapper objectMapper;
    @Mock private SupplierProfileRepository supplierProfileRepository;

    @InjectMocks
    private TaxInvoiceBatchService service;

    private Map<String, Object> rawRow;

    @BeforeEach
    void setUp() {
        rawRow = new HashMap<>();
        rawRow.put("slipNo", "SLP-001");
        rawRow.put("partnerCode", "PC001");
        rawRow.put("businessNumber", "113-07-10031");
        rawRow.put("partnerName", "테스트거래처");
        rawRow.put("representativeName", "대표자");
        rawRow.put("address", "서울시 강남구");
        rawRow.put("bizType", "도소매");
        rawRow.put("bizItem", "가전");
        rawRow.put("email", "buyer@test.com");
        rawRow.put("supplyAmount", 1000000);
        rawRow.put("vatAmount", 100000);
        rawRow.put("deliveryAddress", "");
        rawRow.put("itemName", "품목1");
        rawRow.put("accountingDate", "20260501");
        rawRow.put("slipDate", "20260501");
    }

    // =========================================================================
    // TC: primary 사업자 변경 후 변환 결과 반영
    // =========================================================================

    /**
     * primary 사업자 정보가 변경되면 toHomtaxRow 결과에 즉시 반영되는지 검증.
     *
     * <p>시나리오:
     * <ol>
     *   <li>businessNumber="9999999999" 인 SupplierProfile 을 primary 로 mock</li>
     *   <li>toHomtaxRow 호출 → supplierRegNo 가 "9999999999" 임을 검증</li>
     * </ol>
     */
    @Test
    @DisplayName("toHomtaxRow_usesSupplierProfile: primary 사업자 businessNumber 변경 → 변환 결과 반영")
    void toHomtaxRow_usesSupplierProfile() {
        // given: 신규 primary 사업자 mock
        SupplierProfile newPrimary = SupplierProfile.create(
                "9999999999",
                null,
                "신규사업자",
                "새대표",
                "서울특별시 마포구 신규로 1",
                "제조",
                "IT부품",
                "new@supplier.com",
                true
        );

        // when: toHomtaxRow 에 supplier 직접 전달
        HomtaxRow row = service.toHomtaxRow(rawRow, newPrimary);

        // then: 공급자 정보가 newPrimary 값으로 매핑됨
        assertThat(row.supplierRegNo()).isEqualTo("9999999999");
        assertThat(row.supplierName()).isEqualTo("신규사업자");
        assertThat(row.supplierCeo()).isEqualTo("새대표");
        assertThat(row.supplierAddress()).isEqualTo("서울특별시 마포구 신규로 1");
        assertThat(row.supplierBizType()).isEqualTo("제조");
        assertThat(row.supplierBizItem()).isEqualTo("IT부품");
        assertThat(row.supplierEmail()).isEqualTo("new@supplier.com");
    }

    // =========================================================================
    // TC: primary 미존재 시 fallback 값 사용
    // =========================================================================

    /**
     * primary 사업자가 미존재(null) 일 때 GAS 원본 하드코딩 fallback 값이 사용되는지 검증.
     */
    @Test
    @DisplayName("toHomtaxRow_fallback_whenNoPrimary: supplier=null → legacy fallback 값 사용")
    void toHomtaxRow_fallback_whenNoPrimary() {
        // when: supplier=null 전달 (primary 미존재 상황)
        HomtaxRow row = service.toHomtaxRow(rawRow, null);

        // then: fallback 상수 값으로 매핑됨
        assertThat(row.supplierRegNo()).isEqualTo(TaxInvoiceBatchService.FALLBACK_REG_NO);
        assertThat(row.supplierName()).isEqualTo(TaxInvoiceBatchService.FALLBACK_NAME);
        assertThat(row.supplierCeo()).isEqualTo(TaxInvoiceBatchService.FALLBACK_CEO);
        assertThat(row.supplierAddress()).isEqualTo(TaxInvoiceBatchService.FALLBACK_ADDRESS);
        assertThat(row.supplierBizType()).isEqualTo(TaxInvoiceBatchService.FALLBACK_BIZ_TYPE);
        assertThat(row.supplierBizItem()).isEqualTo(TaxInvoiceBatchService.FALLBACK_BIZ_ITEM);
        assertThat(row.supplierEmail()).isEqualTo(TaxInvoiceBatchService.FALLBACK_EMAIL);
    }

    // =========================================================================
    // TC: supplierSubNo null 처리
    // =========================================================================

    /**
     * subBusinessNumber 가 null 인 SupplierProfile 을 전달하면 supplierSubNo 가 빈 문자열로 매핑됨을 검증.
     */
    @Test
    @DisplayName("toHomtaxRow_subNoNull: subBusinessNumber=null → supplierSubNo 빈 문자열")
    void toHomtaxRow_subNoNull() {
        SupplierProfile profile = SupplierProfile.create(
                "2148720659", null,
                "（주）삼한공조시스템", "김미선",
                "서울특별시 서초구 마방로2길 9, 4층(양재동)",
                "도소매", "가전제품", "apjog09@daum.net", true
        );

        HomtaxRow row = service.toHomtaxRow(rawRow, profile);

        assertThat(row.supplierSubNo()).isEqualTo("");
    }

    @Test
    @DisplayName("배치 홈택스 공급받는자 등록번호는 사업자번호에서 읽는다")
    void buyerRegistrationNumberUsesBusinessNumber() {
        HomtaxRow row = service.toHomtaxRow(rawRow, null);

        assertThat(row.buyerRegNo()).isEqualTo("1130710031");
        assertThat(row.buyerRegNo()).isNotEqualTo("001");
    }

    @Test
    @DisplayName("배치 홈택스 사업자번호가 없으면 가짜 등록번호를 만들지 않는다")
    void buyerRegistrationNumberIsBlankWhenBusinessNumberMissing() {
        rawRow.remove("businessNumber");

        HomtaxRow row = service.toHomtaxRow(rawRow, null);

        assertThat(row.buyerRegNo()).isBlank();
    }
}
