package com.samhanair.logis.slip.seed;

import com.samhanair.logis.slip.delivery.domain.DeliveryBatch;
import com.samhanair.logis.slip.delivery.repository.DeliveryBatchRepository;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * feature/local-test-setup Stage 2 — DeliveryBatch 30건 시드.
 *
 * <p>활성 조건 (이중 가드, SlipSeeder 와 동일 toggle):
 * <ul>
 *   <li>{@link Profile @Profile("dev")}</li>
 *   <li>{@link ConditionalOnProperty}({@code app.slip.seed-test-data=true})</li>
 * </ul>
 *
 * <p>분포:
 * <ul>
 *   <li>30건 batch — driver 10명 풀, 평균 driver 1명당 batch 3건 (다른 batchDate)</li>
 *   <li>batchDate: 2026-01 ~ 2026-05 분포</li>
 *   <li>SHIPPING+ 단계 OUTBOUND 슬립 (driver 정보 보유) 을 batch 와 매핑</li>
 * </ul>
 *
 * <p>SlipSeeder ({@link Order} 20) 직후 실행 ({@link Order} 30) — slip 데이터 의존.
 * idempotency: {@code (driverPhone, batchDate)} 복합 키로 EXISTS 체크 + 중복 시 skip.
 * (DB partial unique index uk_delivery_batches_driver_date 와 동일 가드).
 *
 * <p>도메인 메서드만 사용 — {@link DeliveryBatch#create}, {@link DeliveryBatch#addSlip},
 * {@link DeliveryBatch#markSmsSent}, {@link DeliveryBatch#markSmsFailed}.
 * "EXPIRED" 가상 status 는 DeliveryBatch entity 에 status 필드 없음 → tokenExpiresAt 만료로 표현
 * (현재 도메인 invariant 보존 — 별도 status 컬럼 추가 회피, 사용자 spec 의 "entity 에 없으면 추가"
 * 옵션 대신 기존 도메인 의미 보존 선택).
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.slip.seed-test-data", havingValue = "true")
@Order(30)
public class DeliveryBatchSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DeliveryBatchSeeder.class);

    /** 10명 driver pool — SlipSeeder 와 동일 (driver name 1:1 매핑). */
    private static final List<String> DRIVER_NAMES = List.of(
            "김배송", "이운송", "박물류", "최운반", "정수송",
            "강택배", "조이동", "윤보내", "임가져", "한받기");
    private static final String DRIVER_PHONE_PATTERN = "010-1000-%04d";

    /** SHIPPING+ 단계 = batch 매핑 후보 슬립 (driver 정보 보유). */
    private static final Set<SlipStatus> BATCH_ELIGIBLE_STATUSES = EnumSet.of(
            SlipStatus.SHIPPING, SlipStatus.DELIVERED, SlipStatus.CONFIRMED);
    private static final Map<SlipStatus, List<String>> BATCH_SEED_SLIP_NOS_BY_STATUS =
            SlipSeeder.batchEligibleSeedSlipNosByStatus();

    private final DeliveryBatchRepository batchRepository;
    private final SlipRepository slipRepository;
    private final SeedDependencyState dependencyState;

    public DeliveryBatchSeeder(DeliveryBatchRepository batchRepository,
                               SlipRepository slipRepository, SeedDependencyState dependencyState) {
        this.batchRepository = batchRepository;
        this.slipRepository = slipRepository;
        this.dependencyState = dependencyState;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (!dependencyState.isSlipSeedSucceeded()) {
            log.error("[DeliveryBatchSeeder] 시딩을 건너뜁니다 — 선행 SlipSeeder가 성공하지 않았습니다. 상태={}",
                    dependencyState.slipSeedStatus());
            return;
        }
        log.info("[DeliveryBatchSeeder] Stage 2 시드 시작 — 30 batch (driver 10명 × 3 batch)");

        int created = 0;
        int skipped = 0;
        // PREPARED 10 / IN_PROGRESS 10 / COMPLETED 8 / EXPIRED 2 = 30 (가상 분포)
        // PREPARED       = batch 만 생성 (markSmsSent X)
        // IN_PROGRESS    = batch + markSmsSent
        // COMPLETED(SMS) = batch + markSmsSent  (의미상 "발송 완료")
        // EXPIRED        = batch + markSmsFailed (token 만료 + 실패 기록)

        // 슬립 매핑 풀 — SlipSeeder가 만든 SHIPPING/DELIVERED/CONFIRMED OUTBOUND 슬립.
        List<Slip> mappableSlips = new ArrayList<>();
        for (SlipStatus s : BATCH_ELIGIBLE_STATUSES) {
            slipRepository.findAllBySlipTypeAndSlipNoInAndCreatedByAndStatusAndIsDeletedFalse(
                    SlipType.OUTBOUND, BATCH_SEED_SLIP_NOS_BY_STATUS.getOrDefault(s, List.of()),
                    "system", s)
                    .stream()
                    .filter(sl -> sl.getSlipType() == SlipType.OUTBOUND)
                    .filter(sl -> sl.getDriverPhone() != null && !sl.getDriverPhone().isBlank())
                    .forEach(mappableSlips::add);
        }
        log.info("[DeliveryBatchSeeder] 매핑 가능 슬립 {}건 발견 (SHIPPING/DELIVERED/CONFIRMED + driver 보유)",
                mappableSlips.size());

        int slipCursor = 0;
        for (int batchIdx = 0; batchIdx < 30; batchIdx++) {
            int driverSeq = (batchIdx % DRIVER_NAMES.size()) + 1;  // 1~10 순환
            String driverName = DRIVER_NAMES.get(driverSeq - 1);
            String driverPhone = String.format(DRIVER_PHONE_PATTERN, driverSeq);
            // batchDate 분포: 2026-01-15 부터 4일 간격 — 동일 driver 의 3 batch 가 다른 날짜.
            LocalDate batchDate = LocalDate.of(2026, 1, 15)
                    .plusDays((batchIdx / DRIVER_NAMES.size()) * 30L + driverSeq);

            if (batchRepository.findByDriverPhoneAndBatchDate(driverPhone, batchDate).isPresent()) {
                skipped++;
                continue;
            }

            // 매핑 슬립 0~2건 — 같은 batchDate + driverPhone 매칭 우선, 없으면 fallback.
            List<Slip> slipsForBatch = new ArrayList<>();
            int pickCount = (batchIdx % 3);  // 0/1/2 라운드로빈 (slip 부족 시 0건도 OK).
            while (pickCount > 0 && slipCursor < mappableSlips.size()) {
                slipsForBatch.add(mappableSlips.get(slipCursor++));
                pickCount--;
            }

            DeliveryBatch batch = DeliveryBatch.create(driverName, driverPhone, batchDate, null);
            // batch.id 가 save 후 채번되므로, 먼저 save 한 다음 slip 매핑 (DeliveryBatch.addSlip
            // 가 this.id 참조 — null 시 slip.deliveryBatchId 가 null 로 set 되는 회귀 방지).
            DeliveryBatch saved = batchRepository.saveAndFlush(batch);

            for (Slip slip : slipsForBatch) {
                saved.addSlip(slip);
                slipRepository.save(slip);
            }

            // status 분포 — batchIdx mod 분배.
            // 0~9 (10건)  : PREPARED — markSms* 호출 안 함
            // 10~19 (10건): IN_PROGRESS — markSmsSent
            // 20~27 (8건) : COMPLETED — markSmsSent
            // 28~29 (2건) : EXPIRED — markSmsFailed (token 만료를 가상 status 로 표현)
            if (batchIdx >= 10 && batchIdx <= 27) {
                saved.markSmsSent();
            } else if (batchIdx >= 28) {
                saved.markSmsFailed("[Stage 2 시드] 가상 EXPIRED — token 만료 시뮬");
                // tokenExpiresAt 은 batchDate + 1일 자동 — 2026-01 시드는 이미 만료 상태로 시작.
            }
            created++;
        }

        // SMS 발송 시각 갱신 등 batch save 는 위 트랜잭션 종료 시 자동 flush.
        log.info("[DeliveryBatchSeeder] 완료 — 신규 {}건, skip {}건 (총 {}건). 가상 status 분포: "
                        + "PREPARED 10 / IN_PROGRESS 10 / COMPLETED 8 / EXPIRED 2",
                created, skipped, created + skipped);
    }
}
