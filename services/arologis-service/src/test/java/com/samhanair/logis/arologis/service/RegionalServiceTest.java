package com.samhanair.logis.arologis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.client.SlipServiceClient.OutboundSlipSummary;
import com.samhanair.logis.arologis.dto.RegionalDispatchResponse;
import com.samhanair.logis.arologis.dto.RegionalDispatchResponse.Entry;
import com.samhanair.logis.common.exception.BusinessException;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * RegionalService 단위 테스트 — Phase 10 PR-E1 BE-A4.
 *
 * <p>광역 prefix 추출 + 매칭 안 됨 case 5 case:
 *
 * <ol>
 *   <li>case 1 — 다중 시도 그룹핑 (서울 / 부산 / 대구 동시 매칭)</li>
 *   <li>case 2 — 매칭 안 됨 (외국 주소 / null 주소) → unmatched</li>
 *   <li>case 3 — graceful empty (slip-service 빈 응답)</li>
 *   <li>case 4 — date null → BusinessException</li>
 *   <li>case 5 — 광역 prefix 우선순위 (서울/광역시 → 도 순) 검증 + 17 시도 전체 커버리지 sample</li>
 * </ol>
 */
class RegionalServiceTest {

    private SlipServiceClient slipServiceClient;
    private RegionalService service;

    @BeforeEach
    void setUp() {
        slipServiceClient = mock(SlipServiceClient.class);
        service = new RegionalService(slipServiceClient);
    }

    @Test
    @DisplayName("case 1 — 다중 시도 그룹핑 (서울 / 부산 / 대구 동시 매칭)")
    void classifyBySido_groupsByMultipleSido() {
        when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of(
                new OutboundSlipSummary("id-1", "2026/05/10-001", "P-2026-0001",
                        "서울공조", "서울 강남구 역삼동", "REGION"),
                new OutboundSlipSummary("id-2", "2026/05/10-002", "P-2026-0002",
                        "부산공조", "부산 해운대구", "REGION"),
                new OutboundSlipSummary("id-3", "2026/05/10-003", "P-2026-0003",
                        "대구공조", "대구 수성구 범어동", "REGION"),
                new OutboundSlipSummary("id-4", "2026/05/10-004", "P-2026-0004",
                        "서울공조2", "서울 송파구", "REGION")
        ));

        RegionalDispatchResponse result = service.classifyBySido(LocalDate.of(2026, 5, 10));

