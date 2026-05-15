package com.samhanair.logis.arologis.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * slip-service 호출 client — Phase 10 W10-1 (skeleton) → W10-4 (PR #99) 실 호출 활성.
 *
 * <p>endpoint 2종 (slip-service SlipInternalController):
 * <ul>
 *   <li>POST {@code /internal/slips/{slipId}/signatures} — 정차 완료 시 전자서명 imageRef 전파
 *       (arologis driver-app 직접 캡처 → slip-service signature_source=APP 컬럼 저장)</li>
 *   <li>GET {@code /internal/slips/by-partner/{partnerId}/recent} — partnerId 의 최근 활성 슬립
 *       lookup (SlipResolver 의 partnerCode → slipId 매핑 단계).</li>
 * </ul>
 *
 * <p>skeleton-mode 토글 ({@code samhan.arologis.client.skeleton-mode}):
 * <ul>
 *   <li>true (W10-1 default) — 외부 호출 회피 (Optional.empty / false 반환)</li>
 *   <li>false (W10-4 시점 활성) — 실 호출. 환경변수 SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false</li>
 * </ul>
 *
 * <p>오류 처리: 4xx/5xx 응답은 false / Optional.empty (호출자가 graceful fallback). slip-service 가
 * down 이어도 arologis-service 가 자체 signatures 테이블에는 INSERT 완료 상태라 운영 영향 0
 * (양쪽 저장 패턴 — Phase 11 cutover 시 재동기화 가능).
 */
@Slf4j
@Component
public class SlipClient {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String internalToken;
    private final boolean skeletonMode;

    public SlipClient(RestClient.Builder builder,
                      ObjectMapper objectMapper,
                      @Value("${samhan.slip-service.url:http://localhost:8084}") String baseUrl,
                      @Value("${app.security.internal.token:}") String internalToken,
                      @Value("${samhan.arologis.client.skeleton-mode:true}") boolean skeletonMode) {
        // DV-1 채택 — SlipClient.Builder 가 이미 timeout 설정된 RequestFactory 를 보유하면 보존,
        // 아니면 default timeout (connect 2s / read 3s) 적용. MockRestServiceServer.bindTo(builder)
        // 시점에 builder 의 requestFactory 가 mock interceptor 로 교체되므로 본 생성자는 builder 를
        // 그대로 build — production timeout 설정은 WebClientConfig bean (또는 호출자 builder) 가 책임.
        this.restClient = builder.baseUrl(baseUrl).build();
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
        this.internalToken = internalToken;
        this.skeletonMode = skeletonMode;
    }

    /**
     * 전자서명 등록 — Phase 10 W10-4 (PR #99) 활성.
     *
     * <p>arologis-service 의 SignatureService 가 정차 완료 시 자체 signatures INSERT 직후 본 메서드 호출.
     * slip-service 는 슬립의 signature_source=APP 컬럼 갱신 + slip_signature_audit 적재.
     *
     * <p>skeleton-mode true 시 무조건 false (W10-1 단계 default). false 일 때만 실 호출.
     *
     * @param slipId 전표 UUID (SlipResolver 가 partnerCode 로 resolve)
     * @param payload 등록 페이로드 (source / imageRef / capturedAt / driverCode / GPS 등)
     * @return 성공 시 true (slip-service 200 + ApiResponse.success=true). 실패 시 false.
     */
    public boolean registerSignature(UUID slipId, SignaturePayload payload) {
        if (skeletonMode) {
            log.debug("SlipClient.registerSignature skeleton-mode — slipId={} (W10-4 환경변수 SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false 로 활성화)",
                    slipId);
            return false;
        }
        try {
            String body = restClient.post()
                    .uri("/internal/slips/{slipId}/signatures", slipId)
                    .header("X-Internal-Token", internalToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload.toRequestBody())
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                log.warn("SlipClient.registerSignature 응답 비어있음 — slipId={}", slipId);
                return false;
            }
            JsonNode root = objectMapper.readTree(body);
            boolean ok = root.has("success") && root.get("success").asBoolean(false);
            if (!ok) {
                log.warn("SlipClient.registerSignature 응답 success=false — slipId={}, body={}",
                        slipId, truncate(body));
            }
            return ok;
        } catch (RestClientResponseException ex) {
            log.warn("SlipClient.registerSignature 4xx/5xx — slipId={}, status={}",
                    slipId, ex.getStatusCode());
            return false;
        } catch (Exception ex) {
            log.warn("SlipClient.registerSignature 호출 실패 — slipId={}, msg={}",
                    slipId, ex.getMessage());
            return false;
        }
    }

    /**
     * partnerId → 최근 활성 slipId lookup — Phase 10 W10-4 (PR #99) 신규.
     *
     * <p>SlipResolver 의 매핑 단계: PartnerClient.findByCode 로 partnerCode → partnerId resolve 후
     * 본 메서드로 partnerId → slipId 변환.
     *
     * @param partnerId 거래처 UUID
     * @return 매칭 슬립 UUID Optional (없거나 skeleton-mode 또는 호출 실패 시 empty)
     */
    public Optional<UUID> findRecentSlipIdByPartner(UUID partnerId) {
        if (skeletonMode || partnerId == null) {
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/slips/by-partner/{partnerId}/recent", partnerId)
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                return Optional.empty();
            }
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.get("data");
            if (data == null || data.isNull()) {
                return Optional.empty();
            }
            JsonNode slipIdNode = data.get("slipId");
            if (slipIdNode == null || slipIdNode.isNull()) {
                return Optional.empty();
            }
            return Optional.of(UUID.fromString(slipIdNode.asText()));
        } catch (RestClientResponseException ex) {
            log.debug("SlipClient.findRecentSlipIdByPartner — partnerId={}, status={} (404 = 매칭 슬립 없음, 정상)",
                    partnerId, ex.getStatusCode());
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("SlipClient.findRecentSlipIdByPartner 호출 실패 — partnerId={}, msg={}",
                    partnerId, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * partnerCode → 최근 활성 slipId lookup — Phase 10 W10-4 종합 TM (BE-1 채택) 신규.
     *
     * <p>SlipResolver.resolveByPartnerCode 의 실 활성 분기. slip-service 측
     * {@code GET /internal/slips/by-partner-code/{code}/recent} 가 partner-service 호출하여 partnerId
     * resolve 후 자체 slips 테이블 lookup. 매핑 실패 시 graceful 200 + data=null 반환.
     *
     * <p>응답 schema (slip-service):
     * <pre>{@code
     * { "success": true, "data": { "slipId": "uuid", "slipNo": "...", "status": "INSPECTING" } }
     *   또는
     * { "success": true, "data": null }   // graceful empty (매핑 실패)
     * }</pre>
     *
     * @param partnerCode 사용자 노출 식별자 — 카톡 파싱 결과 (stop.parsedKakaoSeq 의 String 변환값). slip-service 측 endpoint 의 경로 변수명 호환을 위해 본 client 는 partnerCode 명칭 유지 (PR-E1 시점 endpoint 측 정정 별도 진행).
     * @return 매칭 슬립 UUID Optional. 미매핑 / skeleton-mode / 호출 실패 시 empty.
     */
    public Optional<UUID> findRecentSlipIdByPartnerCode(String partnerCode) {
        if (skeletonMode || partnerCode == null || partnerCode.isBlank()) {
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/slips/by-partner-code/{partnerCode}/recent", partnerCode)
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                return Optional.empty();
            }
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.get("data");
            if (data == null || data.isNull()) {
                return Optional.empty();
            }
            JsonNode slipIdNode = data.get("slipId");
            if (slipIdNode == null || slipIdNode.isNull()) {
                return Optional.empty();
            }
            return Optional.of(UUID.fromString(slipIdNode.asText()));
        } catch (RestClientResponseException ex) {
            log.debug("SlipClient.findRecentSlipIdByPartnerCode — partnerCode={}, status={} (404/4xx = 매핑 실패, 정상)",
                    partnerCode, ex.getStatusCode());
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("SlipClient.findRecentSlipIdByPartnerCode 호출 실패 — partnerCode={}, msg={}",
                    partnerCode, ex.getMessage());
            return Optional.empty();
        }
    }

    private String truncate(String body) {
        if (body == null) {
            return "";
        }
        return body.length() > 200 ? body.substring(0, 200) + "..." : body;
    }

    // ---- Phase F (D-DF-05/06) — 사본 PNG 발송 endpoint ----

    /**
     * Phase F (D-DF-05) — slip recipientPhone lookup. 인수자 휴대번호가 없으면 사본 발송 skip.
     *
     * <p>응답 예: {@code { success: true, data: { recipientPhone: "01012345678" } }}.
     * data=null 또는 phone=null/blank 시 Optional.empty.
     *
     * @param slipId 전표 UUID
     * @return 인수자 휴대번호 풀 String. 미발견/skeleton-mode/호출 실패 시 empty.
     */
    public Optional<String> findRecipientPhone(UUID slipId) {
        if (skeletonMode || slipId == null) {
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/slips/{slipId}/recipient-phone", slipId)
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                return Optional.empty();
            }
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.get("data");
            if (data == null || data.isNull()) {
                return Optional.empty();
            }
            JsonNode phone = data.get("recipientPhone");
            if (phone == null || phone.isNull()) {
                return Optional.empty();
            }
            String value = phone.asText(null);
            return (value == null || value.isBlank()) ? Optional.empty() : Optional.of(value);
        } catch (RestClientResponseException ex) {
            log.debug("findRecipientPhone — slipId={}, status={} (404 = 미발견, 정상)",
                    slipId, ex.getStatusCode());
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("findRecipientPhone 실패 — slipId={}, msg={}", slipId, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Phase F (D-DF-06) — print-renderer 용 slip 전체 상세 lookup.
     *
     * <p>응답 schema: {@code { success: true, data: SlipFullDetail }} (data=null 시 미발견).
     *
     * @param slipId 전표 UUID
     * @return SlipFullDetail Optional. 미발견/skeleton-mode/호출 실패 시 empty.
     */
    public Optional<SlipFullDetail> findFullDetail(UUID slipId) {
        if (skeletonMode || slipId == null) {
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/slips/{slipId}/full", slipId)
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                return Optional.empty();
            }
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.get("data");
            if (data == null || data.isNull()) {
                return Optional.empty();
            }
            return Optional.of(objectMapper.treeToValue(data, SlipFullDetail.class));
        } catch (RestClientResponseException ex) {
            log.debug("findFullDetail — slipId={}, status={} (404 = 미발견, 정상)",
                    slipId, ex.getStatusCode());
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("findFullDetail 실패 — slipId={}, msg={}", slipId, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * print-renderer 용 slip 전체 상세 — Phase F (D-DF-06).
     *
     * <p>OutboundView 가 받는 props 와 1:1 매핑 (slip-service SlipInternalController 의 응답 schema).
     */
    public record SlipFullDetail(
            String slipNo,
            java.time.LocalDate slipDate,
            String partnerName,
            String deliveryAddress,
            java.util.List<SlipFullLine> lines,
            java.math.BigDecimal totalSupply,
            java.math.BigDecimal vat,
            java.math.BigDecimal total,
            String sourceWarehouseName) {}

    /** Slip line 1건 — print-renderer 표시용. */
    public record SlipFullLine(
            String productName,
            String specification,
            int quantity,
            java.math.BigDecimal unitPrice,
            java.math.BigDecimal lineTotal) {}

    /**
     * /internal/slips/{slipId}/signatures POST request payload — slip-service 의
     * InternalSignatureRegistrationRequest record 와 1:1 매핑.
     *
     * <p>UUID 비공개 가드 — slipId 는 본 record 외부 (URL path) 로 전달, 본 payload 에는 미포함.
     *
     * @param signatureSource "APP" 또는 "LINK" (slip-service SignatureSource enum 직렬화 형식)
     * @param imageRef 이미지 reference (S3 placeholder, 1~500자)
     * @param signatureHash SHA-256 hex (선택)
     * @param signerName 인수자명 (선택)
     * @param driverCode 기사 식별 코드 (선택, 있으면 기사 서명 분기)
     * @param capturedAt 캡처 시각 (LocalDateTime ISO)
     * @param capturedLatitude GPS 위도 (선택)
     * @param capturedLongitude GPS 경도 (선택)
     */
    public record SignaturePayload(
            String signatureSource,
            String imageRef,
            String signatureHash,
            String signerName,
            String driverCode,
            LocalDateTime capturedAt,
            BigDecimal capturedLatitude,
            BigDecimal capturedLongitude
    ) {
        /** 정적 factory — APP source + driverCode (기사 서명 분기). */
        public static SignaturePayload appDriver(String imageRef, String driverCode,
                                                 LocalDateTime capturedAt,
                                                 BigDecimal lat, BigDecimal lng) {
            return new SignaturePayload("APP", imageRef, null, null, driverCode, capturedAt, lat, lng);
        }

        /** 정적 factory — APP source + 인수자 서명. */
        public static SignaturePayload appReceiver(String imageRef, String signerName,
                                                   LocalDateTime capturedAt,
                                                   BigDecimal lat, BigDecimal lng) {
            return new SignaturePayload("APP", imageRef, null, signerName, null, capturedAt, lat, lng);
        }

        Map<String, Object> toRequestBody() {
            Map<String, Object> body = new HashMap<>();
            body.put("signatureSource", signatureSource);
            body.put("imageRef", imageRef);
            if (signatureHash != null) {
                body.put("signatureHash", signatureHash);
            }
            if (signerName != null) {
                body.put("signerName", signerName);
            }
            if (driverCode != null) {
                body.put("driverCode", driverCode);
            }
            body.put("capturedAt", capturedAt != null ? capturedAt.toString() : null);
            if (capturedLatitude != null) {
                body.put("capturedLatitude", capturedLatitude);
            }
            if (capturedLongitude != null) {
                body.put("capturedLongitude", capturedLongitude);
            }
            return body;
        }
    }
}
