package com.samhanair.logis.slip.seed;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

/**
 * feature/local-test-setup Stage 2 — Slip 100건 + SlipLine ~300건 시드.
 *
 * <p>활성 조건 (이중 가드):
 * <ul>
 *   <li>{@link Profile @Profile("dev")} — local/dev 프로파일 한정</li>
 *   <li>{@link ConditionalOnProperty}({@code app.slip.seed-test-data=true}) — toggle 명시적 ON</li>
 * </ul>
 *
 * <p>분포:
 * <ul>
 *   <li>slipType: OUTBOUND 60 / INBOUND 30 / OUTBOUND+RETURN_RENTAL 10 (RETURN tag 는 INBOUND 전용 enum)</li>
 *   <li>status: DRAFT 10 / SAVED 15 / SENT 10 / ACCEPTED 10 / PROCESSING 10 / INSPECTING 10 /
 *       COMPLETED 10 / SHIPPING 5 / DELIVERED 10 / CONFIRMED 5 / REJECTED 5 = 100</li>
 *   <li>deliveryTag: DAY 50 (OUTBOUND) / STACK 10 (OUTBOUND, "NIGHT" 대체) / RETURN_RENTAL 10 (OUTBOUND) / null 30 (INBOUND)</li>
 *   <li>날짜: 2026-01-01 ~ 2026-05-09 분포 (일자별 1~5건, slipNo 결정적 채번)</li>
 * </ul>
 *
 * <p>도메인 메서드만 사용 — {@link Slip#createOutbound}, {@link Slip#createInbound},
 * {@link Slip#save}, {@link Slip#send}, {@link Slip#accept}, {@link Slip#process},
 * {@link Slip#complete}, {@link Slip#inspect}, {@link Slip#ship}, {@link Slip#deliver},
 * {@link Slip#confirm}, {@link Slip#reject}. 잘못된 전이 시도 시 BusinessException(CONFLICT) 던짐.
 *
 * <p>product modelName 은 {@code PRODUCT_MODEL_NAMES} 명시 배열
 * (product-service HvacProductSeeder 와 1:1 동기화) 을 사용한다.
 * UUID = {@code UUID.nameUUIDFromBytes("samhan-seed:product:" + modelName)} — product-service 와 동일 namespace.
 *
 * <p>idempotency: {@code SlipRepository.findBySlipTypeAndSlipNoIncludingDeleted} EXISTS 체크
 * + 중복 시 skip. 판매/구매 전표는 같은 공개번호를 가질 수 있으므로 유형까지 함께 본다.
 * UUID 비공개 가드 — 모든 외부 식별자는 slipNo / partnerCode / productCode 사용.
 */