        assertThat(result.sidoGroups()).containsKeys("서울", "부산", "대구");
        assertThat(result.sidoGroups().get("서울")).hasSize(2);
        assertThat(result.sidoGroups().get("부산")).hasSize(1);
        assertThat(result.sidoGroups().get("대구")).hasSize(1);
        assertThat(result.unmatched()).isEmpty();
        assertThat(result.date()).isEqualTo("2026-05-10");
    }

    @Test
    @DisplayName("case 2 — 매칭 안 됨 (외국 주소 / null 주소) → unmatched")
    void classifyBySido_unmatched_goesToUnmatchedList() {
        when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of(
                new OutboundSlipSummary("id-1", "2026/05/10-001", "P-2026-0001",
                        "외국공조", "Tokyo Shibuya", "REGION"),
                new OutboundSlipSummary("id-2", "2026/05/10-002", "P-2026-0002",
                        "주소없음", null, "REGION"),
                new OutboundSlipSummary("id-3", "2026/05/10-003", "P-2026-0003",
                        "blank", "   ", "REGION"),
                new OutboundSlipSummary("id-4", "2026/05/10-004", "P-2026-0004",
                        "정상공조", "서울 강남구", "REGION")
        ));

        RegionalDispatchResponse result = service.classifyBySido(LocalDate.of(2026, 5, 10));

        assertThat(result.sidoGroups()).containsOnlyKeys("서울");
        assertThat(result.sidoGroups().get("서울")).hasSize(1);
        assertThat(result.unmatched()).hasSize(3);
        assertThat(result.unmatched()).extracting(Entry::sido).containsOnlyNulls();
    }

    @Test
    @DisplayName("case 3 — graceful empty (slip-service 빈 응답)")
    void classifyBySido_emptySlips_returnsEmptyResponse() {
        when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of());

        RegionalDispatchResponse result = service.classifyBySido(LocalDate.of(2026, 5, 10));

        assertThat(result.sidoGroups()).isEmpty();
        assertThat(result.unmatched()).isEmpty();
    }

    @Test
    @DisplayName("case 4 — date null → BusinessException")
    void classifyBySido_nullDate_throwsBusinessException() {
        assertThatThrownBy(() -> service.classifyBySido(null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("date");
    }

    /**
     * extractSido 단위 검증 — 17 시도 prefix sample + 우선순위 (광역시도 → 도 순) 회귀.
     *
     * <p>"서울 강남구" 가 "강남" (남=경남? 충남?) 충돌 회피되어야 한다 — 17 prefix 만 정확 매칭.
     * "경기 화성" 도 "경기" 우선 매칭 (경북/경남 충돌 X).
     */
    @Test
    @DisplayName("case 5 — 광역 prefix 우선순위 + 17 시도 sample")
    void extractSido_priorityAnd17SidoCoverage() {
        // 광역시도 8 + 도 9 = 17 sample
        assertThat(service.extractSido("서울 강남구")).isEqualTo("서울");
        assertThat(service.extractSido("부산 해운대구")).isEqualTo("부산");
        assertThat(service.extractSido("대구 수성구")).isEqualTo("대구");
        assertThat(service.extractSido("인천 남동구")).isEqualTo("인천");
        assertThat(service.extractSido("광주 북구")).isEqualTo("광주");
        assertThat(service.extractSido("대전 유성구")).isEqualTo("대전");
        assertThat(service.extractSido("울산 남구")).isEqualTo("울산");
        assertThat(service.extractSido("세종특별자치시")).isEqualTo("세종");
        assertThat(service.extractSido("경기 화성시")).isEqualTo("경기");
        assertThat(service.extractSido("강원 춘천시")).isEqualTo("강원");
        assertThat(service.extractSido("충북 청주시")).isEqualTo("충북");
        assertThat(service.extractSido("충남 천안시")).isEqualTo("충남");
        assertThat(service.extractSido("전북 전주시")).isEqualTo("전북");
        assertThat(service.extractSido("전남 여수시")).isEqualTo("전남");
        assertThat(service.extractSido("경북 포항시")).isEqualTo("경북");
        assertThat(service.extractSido("경남 창원시")).isEqualTo("경남");
        assertThat(service.extractSido("제주 서귀포")).isEqualTo("제주");

        // 매칭 안 됨
        assertThat(service.extractSido(null)).isNull();
        assertThat(service.extractSido("")).isNull();
        assertThat(service.extractSido("   ")).isNull();
        assertThat(service.extractSido("Tokyo Shibuya")).isNull();
    }

    @Test
    @DisplayName("RED — 주소의 시도 문자열만으로 지방 전표를 판정하지 않는다")
    void addressAlone_isNotRegionalWithoutDeliveryTag() {
        // 개발책임자 정정: 지방은 주소/17개 시도 문자열이 아니라 delivery_tag=REGION이다.
        when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(List.of(
                new OutboundSlipSummary("id-1", "2026/05/10-001", "P-2026-0001",
                        "주소만 있는 전표", "서울 강남구")));
        RegionalDispatchResponse result = service.classifyBySido(LocalDate.of(2026, 5, 10));
        assertThat(result.sidoGroups()).isEmpty();
        assertThat(result.unmatched()).isEmpty();
    }

    @Test
    @DisplayName("RED — 가배차 레거시 8개 실행 모드 계약이 존재한다")
    void legacyEightExecutionModes_areAvailable() throws Exception {
        Class<?> modeType = Class.forName(
                "com.samhanair.logis.arologis.service.DispatchExecutionMode");
        assertThat(modeType.isEnum()).isTrue();
        assertThat(modeType.getEnumConstants()).hasSize(8);
    }
}
