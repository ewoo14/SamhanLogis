package com.samhanair.logis.slip.seed;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * P2 — 마감 lock fixture 시드.
 *
 * <p>목적: 회계 마감 lock ({@code Slip.lockFlag = true}) UI/통합 테스트용 픽스처.
 * SlipSeeder 가 CONFIRMED 단계로 삽입한 슬립 중 2026-01-01 ~ 2026-01-31 기간분을
 * {@code slip.lock()} 으로 일괄 마감 처리하여 아래 두 시나리오를 테스트 가능하게 한다.
 * <ol>
 *   <li>잠긴 슬립에 reject/cancel 호출 시 409 CONFLICT 반환 검증</li>
 *   <li>UI 에서 마감 기간 lock 배지 렌더링 검증</li>
 * </ol>
 *
 * <p>활성 조건 (SlipSeeder 와 동일 toggle):
 * <ul>
 *   <li>{@link Profile @Profile("dev")}</li>
 *   <li>{@link ConditionalOnProperty}({@code app.slip.seed-test-data=true})</li>
 * </ul>
 *
 * <p>{@link Order} 50 — EstimateSeeder(40) 완료 후 실행 (CONFIRMED 슬립 존재 의존).
 *
 * <p>idempotency: {@code lockFlag = true} 인 row 가 이미 존재하면 대상에서 자연 제외
 * ({@code findAllBySlipDateBetweenAndStatusAndLockFlagFalseAndIsDeletedFalse} 로 미처리분만 조회).
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.slip.seed-test-data", havingValue = "true")
@Order(50)
public class SlipLockSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SlipLockSeeder.class);

    /**
     * 마감 기간 — 2026년 1월 전체 (SlipSeeder 의 날짜 분포 2026-01-01 ~ 2026-01-31 포함).
     * CONFIRMED 슬립이 해당 기간에 5~10건 존재함을 기대 (SlipSeeder 분포 기준).
     */
    private static final LocalDate LOCK_START = SlipSeeder.confirmedSeedDates().stream()
            .min(Comparator.naturalOrder())
            .orElseThrow();
    private static final LocalDate LOCK_END = SlipSeeder.confirmedSeedDates().stream()
            .max(Comparator.naturalOrder())
            .orElseThrow();

    private final SlipRepository slipRepository;
    private final SeedDependencyState dependencyState;

    public SlipLockSeeder(SlipRepository slipRepository, SeedDependencyState dependencyState) {
        this.slipRepository = slipRepository;
        this.dependencyState = dependencyState;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (!dependencyState.isSlipSeedSucceeded()) {
            log.error("[SlipLockSeeder] 시딩을 건너뜁니다 — 선행 SlipSeeder가 성공하지 않았습니다. 상태={}",
                    dependencyState.slipSeedStatus());
            return;
        }
        log.info("[SlipLockSeeder] P2 마감 lock 시드 시작 — 기간 {} ~ {}, 대상 상태 CONFIRMED",
                LOCK_START, LOCK_END);

        List<Slip> targets = slipRepository
                .findAllBySlipDateBetweenAndStatusAndLockFlagFalseAndIsDeletedFalse(
                        LOCK_START, LOCK_END, SlipStatus.CONFIRMED);

        for (Slip slip : targets) {
            slip.lock();
        }

        log.info("[SlipLockSeeder] 완료 — {}건 lock 처리 (기간 {} ~ {})",
                targets.size(), LOCK_START, LOCK_END);
    }
}
