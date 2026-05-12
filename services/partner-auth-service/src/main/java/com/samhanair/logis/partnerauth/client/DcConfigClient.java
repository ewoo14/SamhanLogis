package com.samhanair.logis.partnerauth.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.samhanair.logis.partnerauth.config.DcConfigClientProperties;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * dc-config-service (M3) internal RPC 클라이언트.
 *
 * <p>3d backlog (본 PR): stub → 정식 RestClient 호출로 교체. dc-config-service 의
 * {@code GET /internal/partners/by-bizno/{bizNo}} 에 {@code X-Internal-Token} 헤더로
 * 인증 후 {@link PartnerInternalEnvelope} 를 받아 {@link PartnerConfigDto} 로 매핑한다.
 *
 * <p>장애 시 (서비스 다운, 토큰 불일치, 404 등) 모두 {@link Optional#empty()} 반환 — 로그인
 * 자체는 성공시키되 config 미주입 (web order-app 측에서 0% DC 로 처리).
 *
 * <p>IT 에서는 본 클라이언트를 {@code @MockBean} 으로 격리한다
 * (memory feedback_it_mockbean_external_clients.md).
 */
@Component
public class DcConfigClient {

    private static final Logger log = LoggerFactory.getLogger(DcConfigClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";

    private final RestClient restClient;
    private final DcConfigClientProperties properties;

    public DcConfigClient(DcConfigClientProperties properties) {
        this.properties = properties;
        this.restClient = RestClient.builder()
                .baseUrl(properties.getUrl())
                .build();
    }

    /**
     * 거래처(파트너) 마스터 + DC 설정 조회 — bizNo 기준.
     *
     * <p>404 / 토큰 오류 / 서비스 다운 모두 빈 Optional 로 dampen — 로그인 자체는 진행한다.
     *
     * @return 거래처가 dc-config-service 에 존재하면 nested DC 포함 DTO, 그 외 empty
     */
    public Optional<PartnerConfigDto> findByBizNo(String bizNo) {
        if (bizNo == null || bizNo.isBlank()) {
            return Optional.empty();
        }
        try {
            ApiResponseEnvelope<PartnerInternalEnvelope> body = restClient.get()
                    .uri("/internal/partners/by-bizno/{bizNo}", bizNo)
                    .header(INTERNAL_TOKEN_HEADER,
                            properties.getInternalToken() == null ? "" : properties.getInternalToken())
                    .retrieve()
                    .body(new org.springframework.core.ParameterizedTypeReference<>() {});
            if (body == null || body.data() == null) {
                return Optional.empty();
            }
            return Optional.of(mapToDto(body.data()));
        } catch (RestClientResponseException ex) {
            HttpStatusCode code = ex.getStatusCode();
            if (code.value() == 404) {
                log.debug("DcConfigClient: 거래처 미존재 (bizNo={})", bizNo);
            } else if (code.value() == 401) {
                log.warn("DcConfigClient: X-Internal-Token 불일치 — dc-config-service 401");
            } else {
                log.warn("DcConfigClient: {} 응답 — body={}", code, ex.getResponseBodyAsString());
            }
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("DcConfigClient: dc-config-service 호출 실패 ({}: {})",
                    ex.getClass().getSimpleName(), ex.getMessage());
            return Optional.empty();
        }
    }

    public String baseUrl() {
        return properties.getUrl();
    }

    private PartnerConfigDto mapToDto(PartnerInternalEnvelope p) {
        PartnerConfigDto.Dc dc = p.dcConfig() == null ? null : new PartnerConfigDto.Dc(
                p.dcConfig().homeDiscountRate(),
                p.dcConfig().commercialDiscountRate(),
                p.dcConfig().showIHose(),
                p.dcConfig().discount360Amount(),
                p.dcConfig().discount4WayAmount(),
                p.dcConfig().discount1WayAmount(),
                p.dcConfig().discountStandAmount(),
                p.dcConfig().discountDeluxeAmount(),
                p.dcConfig().discountFirstGradeAmount(),
                p.dcConfig().unitRoundTo(),
                p.dcConfig().unitRoundMode());
        return new PartnerConfigDto(
                p.partnerCode(),
                p.name(),
                p.manager(),
                p.phone(),
                List.of(),
                Map.of(),
                dc);
    }

    /** dc-config-service {@code ApiResponse<T>} 봉투의 부분 디코딩 (data 만 사용). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ApiResponseEnvelope<T>(T data) {}

    /** dc-config-service {@code PartnerInternalResponse} 의 partner-auth 측 미러. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PartnerInternalEnvelope(
            String partnerCode,
            String bizNo,
            String name,
            String address,
            String phone,
            String manager,
            DcEnvelope dcConfig
    ) {}

    /** dc-config-service {@code DcConfigResponse} 의 partner-auth 측 미러. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DcEnvelope(
            BigDecimal homeDiscountRate,
            BigDecimal commercialDiscountRate,
            Boolean showIHose,
            BigDecimal discount360Amount,
            BigDecimal discount4WayAmount,
            BigDecimal discount1WayAmount,
            BigDecimal discountStandAmount,
            BigDecimal discountDeluxeAmount,
            BigDecimal discountFirstGradeAmount,
            Integer unitRoundTo,
            String unitRoundMode
    ) {}
}
