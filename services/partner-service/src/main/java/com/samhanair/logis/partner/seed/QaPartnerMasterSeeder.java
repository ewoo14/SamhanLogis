package com.samhanair.logis.partner.seed;

import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.repository.PartnerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주문서웹 QA 계정이 로그인 후 거래처 마스터를 조회할 수 있도록 하는 dev/local 시더.
 *
 * <p>업무 주문·전표·금액은 만들지 않으며, QA 전용임을 이름과 주소에 명시한다.
 */
@Component
@Profile({"dev", "local"})
@ConditionalOnProperty(value = "app.qa.partner.seed", havingValue = "true")
public class QaPartnerMasterSeeder implements CommandLineRunner {

    public static final String QA_BIZ_NO = "9999000001";
    public static final String QA_PARTNER_CODE = "QA-ORDER-PORTAL";

    private static final Logger log = LoggerFactory.getLogger(QaPartnerMasterSeeder.class);

    private final PartnerRepository repository;

    public QaPartnerMasterSeeder(PartnerRepository repository) {
        this.repository = repository;
    }

    @Override
    public void run(String... args) {
        seed();
    }

    @Transactional
    public void seed() {
        if (repository.existsByPartnerCode(QA_PARTNER_CODE)) {
            log.info("QA partner master already exists; leaving it unchanged");
            return;
        }

        Partner account = Partner.register(
                QA_PARTNER_CODE,
                QA_BIZ_NO,
                "QA 전용 주문서 거래처 (실제 거래처 아님)",
                "QA 전용 테스트 데이터",
                null,
                null);
        repository.save(account);
        log.info("Created QA partner master for partnerCode={}", QA_PARTNER_CODE);
    }
}
