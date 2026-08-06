package com.samhanair.logis.arologis.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * slip-service 출고전표 자동 조회 client — Phase 10 PR-E1 BE-3 신규.
 *
 * <p>arologis-service 의 PreClassifyService / UnassignedService / RegionalService 가 본 client 를
 * 통해 slip-service 의 OUTBOUND 슬립 목록을 기간 단위로 조회하여 가배차/미배차/지방 분류 source
 * 데이터로 사용한다.
 *
 * <p>기존 {@link SlipClient} (W10-4 driver-app 정차 완료 시 signature 등록 + by-partner-code lookup)
 * 와 별도 client — 책임 분리:
 * <ul>
 *   <li>{@link SlipClient} — driver-app trigger 단발 호출 (signature / lookup, fail-soft)</li>
 *   <li>{@link SlipServiceClient} — admin 화면 가배차 분류 batch 조회 (graceful empty)</li>
 * </ul>
 *
 * <p>endpoint 1종 (slip-service 측 신규 — PR-E1 별도 진행 가능):
 * <ul>
 *   <li>GET {@code /internal/slips/outbound?from=YYYY-MM-DD&to=YYYY-MM-DD} — 기간 OUTBOUND 슬립
 *       헤더 + 거래처 주소 enriched 응답</li>
 * </ul>
 *
 * <p>skeleton-mode 토글 ({@code samhan.arologis.client.skeleton-mode}):
 * <ul>
 *   <li>true (default — slip-service 측 endpoint 미가용 시점) — 외부 호출 회피, 빈 리스트 반환</li>
 *   <li>false — 실 호출. 환경변수 SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false</li>
 * </ul>
 *
 * <p>오류 처리: 4xx/5xx·네트워크·응답 계약 오류는 예외로 전파한다. 정상 200 + data=[]만
 * 해당 없음으로 처리한다. UUID 비공개 가드 — slipId 는 내부 projection에서만 유지한다.
 */
@Slf4j
@Component
public class SlipServiceClient {

    private final RestClient.Builder builder;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String internalToken;
    private final boolean skeletonMode;

    public SlipServiceClient(RestClient.Builder builder,
                             ObjectMapper objectMapper,
                             @Value("${samhan.slip-service.url:http://localhost:8086}") String baseUrl,
                             @Value("${app.security.internal.token:}") String internalToken,
                             @Value("${samhan.arologis.client.skeleton-mode:true}") boolean skeletonMode) {
        this.builder = builder;
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
        this.internalToken = internalToken;
        this.skeletonMode = skeletonMode;
    }

