package com.samhanair.logis.gateway.filter;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.factory.AbstractGatewayFilterFactory;
import org.springframework.stereotype.Component;

/**
 * JWT 미적용 공개 라우트에서 클라이언트 위조 identity header 를 제거하는 경량 필터.
 *
 * <p>보호 라우트는 {@link JwtAuthenticationGatewayFilterFactory} 가 같은 목록을 제거 후
 * JWT claim 기반 값으로 재주입한다. 공개 라우트는 재주입할 신뢰 근거가 없으므로 제거만 수행한다.
 */
@Component
public class StripInboundIdentityHeadersGatewayFilterFactory
        extends AbstractGatewayFilterFactory<StripInboundIdentityHeadersGatewayFilterFactory.Config> {

    public StripInboundIdentityHeadersGatewayFilterFactory() {
        super(Config.class);
    }

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> chain.filter(exchange.mutate()
                .request(exchange.getRequest().mutate()
                        .headers(headers -> HttpHeaderConstants.INBOUND_IDENTITY_HEADERS.forEach(headers::remove))
                        .build())
                .build());
    }

    /** 설정값 없는 marker config. */
    public static class Config {
    }
}