@Component
@Profile("dev")
@ConditionalOnExpression("'${app.slip.seed-test-data:false}' == 'true' or '${app.slip.full-seed-test-data:false}' == 'true'")
@Order(20)
public class SlipSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SlipSeeder.class);

    /** Stage 1 partner 결정성 UUID prefix — partnerCode 가변. */
    private static final String PARTNER_UUID_PREFIX = "samhan-seed:partner:";

    /** V2 시드 본사창고 UUID — slip 의 출고/입고 창고. */
    private static final UUID HQ_WAREHOUSE_ID =
            UUID.fromString("11111111-1111-1111-1111-000000000001");

    /** Stage 1 partner 시드 개수 (P-2026-0001 ~ P-2026-0050). */
    private static final int PARTNER_COUNT = 50;
    /** Stage 1 partner 비공개 식별자 패턴. */
    private static final String PARTNER_CODE_PATTERN = "P-2026-%04d";

    /**
     * product-service HvacProductSeeder.buildAllRows 와 1:1 동기화된 실 modelName 100개.
     * 출처: product-service HvacProductSeeder, 4 seeder 동일 유지 (inventory/slip/partner-order).
     *
     * <p>변경 시 반드시 HvacProductSeeder.buildAllRows 를 먼저 확인하고 4 seeder 동시 갱신.
     *
     * <ul>
     *   <li>seq 1~30  벽걸이  : {@code AR%02dTXEAAWKNEU-%02d}</li>
     *   <li>seq 31~50 스탠드  : {@code AF%02dBX1NWAEAH-%02d}</li>
     *   <li>seq 51~75 DVM-S  : {@code AM%03dBNNDEH-%02d} (hp*10)</li>
     *   <li>seq 76~85 천장형  : {@code AC%03dCNCDEH-%02d} ((idx+1)*100)</li>
     *   <li>seq 86~95 공기청정기: {@code AX%02dB%dNNDB-%02d}</li>
     *   <li>seq 96~100 부속   : 고정 5종</li>
     * </ul>
     */
    private static final String[] PRODUCT_MODEL_NAMES = {
            // seq 1~10 벽걸이 (pyongWall = {5,6,7,9,11,13,15,16,18,20})
            "AR05TXEAAWKNEU-01", "AR06TXEAAWKNEU-02", "AR07TXEAAWKNEU-03",
            "AR09TXEAAWKNEU-04", "AR11TXEAAWKNEU-05", "AR13TXEAAWKNEU-06",
            "AR15TXEAAWKNEU-07", "AR16TXEAAWKNEU-08", "AR18TXEAAWKNEU-09",
            "AR20TXEAAWKNEU-10",
            // seq 11~20 벽걸이 (순환)
            "AR05TXEAAWKNEU-11", "AR06TXEAAWKNEU-12", "AR07TXEAAWKNEU-13",
            "AR09TXEAAWKNEU-14", "AR11TXEAAWKNEU-15", "AR13TXEAAWKNEU-16",
            "AR15TXEAAWKNEU-17", "AR16TXEAAWKNEU-18", "AR18TXEAAWKNEU-19",
            "AR20TXEAAWKNEU-20",
            // seq 21~30 벽걸이 (순환)
            "AR05TXEAAWKNEU-21", "AR06TXEAAWKNEU-22", "AR07TXEAAWKNEU-23",
            "AR09TXEAAWKNEU-24", "AR11TXEAAWKNEU-25", "AR13TXEAAWKNEU-26",
            "AR15TXEAAWKNEU-27", "AR16TXEAAWKNEU-28", "AR18TXEAAWKNEU-29",
            "AR20TXEAAWKNEU-30",
            // seq 31~38 스탠드 (pyongStand = {15,17,18,20,23,25,26,30})
            "AF15BX1NWAEAH-31", "AF17BX1NWAEAH-32", "AF18BX1NWAEAH-33",
            "AF20BX1NWAEAH-34", "AF23BX1NWAEAH-35", "AF25BX1NWAEAH-36",
            "AF26BX1NWAEAH-37", "AF30BX1NWAEAH-38",
            // seq 39~46 스탠드 (순환)
            "AF15BX1NWAEAH-39", "AF17BX1NWAEAH-40", "AF18BX1NWAEAH-41",
            "AF20BX1NWAEAH-42", "AF23BX1NWAEAH-43", "AF25BX1NWAEAH-44",
            "AF26BX1NWAEAH-45", "AF30BX1NWAEAH-46",
            // seq 47~50 스탠드 (순환)
            "AF15BX1NWAEAH-47", "AF17BX1NWAEAH-48", "AF18BX1NWAEAH-49",
            "AF20BX1NWAEAH-50",
            // seq 51~63 DVM-S (hpDvm = {3,4,5,6,7,8,10,12,14,16,18,20,22})
            "AM030BNNDEH-51", "AM040BNNDEH-52", "AM050BNNDEH-53",
            "AM060BNNDEH-54", "AM070BNNDEH-55", "AM080BNNDEH-56",
            "AM100BNNDEH-57", "AM120BNNDEH-58", "AM140BNNDEH-59",
            "AM160BNNDEH-60", "AM180BNNDEH-61", "AM200BNNDEH-62",
            "AM220BNNDEH-63",
            // seq 64~75 DVM-S (순환)
            "AM030BNNDEH-64", "AM040BNNDEH-65", "AM050BNNDEH-66",
            "AM060BNNDEH-67", "AM070BNNDEH-68", "AM080BNNDEH-69",
            "AM100BNNDEH-70", "AM120BNNDEH-71", "AM140BNNDEH-72",
            "AM160BNNDEH-73", "AM180BNNDEH-74", "AM200BNNDEH-75",
            // seq 76~85 천장형 ((idx+1)*100 → 100,200,...,1000)
            "AC100CNCDEH-76", "AC200CNCDEH-77", "AC300CNCDEH-78",
            "AC400CNCDEH-79", "AC500CNCDEH-80", "AC600CNCDEH-81",
            "AC700CNCDEH-82", "AC800CNCDEH-83", "AC900CNCDEH-84",
            "AC1000CNCDEH-85",
            // seq 86~95 공기청정기 (m2 = {17,23,30,35,40,50,60,75,90,100})
            "AX17B17NNDB-86", "AX23B23NNDB-87", "AX30B30NNDB-88",
            "AX35B35NNDB-89", "AX40B40NNDB-90", "AX50B50NNDB-91",
            "AX60B60NNDB-92", "AX75B75NNDB-93", "AX90B90NNDB-94",
            "AX100B100NNDB-95",
            // seq 96~100 부속 (고정 5종)
            "PIPE-CU-15A", "PIPE-CU-22A", "INSUL-T20",
            "REMOTE-MR-DH00", "COMM-MIM-N10"
    };

    /**
     * user-service V5가 보장하는 활성 dev 계정 UUID 풀 — requesterId / acceptor / inspector 순환.
     * loginId를 requesterId에 저장하던 legacy seed 결함을 방지하고 gateway UUID 형식과 맞춘다.
     */
    private static final List<String> EMPLOYEE_UUIDS = List.of(
            "a0000000-0000-0000-0000-000000000001",
            "a0000000-0000-0000-0000-000000000002",
            "a0000000-0000-0000-0000-000000000003",
            "a0000000-0000-0000-0000-000000000004",
            "a0000000-0000-0000-0000-000000000005",
            "a0000000-0000-0000-0000-000000000006",
            "a0000000-0000-0000-0000-000000000007");

    /** loginId → 한국어 이름 매핑 (requesterName / acceptorName 캐싱용 reference, 추후 사용 예정). */
    @SuppressWarnings("unused")
    private static final Map<String, String> EMPLOYEE_NAMES = Map.ofEntries(
            Map.entry("kimmiseon", "김미선"),
            Map.entry("janyeonggu", "장영구"),
            Map.entry("obyeongseung", "오병승"),
            Map.entry("hongjisu", "홍지수"),
            Map.entry("kimgicheol", "김기철"),
            Map.entry("simmigwang", "심미광"),
            Map.entry("jeongminguk", "정민국"),
            Map.entry("leejiyong", "이지용"),
            Map.entry("gyeonjinseong", "견진성"),
            Map.entry("parkeunwoo", "박은우"),
            Map.entry("sinhyeonmin", "신현민"),
            Map.entry("leeseongmi", "이성미"),
            Map.entry("heoyujin", "허유진"),
            Map.entry("rahaeram", "라해람"),
            Map.entry("kimeunji", "김은지"),
            Map.entry("parkjisu", "박지수"));

    /** 30건만 채울 프로젝트명 풀 — DAY/SAVED/SENT 등 일부 슬립에서 순환. */
    private static final List<String> PROJECT_NAMES = List.of(
            "삼성 강남점 신규", "LG 부산 리뉴얼", "현대 분당 본사", "SK 광화문 사옥",
            "신세계 강남점", "롯데 잠실 타워", "GS 칼텍스 사옥", "한화 본사 리모델링",
            "포스코 송도", "농협 본관", "KB 여의도 사옥", "신한 본점",
            "우리은행 본사", "삼성생명 강남", "한국전력 본관", "현대제철 당진",
            "대우조선 거제", "두산중공업 창원", "LG화학 대전", "롯데케미칼 울산",
            "SK이노베이션 울산", "GS칼텍스 여수", "현대오일 울산", "S-Oil 온산",
            "포스코건설 송도", "삼성물산 강남", "현대건설 계동", "대우건설 신문로",
            "DL E&C 광화문", "GS건설 종로");

    /** 10명 기사 풀 — DeliveryBatchSeeder 와 동일. */
    private static final List<String> DRIVER_NAMES = List.of(
            "김배송", "이운송", "박물류", "최운반", "정수송",
            "강택배", "조이동", "윤보내", "임가져", "한받기");

    /** Slice B 자동 그룹화의 키. SHIPPING+ 단계 OUTBOUND 슬립이 batch 와 매핑. */
    private static final String DRIVER_PHONE_PATTERN = "010-1000-%04d";

    private final SlipRepository slipRepository;
    private final SlipClosedDateGuard closedDateGuard;
    private final ProductClient productClient;

    @PersistenceContext
    private EntityManager entityManager;

    public SlipSeeder(SlipRepository slipRepository, SlipClosedDateGuard closedDateGuard,
                      ProductClient productClient) {
        this.slipRepository = slipRepository;
        this.closedDateGuard = closedDateGuard;
        this.productClient = productClient;
    }

    @Override
    @Transactional
    public void run(String... args) {
        try {
            seed(args);
        } catch (RuntimeException ex) {
            if (TransactionSynchronizationManager.isActualTransactionActive()) {
                TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            }
            log.error("[SlipSeeder] 시딩을 건너뜁니다 — 서비스 기동은 계속합니다. 원인: {}",
                    ex.getMessage(), ex);
        }
    }

    private void seed(String... args) {
        log.info("[SlipSeeder] Stage 2 시드 시작 — 100 slip + ~300 line + 11 status 분포");

        Map<UUID, ProductSummary> seedProducts = loadSeedProducts();

        List<SlipSpec> specs = buildSpecs();
        if (specs.size() != 100) {
            throw new IllegalStateException("SlipSpec 분포 검증 실패 — 기대 100, 실제 " + specs.size());
        }

        Map<SequenceKey, Integer> seqByDateType = new HashMap<>();
        int created = 0;
        int skipped = 0;

        // 시드 슬립을 생성 순서대로 (DRAFT → CONFIRMED) 처리하기 위해 정렬 안 함 — spec idx 순.
        for (SlipSpec spec : specs) {
            LocalDate slipDate = computeSlipDate(spec.idx());
            int seqNo = seqByDateType.merge(new SequenceKey(slipDate, spec.type()), 1, Integer::sum);
            String slipNo = formatSlipNo(slipDate, seqNo);

            if (slipRepository.findBySlipTypeAndSlipNoIncludingDeleted(spec.type().name(), slipNo).isPresent()) {
                skipped++;
                continue;
            }

            try {
                closedDateGuard.assertAllowed(spec.type(), slipDate, EMPLOYEE_UUIDS.get(spec.idx() % EMPLOYEE_UUIDS.size()));
                Slip slip = buildAndTransition(spec, slipNo, slipDate, seqNo, seedProducts);
                slipRepository.save(slip);
                created++;
            } catch (RuntimeException ex) {
                log.error("[SlipSeeder] 시드 실패 slipNo={} status={} : {}",
                        slipNo, spec.targetStatus(), ex.getMessage());
                throw ex;
            }
        }
        log.info("[SlipSeeder] 완료 — 신규 {}건, skip {}건 (총 {}건)",
                created, skipped, created + skipped);
    }

    /**
     * 전표 시드를 저장하기 전에 product-service의 master 100건을 벌크 확인한다.
     * product_db와 slip_db가 분리되어 있으므로 DB FK 대신 이 선행 조건을 사용한다.
     */
    private Map<UUID, ProductSummary> loadSeedProducts() {
        List<UUID> expectedIds = new ArrayList<>(HvacSeedProductCatalog.size());
        for (int seq = 1; seq <= HvacSeedProductCatalog.size(); seq++) {
            expectedIds.add(HvacSeedProductCatalog.deterministicProductId(
                    HvacSeedProductCatalog.byOneBasedSeq(seq).modelName()));
        }

        List<ProductSummary> summaries = productClient.lookup(expectedIds);
        Map<UUID, ProductSummary> byId = new HashMap<>();
        for (ProductSummary summary : summaries) {
            if (summary != null && summary.id() != null) {
                byId.put(summary.id(), summary);
            }
        }
        if (byId.size() != expectedIds.size() || !byId.keySet().containsAll(expectedIds)) {
            throw new IllegalStateException("존재하는 product " + expectedIds.size()
                    + "개가 모두 준비되지 않아 SlipSeeder를 중단합니다."
                    + " product-service seed를 먼저 완료하십시오.");
        }
        return byId;
    }

    /**
     * 100건 spec 분포 빌드 — slipType / deliveryTag / targetStatus 의 결정적 조합.
     * 분포 합계 검증을 위해 명시 ArrayList 빌드 (Map 기반 Map.of() 가독성 trade-off 회피).
     *
     * <p>비-CONFIRMED 단계 슬립은 type 별로 균등 배분. SHIPPING/DELIVERED 는 OUTBOUND 한정.
     * REJECTED 는 SENT/ACCEPTED/INSPECTING 단계에서 reject() 호출 — 본 시드는 ACCEPTED 단계에서 reject.
     */
    private List<SlipSpec> buildSpecs() {
        List<SlipSpec> specs = new ArrayList<>(100);
        int idx = 0;

        // ---- DAY tag OUTBOUND 50건 (DRAFT 5 + SAVED 8 + SENT 4 + ACCEPTED 4 + PROCESSING 4
        //                              + INSPECTING 4 + COMPLETED 4 + SHIPPING 5 + DELIVERED 7
        //                              + CONFIRMED 4 + REJECTED 1 = 50)
        idx = appendN(specs, idx, 5, SlipType.OUTBOUND, DeliveryTag.DAY, SlipStatus.DRAFT);
        idx = appendN(specs, idx, 8, SlipType.OUTBOUND, DeliveryTag.DAY, SlipStatus.SAVED);
        idx = appendN(specs, idx, 4, SlipType.OUTBOUND, DeliveryTag.DAY, SlipStatus.SENT);
        idx = appendN(specs, idx, 4, SlipType.OUTBOUND, DeliveryTag.DAY, SlipStatus.ACCEPTED);
        idx = appendN(specs, idx, 4, SlipType.OUTBOUND, DeliveryTag.DAY, SlipStatus.PROCESSING);
        idx = appendN(specs, idx, 4, SlipType.OUTBOUND, DeliveryTag.DAY, SlipStatus.INSPECTING);
        idx = appendN(specs, idx, 4, SlipType.OUTBOUND, DeliveryTag.DAY, SlipStatus.COMPLETED);
        idx = appendN(specs, idx, 5, SlipType.OUTBOUND, DeliveryTag.DAY, SlipStatus.SHIPPING);
        idx = appendN(specs, idx, 7, SlipType.OUTBOUND, DeliveryTag.DAY, SlipStatus.DELIVERED);
        idx = appendN(specs, idx, 4, SlipType.OUTBOUND, DeliveryTag.DAY, SlipStatus.CONFIRMED);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.DAY, SlipStatus.REJECTED);

        // ---- STACK tag OUTBOUND 10건 ("NIGHT" 대체 — STACK 야적 도 OUTBOUND-only).
        //   DRAFT 1 / SAVED 2 / ACCEPTED 1 / PROCESSING 1 / INSPECTING 1 / COMPLETED 1
        //   / DELIVERED 2 / REJECTED 1 = 10
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.STACK, SlipStatus.DRAFT);
        idx = appendN(specs, idx, 2, SlipType.OUTBOUND, DeliveryTag.STACK, SlipStatus.SAVED);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.STACK, SlipStatus.ACCEPTED);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.STACK, SlipStatus.PROCESSING);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.STACK, SlipStatus.INSPECTING);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.STACK, SlipStatus.COMPLETED);
        idx = appendN(specs, idx, 2, SlipType.OUTBOUND, DeliveryTag.STACK, SlipStatus.DELIVERED);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.STACK, SlipStatus.REJECTED);

        // ---- RETURN_RENTAL tag OUTBOUND 10건 (사용자 spec "OUTBOUND + RETURN tag" — RETURN 은 INBOUND-only enum,
        //   RETURN_RENTAL=반납 이 OUTBOUND 회수 의미로 적합).
        //   DRAFT 1 / SAVED 1 / SENT 2 / ACCEPTED 1 / PROCESSING 1 / INSPECTING 1
        //   / COMPLETED 1 / DELIVERED 1 / REJECTED 1 = 10
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.RETURN_RENTAL, SlipStatus.DRAFT);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.RETURN_RENTAL, SlipStatus.SAVED);
        idx = appendN(specs, idx, 2, SlipType.OUTBOUND, DeliveryTag.RETURN_RENTAL, SlipStatus.SENT);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.RETURN_RENTAL, SlipStatus.ACCEPTED);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.RETURN_RENTAL, SlipStatus.PROCESSING);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.RETURN_RENTAL, SlipStatus.INSPECTING);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.RETURN_RENTAL, SlipStatus.COMPLETED);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.RETURN_RENTAL, SlipStatus.DELIVERED);
        idx = appendN(specs, idx, 1, SlipType.OUTBOUND, DeliveryTag.RETURN_RENTAL, SlipStatus.REJECTED);

        // ---- INBOUND 30건 (no tag, INBOUND 단계는 SHIPPING/DELIVERED 미지원).
        //   DRAFT 3 / SAVED 4 / SENT 4 / ACCEPTED 4 / PROCESSING 4 / INSPECTING 4
        //   / COMPLETED 4 / CONFIRMED 1 / REJECTED 2 = 30
        idx = appendN(specs, idx, 3, SlipType.INBOUND, null, SlipStatus.DRAFT);
        idx = appendN(specs, idx, 4, SlipType.INBOUND, null, SlipStatus.SAVED);
        idx = appendN(specs, idx, 4, SlipType.INBOUND, null, SlipStatus.SENT);
        idx = appendN(specs, idx, 4, SlipType.INBOUND, null, SlipStatus.ACCEPTED);
        idx = appendN(specs, idx, 4, SlipType.INBOUND, null, SlipStatus.PROCESSING);
        idx = appendN(specs, idx, 4, SlipType.INBOUND, null, SlipStatus.INSPECTING);
        idx = appendN(specs, idx, 4, SlipType.INBOUND, null, SlipStatus.COMPLETED);
        idx = appendN(specs, idx, 1, SlipType.INBOUND, null, SlipStatus.CONFIRMED);
        idx = appendN(specs, idx, 2, SlipType.INBOUND, null, SlipStatus.REJECTED);

        return specs;
    }

    private int appendN(List<SlipSpec> specs, int idx, int count,
                        SlipType type, DeliveryTag tag, SlipStatus status) {
        for (int i = 0; i < count; i++) {
            specs.add(new SlipSpec(idx, type, tag, status));
            idx++;
        }
        return idx;
    }

    /**
     * Slip 1건을 spec 에 따라 build + transition.
     * 도메인 메서드만 사용 (createOutbound/createInbound, save, send, accept, process, inspect,
     * complete, ship, deliver, confirm, reject).
     */
    private Slip buildAndTransition(SlipSpec spec, String slipNo, LocalDate slipDate, int seqNo,
                                    Map<UUID, ProductSummary> seedProducts) {
        int partnerSeq = (spec.idx() % PARTNER_COUNT) + 1;
        String partnerCode = String.format(PARTNER_CODE_PATTERN, partnerSeq);
        UUID partnerId = deterministicUuid(PARTNER_UUID_PREFIX + partnerCode);
        String partnerName = "거래처-" + partnerCode;

        String requesterId = EMPLOYEE_UUIDS.get(spec.idx() % EMPLOYEE_UUIDS.size());
        String memo = baseMemo(spec, slipNo);

        Slip slip;
        if (spec.type() == SlipType.OUTBOUND) {
            slip = Slip.createOutbound(slipNo, slipDate, seqNo,
                    HQ_WAREHOUSE_ID, null,
                    partnerId, partnerName, spec.tag(), memo, requesterId);
        } else {
            slip = Slip.createInbound(slipNo, slipDate, seqNo,
                    HQ_WAREHOUSE_ID,
                    partnerId, partnerName, spec.tag(), memo, requesterId);
        }

        // SHIPPING+ 단계 OUTBOUND 슬립은 driver 정보 필요 (ship() 후 도메인은 driver 검증 X 지만
        // SMS/링크발송 흐름 정합성을 위해 driver 정보 미리 set).
        if (spec.type() == SlipType.OUTBOUND
                && reachesShipping(spec.targetStatus())) {
            int driverSeq = (spec.idx() % DRIVER_NAMES.size()) + 1;
            slip.setDriverContact(
                    DRIVER_NAMES.get(driverSeq - 1),
                    String.format(DRIVER_PHONE_PATTERN, driverSeq));
        }

        // 라인 추가 — DRAFT 단계에서 1~5개. 결정적 = (spec.idx() % 5) + 1.
        int lineCount = (spec.idx() % 5) + 1;
        for (int li = 0; li < lineCount; li++) {
            // 출처: product-service HvacProductSeeder, 4 seeder 동일 유지 (inventory/slip/partner-order)
            int productSeq = ((spec.idx() * 7 + li * 3) % PRODUCT_MODEL_NAMES.length) + 1;
            HvacSeedProductCatalog.ProductSeed productSeed =
                    HvacSeedProductCatalog.byOneBasedSeq(productSeq);
            String modelName = productSeed.modelName();
            UUID productId = HvacSeedProductCatalog.deterministicProductId(modelName);
            ProductSummary product = seedProducts.get(productId);
            String productName = product.name();
            modelName = product.modelName();
            String specification = sampleSpecification(productSeq);
            int quantity = ((spec.idx() + li) % 10) + 1;  // 1~10
            BigDecimal unitPrice = computeUnitPrice(productSeq);
            String note = li == 0 ? "Stage 2 시드" : null;

            SlipLine line = SlipLine.create(slip, productId, productName, modelName,
                    specification, quantity, unitPrice, note);
            slip.addLine(line);
        }

        // 도메인 메서드 chain 으로 target status 까지 transition.
        applyTransitions(slip, spec);

        return slip;
    }

    /**
     * spec.targetStatus() 까지 도메인 메서드로 단계별 전이.
     * 잘못된 전이는 도메인이 BusinessException(CONFLICT) 를 던지므로 시드 빌드 자체가 실패.
     */
    private void applyTransitions(Slip slip, SlipSpec spec) {
        SlipStatus target = spec.targetStatus();
        if (target == SlipStatus.DRAFT) {
            return;
        }

        slip.save();
        if (target == SlipStatus.SAVED) return;

        slip.send();
        if (target == SlipStatus.SENT) return;

        if (target == SlipStatus.REJECTED) {
            // 다양화: ACCEPTED 단계까지 진전 후 reject (사용자 spec "memo 에 [반려: {사유}] prepend").
            slip.accept(EMPLOYEE_UUIDS.get((spec.idx() + 1) % EMPLOYEE_UUIDS.size()));
            slip.reject("재고 불일치 — 수량 재확인 필요");
            return;
        }

        slip.accept(EMPLOYEE_UUIDS.get((spec.idx() + 1) % EMPLOYEE_UUIDS.size()));
        if (target == SlipStatus.ACCEPTED) return;

        slip.process();
        if (target == SlipStatus.PROCESSING) return;

        slip.complete();   // PROCESSING → INSPECTING (도메인 의미상 "출고완료=검수단계 진입")
        if (target == SlipStatus.INSPECTING) return;

        slip.inspect(EMPLOYEE_UUIDS.get((spec.idx() + 2) % EMPLOYEE_UUIDS.size()));
        if (target == SlipStatus.COMPLETED) return;

        // OUTBOUND 만 SHIPPING/DELIVERED 단계 진입 가능 (INBOUND 는 COMPLETED → CONFIRMED 직행).
        if (spec.type() == SlipType.OUTBOUND) {
            slip.ship();
            if (target == SlipStatus.SHIPPING) return;

            slip.deliver();
            if (target == SlipStatus.DELIVERED) return;
        }

        slip.confirm();
        // CONFIRMED 가 최종.
    }

    private static boolean reachesShipping(SlipStatus target) {
        return target == SlipStatus.SHIPPING
                || target == SlipStatus.DELIVERED
                || target == SlipStatus.CONFIRMED;
    }

    /**
     * 슬립 날짜 결정성 — 2026-01-01 ~ 2026-05-09 (129일) 분포. idx % 129 일자 offset.
     * 같은 일자에 1~5건 spread (seqByDate 가 자동 채번).
     */
    private static LocalDate computeSlipDate(int idx) {
        LocalDate base = LocalDate.of(2026, 1, 1);
        int dayOffset = idx % 129;
        return base.plusDays(dayOffset);
    }

    /** "yyyy/MM/dd-N" 포맷. SlipNumberSequence 미경유 — 시드 결정적 채번. */
    private static String formatSlipNo(LocalDate slipDate, int seqNo) {
        return String.format("%04d/%02d/%02d-%d",
                slipDate.getYear(), slipDate.getMonthValue(), slipDate.getDayOfMonth(), seqNo);
    }

    /**
     * 시드 메모 — 30건은 프로젝트명, 10건은 감리주소 표시, 나머지는 일반 메모.
     */
    private String baseMemo(SlipSpec spec, String slipNo) {
        StringBuilder sb = new StringBuilder("[Stage 2 시드] ");
        if (spec.idx() < 30) {
            sb.append("프로젝트=").append(PROJECT_NAMES.get(spec.idx()));
        } else if (spec.idx() < 40) {
            // 감리주소 10건 — 메모에 임베드 (별도 컬럼 없음 — 도메인 미보강 가드).
            sb.append("감리주소=서울시 강남구 테헤란로 ").append(100 + spec.idx()).append("길 ").append(spec.idx() + 1);
        } else {
            sb.append("표준 시드 슬립 idx=").append(spec.idx());
        }
        sb.append(" / 인수자=010-").append(String.format("%04d", 1000 + spec.idx() % 9000))
          .append("-").append(String.format("%04d", spec.idx() * 13 % 9000 + 1000));
        return sb.toString();
    }

    /**
     * 샘플 규격 — productSeq 기반 결정적 표본 (사용자 피드백 #4 Slice A 의 specification 컬럼).
     */
    private static String sampleSpecification(int productSeq) {
        String[] samples = {"220V", "380V", "4HP", "Φ80×L1200", "5kW",
                            "DC24V", "AC110V", "30A", "50Hz", "60Hz"};
        return samples[productSeq % samples.length];
    }

    /**
     * 결정적 단가 — productSeq 기반. 100,000 ~ 1,099,000 범위.
     * Stage 1 product.outboundPrice 시드 부재 시 fallback 결정성.
     */
    private static BigDecimal computeUnitPrice(int productSeq) {
        long base = 100_000L + (productSeq * 9973L) % 1_000_000L;
        // 1,000 단위로 round.
        return BigDecimal.valueOf((base / 1000L) * 1000L);
    }

    /** Type-3 (name-based MD5) UUID. */
    private static UUID deterministicUuid(String name) {
        return UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 시드 spec — slipType / deliveryTag / 최종 status 의 결정적 조합.
     *
     * @param idx       0~99 글로벌 순서 (slipDate / partnerCode / productSeq 결정 source)
     * @param type      OUTBOUND / INBOUND
     * @param tag       DAY / STACK / RETURN_RENTAL / null (INBOUND)
     * @param targetStatus 도메인 메서드 chain 으로 도달할 최종 status
     */
    private record SlipSpec(int idx, SlipType type, DeliveryTag tag, SlipStatus targetStatus) {}

    /** 전표번호 공개 순번 범위 — 날짜 + 전표 유형별 독립 증가. */
    private record SequenceKey(LocalDate slipDate, SlipType slipType) {}
}
