package com.samhanair.logis.dcconfig.seed;

import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.repository.PartnerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 주문서웹 라이브 QA 거래처가 가격 미리보기의 dc-config 조회를 통과하도록 하는 시더. */
@Component
@Profile({"dev", "local"})
@ConditionalOnProperty(value = "app.qa.partner.seed", havingValue = "true")
public class QaPartnerDcConfigSeeder implements CommandLineRunner {

    public static final String QA_BIZ_NO = "9999000001";
    public static final String QA_PARTNER_CODE = "QA-ORDER-PORTAL";

    private static final Logger log = LoggerFactory.getLogger(QaPartnerDcConfigSeeder.class);

    private final PartnerRepository partnerRepository;
    private final DcConfigRepository dcConfigRepository;

    public QaPartnerDcConfigSeeder(PartnerRepository partnerRepository,
                                   DcConfigRepository dcConfigRepository) {
        this.partnerRepository = partnerRepository;
        this.dcConfigRepository = dcConfigRepository;
    }

    @Override
    public void run(String... args) {
        seed();
    }

    @Transactional
    public void seed() {
        Partner partner = partnerRepository.findByPartnerCode(QA_PARTNER_CODE)
                .orElseGet(() -> partnerRepository.save(Partner.create(
                        QA_PARTNER_CODE,
                        QA_BIZ_NO,
                        "QA 전용 주문서 거래처 (실제 거래처 아님)",
                        "QA 전용 테스트 데이터",
                        null,
                        null,
                        null,
                        null,
                        "QA 전용 가격 미리보기 거래처")));

        if (dcConfigRepository.findByPartner_Id(partner.getId()).isPresent()) {
            log.info("QA partner dc config already exists; leaving it unchanged");
            return;
        }

        DcConfig config = DcConfig.create(partner, DcConfigSource.ADMIN_EDIT);
        config.changeRates(null, null);
        config.changeShowIHose(false);
        config.changeOptionAmounts(null, null, null, null, null, null);
        config.changeRounding(1, null);
        config.changeUnitProcessingEnabled(false);
        config.changeNote("QA 전용 가격 미리보기 설정");
        dcConfigRepository.save(config);
        log.info("Created QA partner dc config for partnerCode={}", QA_PARTNER_CODE);
    }
}
