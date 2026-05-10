package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.Account;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** JPA repository for {@link Account}. Soft-delete filter is applied at the entity level. */
public interface AccountRepository extends JpaRepository<Account, UUID> {

    Optional<Account> findByLoginId(String loginId);

    boolean existsByLoginId(String loginId);

    /**
     * Phase 10 P0-2 — 비밀번호 reset 토큰으로 계정 조회 (confirm 단계). 부분 unique index
     * (V2 migration) 가 활성 토큰을 1 건으로 보장하므로 단일 결과 안전.
     */
    Optional<Account> findByPasswordResetToken(String passwordResetToken);

    /**
     * P0-2 신규 — loginId + email 교차 검증.
     * {@code findByLoginId} 후 email 비교로도 충분하나, 인덱스 활용 위해 별도 선언.
     *
     * @param loginId 로그인 아이디
     * @param email   등록 이메일 (대소문자 무시 — JPQL lower() 사용 권장, 단 현재는 exact match)
     * @return 계정
     */
    Optional<Account> findByLoginIdAndEmail(String loginId, String email);
}
