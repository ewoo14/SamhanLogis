package com.samhanair.logis.partnerauth.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 주문·출고 활동 내부 API 호출 설정. */
@Getter
@Setter
@ConfigurationProperties(prefix = "samhan.partner-activity")
public class PartnerActivityClientProperties {

    /** partner-order-service 내부 API 주소. */
    private String orderUrl = "http://partner-order-service:8095";

    /** slip-service 내부 API 주소. */
    private String slipUrl = "http://slip-service:8092";

    /** 내부 API 공통 인증 토큰. */
    private String internalToken;
}
