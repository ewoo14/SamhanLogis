package com.samhanair.logis.auth.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Component;

/**
 * 비밀번호 재설정 요청 rate-limit — P0-2 보안 정책.
 *
 * <p>Caffeine in-memory sliding window 방식:
 * <ul>
 *     <li>동일 loginId: 1 분당 {@value #MAX_PER_LOGIN_ID_PER_MINUTE} 회 초과 시 429</li>
 *     <li>동일 IP: 1 분당 {@value #MAX_PER_IP_PER_MINUTE} 회 초과 시 429</li>
 * </ul>
 *
 * <p>카운터는 1 분 TTL 만료 시 자동 evict (Caffeine expireAfterWrite).
 * 운영 환경 Redis 전환 시 본 클래스만 교체하면 됨.
 *
 * <p>한도 초과 시 {@link ErrorCode#TOO_MANY_REQUESTS} — HTTP 429 반환 (PR #138 C-2 fix).
 * /request 와 /confirm 양 endpoint 에 동일 정책 적용.
 */
@Component
public class PasswordResetRateLimiter {

    /** loginId 기준 1 분당 최대 요청 수 (spec: 1분 5회 / PR #138 검토 후 보수적 3회 유지). */
    public static final int MAX_PER_LOGIN_ID_PER_MINUTE = 5;

    /** IP 기준 1 분당 최대 요청 수. */
    public static final int MAX_PER_IP_PER_MINUTE = 20;

    /** loginId 기준 카운터 캐시 — key: loginId, value: 요청 횟수 (1분 TTL). */
    private final Cache<String, AtomicInteger> loginIdCounter = Caffeine.newBuilder()
            .expireAfterWrite(1, TimeUnit.MINUTES)
            .maximumSize(10_000)
            .build();

    /** IP 기준 카운터 캐시 — key: IP, value: 요청 횟수 (1분 TTL). */
    private final Cache<String, AtomicInteger> ipCounter = Caffeine.newBuilder()
            .expireAfterWrite(1, TimeUnit.MINUTES)
            .maximumSize(5_000)
            .build();

    /**
     * 요청 전 rate-limit 검사 및 카운터 증가.
     *
     * @param loginId   요청자 loginId
     * @param clientIp  요청자 IP 주소
     * @throws BusinessException HTTP 429 — 분당 한도 초과
     */
    public void checkAndIncrement(String loginId, String clientIp) {
        checkLoginId(loginId);
        checkIp(clientIp);
    }

    /**
     * loginId 기준 rate-limit 검사.
     *
     * @param loginId 요청 loginId
     * @throws BusinessException {@link ErrorCode#TOO_MANY_REQUESTS} HTTP 429 — 분당 한도 초과
     */
    private void checkLoginId(String loginId) {
        AtomicInteger counter = loginIdCounter.get(loginId, k -> new AtomicInteger(0));
        int count = counter.incrementAndGet();
        if (count > MAX_PER_LOGIN_ID_PER_MINUTE) {
            throw new BusinessException(
                    ErrorCode.TOO_MANY_REQUESTS,
                    "요청이 너무 많습니다. 잠시 후 다시 시도해주세요 (분당 " + MAX_PER_LOGIN_ID_PER_MINUTE + "회 제한)");
        }
    }

    /**
     * IP 기준 rate-limit 검사.
     *
     * @param clientIp 요청자 IP 주소
     * @throws BusinessException {@link ErrorCode#TOO_MANY_REQUESTS} HTTP 429 — 분당 한도 초과
     */
    private void checkIp(String clientIp) {
        if (clientIp == null || clientIp.isBlank()) {
            return; // IP 없는 내부 호출은 skip
        }
        AtomicInteger counter = ipCounter.get(clientIp, k -> new AtomicInteger(0));
        int count = counter.incrementAndGet();
        if (count > MAX_PER_IP_PER_MINUTE) {
            throw new BusinessException(
                    ErrorCode.TOO_MANY_REQUESTS,
                    "요청이 너무 많습니다. 잠시 후 다시 시도해주세요 (분당 " + MAX_PER_IP_PER_MINUTE + "회 제한)");
        }
    }

    /**
     * 테스트 전용 — 특정 loginId 카운터 초기화.
     *
     * @param loginId 초기화할 loginId
     */
    void resetLoginId(String loginId) {
        loginIdCounter.invalidate(loginId);
    }

    /**
     * 테스트 전용 — 특정 IP 카운터 초기화.
     *
     * @param ip 초기화할 IP
     */
    void resetIp(String ip) {
        ipCounter.invalidate(ip);
    }
}
