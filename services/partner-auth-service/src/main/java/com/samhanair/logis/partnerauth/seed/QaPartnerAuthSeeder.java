package com.samhanair.logis.partnerauth.seed;

import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
import com.samhanair.logis.partnerauth.repository.PartnerAuthRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주문서웹 라이브 QA 전용 거래처 인증 계정 시더.
 *
 * <p>dev/local 프로파일과 명시적인 seed toggle에서만 활성화된다. 비밀번호는
 * {@code QA_PARTNER_ORDER_PASSWORD} 환경변수에서만 읽고, 계정에는 해시만 저장한다.
 * 기존 거래처 인증 계정은 조회만 하며 수정하지 않는다.
 */
@Component
@Profile({"dev", "local"})
@ConditionalOnProperty(value = "app.qa.partner.seed", havingValue = "true")
public class QaPartnerAuthSeeder implements CommandLineRunner {

    public static final String QA_BIZ_NO = "9999000001";
    public static final String QA_PARTNER_CODE = "QA-ORDER-PORTAL";

    private static final Logger log = LoggerFactory.getLogger(QaPartnerAuthSeeder.class);

    private final PartnerAuthRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final String configuredPassword;

    public QaPartnerAuthSeeder(PartnerAuthRepository repository,
                               PasswordEncoder passwordEncoder,
                               @Value("${QA_PARTNER_ORDER_PASSWORD:}") String configuredPassword) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.configuredPassword = configuredPassword;
    }

    @Override
    public void run(String... args) {
        seed();
    }

    @Transactional
    public void seed() {
        if (configuredPassword == null || configuredPassword.isBlank()) {
            throw new IllegalStateException(
                    "QA_PARTNER_ORDER_PASSWORD 환경변수가 비어 있어 QA 거래처 계정을 만들 수 없습니다");
        }
        if (!configuredPassword.matches("\\d{4}")) {
            throw new IllegalStateException(
                    "QA_PARTNER_ORDER_PASSWORD 환경변수는 숫자 4자리 PIN이어야 합니다");
        }
        if (repository.existsByBizNo(QA_BIZ_NO)) {
            log.info("QA partner auth account already exists; leaving it unchanged");
            return;
        }

        PartnerAuth account = PartnerAuth.seedFromLegacy(
                QA_BIZ_NO,
                QA_PARTNER_CODE,
                passwordEncoder.encode(configuredPassword),
                PartnerStatus.NEED_PW_INPUT,
                "QA 전용 주문서 계정 — 실제 거래처 아님");
        repository.save(account);
        log.info("Created QA partner auth account for partnerCode={}", QA_PARTNER_CODE);
    }
}
