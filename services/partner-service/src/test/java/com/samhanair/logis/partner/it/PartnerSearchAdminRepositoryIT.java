package com.samhanair.logis.partner.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partner.PartnerServiceApplication;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.repository.PartnerRepository;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

/**
 * RC4 회귀 IT — {@link PartnerRepository#searchAdmin} 의 q=null 경로 검증.
 *
 * <p>q 미지정 시 PostgreSQL 이 파라미터를 bytea 로 바인딩 → {@code function lower(bytea) does not
 * exist} 500 이 나던 결함. JPQL 에 {@code CAST(:q AS string)} 적용으로 타입을 text 로 고정한 뒤
 * 전체 목록을 반환해야 한다. 실 Postgres (Testcontainers) 에서만 재현 가능한 결함이므로
 * {@link AbstractPostgresIT} 기반 IT 로 검증한다.
 */
@SpringBootTest(classes = PartnerServiceApplication.class)
@Transactional
class PartnerSearchAdminRepositoryIT extends AbstractPostgresIT {

    @Autowired
    private PartnerRepository partnerRepository;

    @BeforeEach
    void seed() {
        partnerRepository.save(Partner.register(
                "RC4-A-001", "1112233440", "삼한물류상사", "서울", "010-0000-0001", BigDecimal.ZERO));
        partnerRepository.save(Partner.register(
                "RC4-B-002", "2223344550", "아로테크", "부산", "010-0000-0002", BigDecimal.ZERO));
        partnerRepository.flush();
    }

    @Test
    void searchAdmin_nullKeyword_nullStatus_returnsAll_noLowerByteaError() {
        // q=null, status=null — 결함이 있으면 lower(bytea) 500. 정상 시 전체 목록 반환.
        Page<Partner> all = partnerRepository.searchAdmin(null, null, PageRequest.of(0, 50));

        assertThat(all.getContent()).extracting(Partner::getPartnerCode)
                .contains("RC4-A-001", "RC4-B-002");
        assertThat(all.getTotalElements()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void searchAdmin_nullKeyword_withStatusFilter_returnsFilteredOnly() {
        // q=null 이어도 status 필터는 적용돼야 한다 (null-keyword + 필터 조합).
        Page<Partner> active = partnerRepository.searchAdmin(
                null, PartnerStatus.ACTIVE, PageRequest.of(0, 50));

        assertThat(active.getContent()).extracting(Partner::getStatus)
                .containsOnly(PartnerStatus.ACTIVE);
    }

    @Test
    void searchAdmin_withKeyword_filtersByNameOrCode() {
        Page<Partner> hit = partnerRepository.searchAdmin(
                "아로테크", null, PageRequest.of(0, 50));

        assertThat(hit.getContent()).extracting(Partner::getPartnerCode).contains("RC4-B-002");
        assertThat(hit.getContent()).extracting(Partner::getPartnerCode).doesNotContain("RC4-A-001");
    }
}
