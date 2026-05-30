package com.samhanair.logis.dcconfig.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.dcconfig.DcConfigServiceApplication;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.PartnerGroup;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.repository.PartnerRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

/**
 * RC4 회귀 IT — {@link DcConfigRepository#search} 의 keyword=null 경로 검증.
 *
 * <p>{@code GET /api/v1/partner-dc-configs} 가 검색어 없이 진입하면 keyword=null 로 repository 에
 * 전달되어 PostgreSQL 이 파라미터를 bytea 로 바인딩 → {@code function lower(bytea) does not exist}
 * 500 이 나던 결함. JPQL 에 {@code CAST(:keyword AS string)} 적용으로 타입을 text 로 고정한 뒤
 * 전체 목록을 반환해야 한다. 실 Postgres (Testcontainers) 에서만 재현 가능.
 */
@SpringBootTest(classes = DcConfigServiceApplication.class)
@Transactional
class DcConfigSearchRepositoryIT extends AbstractPostgresIT {

    @Autowired
    private PartnerRepository partnerRepository;

    @Autowired
    private DcConfigRepository dcConfigRepository;

    private String codeA;
    private String codeB;

    @BeforeEach
    void seed() {
        codeA = "DC-RC4-A-" + UUID.randomUUID().toString().substring(0, 8);
        codeB = "DC-RC4-B-" + UUID.randomUUID().toString().substring(0, 8);

        Partner pa = partnerRepository.save(Partner.create(
                codeA, "1112233440", "삼한물류상사", "서울", "02-000-0001", "홍길동",
                PartnerGroup.DEALER_1ST, new BigDecimal("100000000"), "RC4 시드"));
        Partner pb = partnerRepository.save(Partner.create(
                codeB, "2223344550", "아로테크", "부산", "02-000-0002", "김철수",
                PartnerGroup.DEALER_1ST, new BigDecimal("100000000"), "RC4 시드"));

        dcConfigRepository.save(DcConfig.create(pa, DcConfigSource.LEGACY_CSV));
        dcConfigRepository.save(DcConfig.create(pb, DcConfigSource.LEGACY_CSV));
        dcConfigRepository.flush();
    }

    @Test
    void search_nullKeyword_returnsAll_noLowerByteaError() {
        // keyword=null — 결함이 있으면 lower(bytea) 500. 정상 시 전체 목록 반환.
        Page<DcConfig> all = dcConfigRepository.search(null, PageRequest.of(0, 50));

        assertThat(all.getContent())
                .extracting(dc -> dc.getPartner().getPartnerCode())
                .contains(codeA, codeB);
        assertThat(all.getTotalElements()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void search_withKeyword_filtersByPartnerNameOrCode() {
        Page<DcConfig> hit = dcConfigRepository.search("아로테크", PageRequest.of(0, 50));

        assertThat(hit.getContent())
                .extracting(dc -> dc.getPartner().getPartnerCode())
                .contains(codeB);
        assertThat(hit.getContent())
                .extracting(dc -> dc.getPartner().getPartnerCode())
                .doesNotContain(codeA);
    }
}
