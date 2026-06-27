package com.samhanair.logis.notification.service;

import com.samhanair.logis.notification.domain.PushDevicePlatform;
import com.samhanair.logis.notification.domain.PushDeviceToken;
import com.samhanair.logis.notification.repository.PushDeviceTokenRepository;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 네이티브 푸시 디바이스 토큰 service.
 *
 * <p>API 는 인증 사용자 본인 토큰만 등록/해제한다. 동일 토큰 재등록은 active row 를 갱신해
 * 기기 재설치/계정 전환 시 중복 row 를 만들지 않는다.
 */
@Service
@RequiredArgsConstructor
public class PushDeviceTokenService {

    private final PushDeviceTokenRepository repository;

    /**
     * 토큰 등록 또는 갱신.
     *
     * @param userId 현재 인증 사용자 UUID
     * @param token 푸시 등록 토큰
     * @param platform 플랫폼
     * @param appClient 앱 클라이언트
     * @return 저장된 active token entity
     */
    @Transactional
    public PushDeviceToken register(UUID userId, String token,
                                    PushDevicePlatform platform, String appClient) {
        String normalizedToken = token == null ? null : token.trim();
        validate(userId, normalizedToken, platform, appClient);
        String normalizedAppClient = appClient.trim().toUpperCase();
        String actor = userId.toString();

        int refreshed = repository.refreshExistingToken(
                userId, normalizedToken, platform.name(), normalizedAppClient, actor);
        if (refreshed == 0) {
            try {
                repository.insertOrRefreshActiveToken(
                        UUID.randomUUID(), userId, normalizedToken, platform.name(), normalizedAppClient, actor);
            } catch (DataIntegrityViolationException ex) {
                return repository.findByToken(normalizedToken)
                        .map(existing -> existing.refresh(userId, platform, normalizedAppClient))
                        .orElseThrow(() -> ex);
            }
        }
        return repository.findByToken(normalizedToken)
                .orElseThrow(() -> new IllegalStateException("푸시 등록 토큰 저장 결과를 조회할 수 없습니다."));
    }

    /**
     * 현재 사용자 소유 토큰을 soft-delete 한다. 이미 없거나 타 사용자 토큰이면 멱등 성공 처리한다.
     *
     * @param userId 현재 인증 사용자 UUID
     * @param token 해제할 푸시 등록 토큰
     */
    @Transactional
    public void revoke(UUID userId, String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        repository.findByToken(token.trim())
                .filter(existing -> existing.getUserId().equals(userId))
                .ifPresent(existing -> existing.revoke(userId.toString()));
    }

    /** USER recipient PUSH 발송 대상 active token 목록. */
    @Transactional(readOnly = true)
    public List<PushDeviceToken> findActiveTokens(UUID userId) {
        return repository.findAllByUserIdOrderByLastSeenAtDesc(userId);
    }

    private void validate(UUID userId, String token, PushDevicePlatform platform, String appClient) {
        PushDeviceToken.register(userId, token, platform, appClient);
    }
}
