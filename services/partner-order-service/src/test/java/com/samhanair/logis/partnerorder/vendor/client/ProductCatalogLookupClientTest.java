package com.samhanair.logis.partnerorder.vendor.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerorder.client.GoogleSheetsClient;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 종합견적서/주문서 Google Sheet 원본 tab 매핑 가드.
 *
 * <p>{@code 종합견적서} tab 자체는 출력 양식이라서 modelCode 카탈로그가 아니다.
 * legacy GAS 와 동일하게 홈멀티/싱글/상업멀티 원본 tab 을 직접 읽어야 한다.
 */
@ExtendWith(MockitoExtension.class)
class ProductCatalogLookupClientTest {

    @Mock
    private GoogleSheetsClient sheetsClient;

    private ProductCatalogLookupClient client;

    @BeforeEach
    void setUp() throws Exception {
        client = new ProductCatalogLookupClient(sheetsClient);
        ReflectionTestUtils.setField(client, "catalogSheetId", "test-sheet-id");
        ReflectionTestUtils.setField(client, "catalogRangeOverride", "");

        lenient().when(sheetsClient.readSheetDisplay(eq("test-sheet-id"), anyString()))
                .thenReturn(rows(row("품명", "모델명", "단위", "출고가", "수량", "납품가")));
    }

    @Test
    void lookup_주문서경로는_단가인상탭만_읽고_base탭을_사용하지_않는다() throws Exception {
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "모델명", "단위", "출고가", "수량", "납품가"),
                row("홈멀티 최신", "AJ060MXHNBC1", "대", "2,000,000", "", "1,234,000")
        ));

        Map<String, ProductCatalogLookupClient.CatalogEntry> catalog =
                client.findByModelCodes(List.of("AJ060MXHNBC1", "AJ999BASE"));

        assertThat(catalog.get("AJ060MXHNBC1").productName()).isEqualTo("홈멀티 최신");
        assertThat(catalog.get("AJ060MXHNBC1").releasePrice()).isEqualByComparingTo(new BigDecimal("2000000"));
        assertThat(catalog.get("AJ060MXHNBC1").unitPrice()).isEqualByComparingTo(new BigDecimal("1234000"));
        assertThat(catalog).doesNotContainKey("AJ999BASE");
        verify(sheetsClient, never()).readSheetDisplay("test-sheet-id", "홈멀티!A1:Z");
    }

    @Test
    void lookup_싱글세트는_C열_모델명과_H열_납품가를_그대로_읽는다() throws Exception {
        when(sheetsClient.readSheetDisplay("test-sheet-id", "싱글 세트_단가인상!A1:Z")).thenReturn(rows(
                row("품명", "평형", "모델명", "단위", "출고가", "수량", "납품가", "납품가", "소계"),
                row("360 CST UV", "15", "AC060CS6PBH1SY", "SET", "2,488,200", "", "1,490,000", "1,490,000", "-")
        ));

        ProductCatalogLookupClient.CatalogEntry entry = client.findByModelCode("AC060CS6PBH1SY").orElseThrow();

        assertThat(entry.productName()).isEqualTo("360 CST UV");
        assertThat(entry.releasePrice()).isEqualByComparingTo(new BigDecimal("2488200"));
        assertThat(entry.unitPrice()).isEqualByComparingTo(new BigDecimal("1490000"));
    }

    @Test
    void lookup_override_flat_range가_있으면_3열_카탈로그를_사용한다() throws Exception {
        ReflectionTestUtils.setField(client, "catalogRangeOverride", "Flat!A2:C");
        when(sheetsClient.readSheetDisplay("test-sheet-id", "Flat!A2:C")).thenReturn(rows(
                row("MODEL-1", "flat 제품", "33,000")
        ));

        ProductCatalogLookupClient.CatalogEntry entry = client.findByModelCode("MODEL-1").orElseThrow();

        assertThat(entry.productName()).isEqualTo("flat 제품");
        assertThat(entry.unitPrice()).isEqualByComparingTo(new BigDecimal("33000"));
    }

    @SafeVarargs
    private static List<List<Object>> rows(List<Object>... rows) {
        return List.of(rows);
    }

    private static List<Object> row(Object... values) {
        return List.of(values);
    }
}
