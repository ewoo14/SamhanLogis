package com.samhanair.logis.gateway.filter;

import java.net.InetSocketAddress;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.factory.AbstractGatewayFilterFactory;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;

/** 신뢰한 ingress peer 에서만 실제 client IP를 감사 전용 헤더로 전달한다. */
@Component
public class ForwardedClientIpGatewayFilterFactory
        extends AbstractGatewayFilterFactory<ForwardedClientIpGatewayFilterFactory.Config> {

    static final String AUDIT_CLIENT_IP = "X-Audit-Client-IP";

    public ForwardedClientIpGatewayFilterFactory() {
        super(Config.class);
    }

    @Override
    public GatewayFilter apply(Config config) {
        Set<String> trustedPeers = config.trustedPeerAddresses == null
                ? Set.of() : config.trustedPeerAddresses;
        return (exchange, chain) -> {
            String peer = peerAddress(exchange.getRequest());
            String clientIp = isTrustedPeer(peer, trustedPeers)
                    ? firstForwardedAddress(exchange.getRequest().getHeaders().getFirst("X-Forwarded-For"),
                            exchange.getRequest().getHeaders().getFirst("X-Real-IP"), peer)
                    : peer;
            ServerHttpRequest request = exchange.getRequest().mutate()
                    .headers(headers -> {
                        headers.remove(AUDIT_CLIENT_IP);
                        headers.set(AUDIT_CLIENT_IP, clientIp);
                    }).build();
            return chain.filter(exchange.mutate().request(request).build());
        };
    }

    private static boolean isTrustedPeer(String peer, Set<String> trustedPeers) {
        return trustedPeers.contains(peer) || (trustedPeers.contains("private") && isPrivate(peer));
    }

    private static boolean isPrivate(String address) {
        if (address == null) return false;
        if (address.startsWith("10.") || address.startsWith("192.168.") || address.startsWith("172.")) {
            if (!address.startsWith("172.")) return true;
            String[] parts = address.split("\\.");
            try { int second = Integer.parseInt(parts[1]); return second >= 16 && second <= 31; }
            catch (RuntimeException ignored) { return false; }
        }
        return address.equals("::1") || address.startsWith("fc") || address.startsWith("fd");
    }

    private static String peerAddress(ServerHttpRequest request) {
        InetSocketAddress address = request.getRemoteAddress();
        return address == null ? "unknown" : address.getAddress() == null
                ? address.getHostString() : address.getAddress().getHostAddress();
    }

    private static String firstForwardedAddress(String xForwardedFor, String xRealIp, String fallback) {
        if (xRealIp != null && !xRealIp.isBlank()) return xRealIp.trim();
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            return Arrays.stream(xForwardedFor.split(","))
                    .map(String::trim).filter(value -> !value.isBlank()).findFirst().orElse(fallback);
        }
        return fallback;
    }

    /** Gateway ingress peer allowlist. 운영에서는 nginx/ALB 주소를 명시한다. */
    public static class Config {
        private Set<String> trustedPeerAddresses = Set.of("private");

        public Set<String> getTrustedPeerAddresses() { return trustedPeerAddresses; }

        public void setTrustedPeerAddresses(String addresses) {
            trustedPeerAddresses = Arrays.stream((addresses == null ? "" : addresses).split(","))
                    .map(String::trim).filter(value -> !value.isBlank()).collect(Collectors.toUnmodifiableSet());
        }
    }
}