    /**
     * 기간 OUTBOUND 슬립 조회 — PR-E1 BE-3 (가배차/미배차/지방가배차 분류 source).
     *
     * <p>응답 schema (slip-service 측 endpoint contract):
     * <pre>{@code
     * {
     *   "success": true,
     *   "data": [
     *     { "slipId": "uuid", "slipNo": "2026/05/10-001", "partnerCode": "P-2026-0001",
 *       "partnerName": "에스엠하나공조", "sourceWarehouseName": "상일창고",
 *       "deliveryAddress": "인천 남동구 구월동 ..." },
     *     ...
     *   ]
     * }
     * }</pre>
     *
     * <p>skeleton-mode / 4xx / 5xx / 네트워크 오류는 조회 실패로 전파하고, 정상적인 빈 data 배열만
     * admin 응답의 "해당 없음"으로 처리한다.
     *
     * @param from 조회 시작일 (inclusive, 필수)
     * @param to 조회 종료일 (inclusive, 필수)
     * @return 매칭 OUTBOUND 슬립 요약 리스트. 미매칭/skeleton/오류 시 빈 리스트.
     */
    public List<OutboundSlipSummary> getOutboundSlips(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 날짜는 필수입니다");
        }
        if (skeletonMode) {
            throw new IllegalStateException("/internal/slips/outbound client is disabled by skeleton-mode");
        }
        try {
            RestClient client = builder.baseUrl(baseUrl).build();
            String body = client.get()
                    .uri(uriBuilder -> uriBuilder.path("/internal/slips/outbound")
                            .queryParam("from", from.toString())
                            .queryParam("to", to.toString())
                            .build())
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(String.class);
            return parseSummaryList(body);
        } catch (RestClientResponseException ex) {
            log.warn("SlipServiceClient.getOutboundSlips 4xx/5xx — from={}, to={}, status={}",
                    from, to, ex.getStatusCode());
            throw new IllegalStateException("/internal/slips/outbound 호출 실패: HTTP " + ex.getStatusCode(), ex);
        } catch (Exception ex) {
            log.warn("SlipServiceClient.getOutboundSlips 호출 실패 — from={}, to={}, msg={}",
                    from, to, ex.getMessage());
            throw new IllegalStateException("/internal/slips/outbound 호출 실패", ex);
        }
    }

    private List<OutboundSlipSummary> parseSummaryList(String body) {
        if (body == null || body.isBlank()) {
            throw new IllegalStateException("/internal/slips/outbound 응답이 비어 있습니다");
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull() || !data.isArray()) {
                throw new IllegalStateException("/internal/slips/outbound 응답 data 계약이 올바르지 않습니다");
            }
            List<OutboundSlipSummary> out = new ArrayList<>(data.size());
            for (JsonNode node : data) {
                String slipNo = textOrNull(node, "slipNo");
                String partnerCode = textOrNull(node, "partnerCode");
                String partnerName = textOrNull(node, "partnerName");
                String address = textOrNull(node, "deliveryAddress");
                if (address == null) {
                    address = textOrNull(node, "address");
                }
                if (slipNo == null) {
                    continue;
                }
                out.add(new OutboundSlipSummary(null, slipNo, partnerCode, partnerName, address,
                        textOrNull(node, "deliveryTag"), warehouseName(node),
                        textOrNull(node, "memo"), textOrNull(node, "productName"),
                        textOrNull(node, "amount"), textOrNull(node, "slipDate"),
                        textOrNull(node, "sourceWarehouseBusinessType")));
            }
            return out;
        } catch (Exception ex) {
            log.warn("SlipServiceClient response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            if (ex instanceof IllegalStateException illegalStateException) {
                throw illegalStateException;
            }
            throw new IllegalStateException("/internal/slips/outbound 응답 파싱 실패", ex);
        }
    }

    private String textOrNull(JsonNode node, String field) {
        JsonNode child = node.get(field);
        if (child == null || child.isNull()) {
            return null;
        }
        return child.asText();
    }

    /** slip-service의 출고 원천 창고명 계약을 읽는다. 구형 projection의 warehouse도 호환한다. */
    private String warehouseName(JsonNode node) {
        String sourceWarehouseName = textOrNull(node, "sourceWarehouseName");
        return sourceWarehouseName != null ? sourceWarehouseName : textOrNull(node, "warehouse");
    }

    /**
     * slip-service 응답 요약 (UUID 비공개 가드 — slipId 는 String 유지, 사용자 화면 노출 시는 slipNo).
     *
     * @param slipId 슬립 UUID 문자열 — admin 화면 routing 용 (사용자 노출 X)
     * @param slipNo 전표번호 (사용자 노출 식별자, 필수)
     * @param partnerCode 거래처 코드 (사용자 노출 식별자)
     * @param partnerName 거래처 상호 (사용자 노출)
     * @param address 거래처 주소 (RegionClassifier 입력값)
     */
    public record OutboundSlipSummary(
            String slipId,
            String slipNo,
            String partnerCode,
            String partnerName,
            String address,
            String deliveryTag,
            String warehouse,
            String memo,
            String productName,
            String amount,
            String slipDate,
            String warehouseBusinessType
    ) {
        /** 기존 호출자와 테스트가 사용하는 최소 projection 생성자. */
        public OutboundSlipSummary(String slipId, String slipNo, String partnerCode,
                                   String partnerName, String address) {
            this(slipId, slipNo, partnerCode, partnerName, address,
                    null, null, null, null, null, null, "UNKNOWN");
        }

        /** 태그 판정 단위 테스트와 내부 분류 호출자를 위한 간결한 생성자. */
        public OutboundSlipSummary(String slipId, String slipNo, String partnerCode,
                                   String partnerName, String address, String deliveryTag) {
            this(slipId, slipNo, partnerCode, partnerName, address,
                    deliveryTag, null, null, null, null, null, "UNKNOWN");
        }

        /** 기존 테스트·호출자용 11필드 projection은 업무 구분을 알 수 없으므로 UNKNOWN이다. */
        public OutboundSlipSummary(String slipId, String slipNo, String partnerCode,
                                   String partnerName, String address, String deliveryTag,
                                   String warehouse, String memo, String productName,
                                   String amount, String slipDate) {
            this(slipId, slipNo, partnerCode, partnerName, address, deliveryTag, warehouse,
                    memo, productName, amount, slipDate, "UNKNOWN");
        }
    }
}
