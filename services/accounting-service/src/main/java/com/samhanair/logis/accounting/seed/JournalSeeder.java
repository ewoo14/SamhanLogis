package com.samhanair.logis.accounting.seed;

import com.samhanair.logis.common.financial.VatAmountCalculator;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.repository.JournalRepository;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.math.RoundingMode;
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
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stage 4 (back-office) local-test seed — accounting-service 분개장 50건.
 *
 * <p>분포:
 * <ul>
 *   <li>SLIP_ISSUE 30건 — 차변 1089(외상매출금) / 대변 4019(상품매출) + 2559(부가세예수금)</li>
 *   <li>PAYMENT 10건 — 차변 1039(보통예금) / 대변 1089(외상매출금)</li>
 *   <li>SGA 5건 — 차변 8029(급여) or 8139(통신비) / 대변 1039(보통예금)</li>
 *   <li>ADJUSTMENT 5건 — 차변 8239(감가상각비) / 대변 2024(건물, 충당금 대용)</li>
 * </ul>
 *
 * <p>상태 분포 — DRAFT 5 / POSTED 40 / REVERSED 5. 한국 일반기업회계기준 표준 코드 (V1 시드)
 * 만 사용. 모든 분개는 sum(debit)=sum(credit) 강제 (Journal.post 게이트키퍼 + DB CHECK ck_journal_lines_amount_xor).
 *
 * <p><b>이중 가드</b>: {@code @Profile("dev")} + {@code app.accounting.seed-test-data=true} 둘 다 만족 시만
 * 실행. 운영 / staging 환경 데이터 오염 방지. application.yml default {@code false}.
 *
 * <p><b>Idempotency</b>: {@link JournalRepository#existsById(Object)} 로 결정적 UUID 중복 확인 후 skip.
 * 모든 Journal UUID 는 {@code UUID.nameUUIDFromBytes("samhan-seed:journal:seq:" + seq)} 결정 도출.
 * journal_no 는 {@code yyyy/MM/dd-N} 형식이며 N 은 해당 분개 일자 내 1-based 순번이다.
 *
 * <p><b>외부 의존</b>:
 * <ul>
 *   <li>Stage 1 partner UUID — {@code samhan-seed:partner:P-2026-NNNN} 결정 도출 (50건)</li>
 *   <li>Stage 2 slip 번호 — slip-service {@code SlipSeeder.formatSlipNo} 와 동일한 {@code yyyy/MM/dd-N}
 *       포맷으로 전표번호 텍스트를 산출 (SLIP_ISSUE 30건만). 적요/참조 텍스트의 전표번호 표기 일관성 확보가
 *       목적이며, slip 엔티티의 실제 PK 와 매칭하지는 않는다 ({@code slips.id} 는 {@code @UuidGenerator} 가
 *       random 부여, journal {@code source_ref_id} 는 번호 hash 라 cross-DB row 매칭 불가).</li>
 *   <li>16 employee — kimaccountant / leeseongmi 등 한글 이름 → samhan-seed:employee:&lt;loginId&gt;</li>
 * </ul>
 *
 * <p><b>도메인 메서드 사용</b>: {@link Journal#create} + {@link Journal#addLine} + {@link Journal#post}
 * 정상 라이프사이클을 따라 차/대 합계 일치 강제 검증. REVERSED 상태는 post 후 markReversed 호출.
 * DRAFT 5건은 post 호출 생략. 결정적 UUID 부여를 위해 reflection 으로 id 직접 set
 * (Journal/JournalLine 모두 @UuidGenerator 가 random 부여하는 것을 결정 UUID 로 override).
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.accounting.seed-test-data", havingValue = "true")
@Order(40)
public class JournalSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(JournalSeeder.class);

    /** 한국 표준 계정과목 코드 (V1__init_accounting_service.sql 기준). */
    /** V101 계정 코드 정본을 사용하는 개발용 전표 시드. */
    private static final String CODE_BANK_DEPOSIT = "1039"; // 보통예금
    private static final String CODE_RECEIVABLE   = "1089"; // 외상매출금
    private static final String CODE_BUILDING     = "2024"; // 건물
    private static final String CODE_VAT_PAYABLE  = "2559"; // 부가세예수금
    private static final String CODE_SALES        = "4019"; // 상품매출
    private static final String CODE_SALARY       = "8029"; // 급여
    private static final String CODE_TELECOM      = "8139"; // 통신비
    private static final String CODE_DEPRECIATION = "8239"; // 감가상각비

    /** 16 employee 중 회계 담당자 5명 (loginId 기준). 분개 게시자 / SGA 적요 생성에 활용. */
    private static final String[] ACCOUNTANT_LOGINS =
            {"leeseongmi", "heoyujin", "rahaeram", "kimeunji", "parkjisu"};

    /** Stage 2 slip 100건 표준 번호 형식 — yyyy/MM/dd-N. seq → 결정적 1건 매핑. */
    private static final LocalDate SLIP_BASE_DATE = LocalDate.of(2026, 4, 1);

    /** Stage 1 partner code 형식 — Stage 1 PartnerSeeder 의 P-2026-NNNN. */
    private static final String PARTNER_CODE_FMT = "P-2026-%04d";

    /** Journal 분개 일자 분포 시작 — 2026-01-01 ~ 2026-05-09 (130일). */
    private static final LocalDate JOURNAL_BASE_DATE = LocalDate.of(2026, 1, 1);
    private static final LocalDate JOURNAL_LAST_DATE = LocalDate.of(2026, 5, 9);

    private final JournalRepository journalRepository;

    public JournalSeeder(JournalRepository journalRepository) {
        this.journalRepository = journalRepository;
    }

    @Override
    @Transactional
    public void run(String... args) {
        int created = 0;
        int skipped = 0;
        long debitGrand = 0L;
        long creditGrand = 0L;
        Map<LocalDate, Integer> journalNoCounters = new HashMap<>();

        // 30 SLIP_ISSUE + 10 PAYMENT + 5 SGA + 5 ADJUSTMENT = 50
        for (int seq = 1; seq <= 50; seq++) {
            JournalSpec spec = pickSpec(seq);
            LocalDate journalDate = pickJournalDate(seq);
            String journalNo = nextJournalNo(journalDate, journalNoCounters);
            UUID journalId = deterministicId("journal", "seq:" + seq);

            // Idempotent — UUID + journalNo 양쪽 체크 (cleanup 후 deterministic UUID 가
            // random 생성된 잔존 row 와 충돌 회피).
            if (journalRepository.existsById(journalId)
                    || journalRepository.existsByJournalNo(journalNo)) {
                skipped++;
                log.debug("Skipping journal seed (already present): {}", journalNo);
                continue;
            }

            try {
                Journal journal = buildJournal(seq, spec, journalNo, journalDate, journalId);
                Journal saved = journalRepository.save(journal);
                created++;
                BigDecimal d = saved.totalDebit();
                BigDecimal c = saved.totalCredit();
                debitGrand += d.longValue();
                creditGrand += c.longValue();
                if (d.compareTo(c) != 0) {
                    // 이중 가드 — 도메인 검증 통과했음에도 합계 mismatch (방어)
                    throw new IllegalStateException(
                            "복식부기 invariant 위반 — journal=" + journalNo
                                    + " debit=" + d + " credit=" + c);
                }
            } catch (RuntimeException ex) {
                log.error("Failed to seed journal {}: {}", journalNo, ex.getMessage(), ex);
            }
        }

        log.info("JournalSeeder created {} journals (skipped {})", created, skipped);
        log.info("JournalSeeder 복식부기 invariant — sum(debit)={} sum(credit)={} {}",
                debitGrand, creditGrand,
                debitGrand == creditGrand ? "OK" : "MISMATCH");
    }

    // ------------------------------------------------------------------
    // 분개 생성 — type 별 라인 패턴
    // ------------------------------------------------------------------

    private Journal buildJournal(int seq, JournalSpec spec, String journalNo,
                                 LocalDate journalDate, UUID journalId) {
        UUID partnerId = deterministicId("partner",
                String.format(PARTNER_CODE_FMT, ((seq - 1) % 50) + 1));
        UUID sourceRefId = null;
        String description;

        switch (spec.type) {
            case SLIP_ISSUE -> {
                String slipNo = pickSlipNo(seq); // 30 SLIP_ISSUE — 전표번호 텍스트만 생성 (slip-service 와 동일 포맷)
                // source_ref_id 는 전표번호 hash 로 도출한 시드 전용 결정값일 뿐, slip_db.slips.id (random PK) 와는
                // cross-DB 매칭하지 않는다. 적요/참조 표기의 전표번호 일관성만 보장한다.
                sourceRefId = deterministicId("slip", slipNo);
                description = String.format("전표 %s 자동 분개 (출하 매출)", slipNo);
            }
            case PAYMENT -> description = String.format("거래처 %s 외상매출금 회수",
                    String.format(PARTNER_CODE_FMT, ((seq - 1) % 50) + 1));
            case SGA -> description = (seq % 2 == 0)
                    ? String.format("%s 사원 급여 지급 (SGA)", pickAccountant(seq))
                    : "사무실 통신비 (SGA)";
            case ADJUSTMENT -> description = "월말 감가상각 조정 분개";
            default -> description = "수동 분개";
        }

        Journal journal = Journal.create(journalNo, journalDate, description,
                spec.sourceType, sourceRefId);
        forceId(journal, journalId);

        // 라인 추가 — type 별 차/대 라인 패턴
        List<LineSpec> lines = buildLineSpecs(seq, spec, partnerId);
        int lineNo = 1;
        for (LineSpec ls : lines) {
            JournalLine line = JournalLine.create(journal, lineNo,
                    ls.accountCode, ls.debit, ls.credit, ls.partnerId, ls.memo);
            forceId(line, deterministicId("journal-line", "seq:" + seq + ":" + lineNo));
            journal.addLine(line);
            lineNo++;
        }

        // 상태 transition
        applyStatus(journal, seq, spec);
        return journal;
    }

    /** type 별 라인 분개 패턴 — 합계 invariant 강제. */
    private List<LineSpec> buildLineSpecs(int seq, JournalSpec spec, UUID partnerId) {
        List<LineSpec> lines = new ArrayList<>();
        switch (spec.type) {
            case SLIP_ISSUE -> {
                // 매출 1,000,000 ~ 30,000,000 결정적 분포
                long net = 1_000_000L + ((seq * 137) % 30) * 1_000_000L;
                long vat = VatAmountCalculator.fromSupply(BigDecimal.valueOf(net)).longValueExact();
                long total = net + vat;
                lines.add(new LineSpec(CODE_RECEIVABLE,
                        BigDecimal.valueOf(total), BigDecimal.ZERO, partnerId,
                        "외상매출금 (부가세포함)"));
                lines.add(new LineSpec(CODE_SALES,
                        BigDecimal.ZERO, BigDecimal.valueOf(net), partnerId,
                        "상품매출 (공급가액)"));
                lines.add(new LineSpec(CODE_VAT_PAYABLE,
                        BigDecimal.ZERO, BigDecimal.valueOf(vat), partnerId,
                        "부가세예수금 (10%)"));
            }
            case PAYMENT -> {
                long total = 500_000L + ((seq * 211) % 30) * 100_000L;
                lines.add(new LineSpec(CODE_BANK_DEPOSIT,
                        BigDecimal.valueOf(total), BigDecimal.ZERO, partnerId,
                        "보통예금 입금 (외상매출금 회수)"));
                lines.add(new LineSpec(CODE_RECEIVABLE,
                        BigDecimal.ZERO, BigDecimal.valueOf(total), partnerId,
                        "외상매출금 회수"));
            }
            case SGA -> {
                long amount = 200_000L + ((seq * 53) % 20) * 100_000L;
                String accountCode = (seq % 2 == 0) ? CODE_SALARY : CODE_TELECOM;
                String memo = (seq % 2 == 0) ? "급여 지급" : "통신비 지급";
                lines.add(new LineSpec(accountCode,
                        BigDecimal.valueOf(amount), BigDecimal.ZERO, null, memo));
                lines.add(new LineSpec(CODE_BANK_DEPOSIT,
                        BigDecimal.ZERO, BigDecimal.valueOf(amount), null,
                        "보통예금 출금"));
            }
            case ADJUSTMENT -> {
                // 월말 감가상각 조정 — 차변 8239(감가상각비) / 대변 2024(건물).
                // 표준 회계상 감가상각누계액 컬럼 별도 존재가 정석이나 V1 시드는
                // 누계액 코드 미보유 → 자산 차감 직접 처리 (테스트 데이터 한정 단순화).
                long depreciation = 100_000L + ((seq * 89) % 10) * 50_000L;
                BigDecimal amount = BigDecimal.valueOf(depreciation)
                        .setScale(2, RoundingMode.HALF_UP);
                lines.add(new LineSpec(CODE_DEPRECIATION,
                        amount, BigDecimal.ZERO, null, "월말 감가상각비 인식"));
                lines.add(new LineSpec(CODE_BUILDING,
                        BigDecimal.ZERO, amount, null, "건물 자산 감액"));
            }
            default -> throw new IllegalStateException("Unknown spec type: " + spec.type);
        }
        return lines;
    }

    /** 상태 transition — DRAFT 5 / POSTED 40 / REVERSED 5. */
    private void applyStatus(Journal journal, int seq, JournalSpec spec) {
        // DRAFT — seq 1, 11, 21, 31, 41 (5건)
        if (seq % 10 == 1) {
            return;
        }
        // 일반 POSTED 처리 (DRAFT 외 45건은 일단 POST 시도)
        try {
            journal.post(pickAccountant(seq));
        } catch (RuntimeException ex) {
            log.error("post 실패 — journal={} reason={}", journal.getJournalNo(), ex.getMessage());
            return;
        }
        // REVERSED 5건 — seq 5, 15, 25, 35, 45 (POSTED 후 markReversed)
        if (seq % 10 == 5) {
            journal.markReversed();
        }
    }

    // ------------------------------------------------------------------
    // type 분포 — 30 SLIP_ISSUE / 10 PAYMENT / 5 SGA / 5 ADJUSTMENT
    // ------------------------------------------------------------------

    private JournalSpec pickSpec(int seq) {
        if (seq <= 30) {
            return new JournalSpec(SeedType.SLIP_ISSUE, JournalSourceType.SLIP);
        }
        if (seq <= 40) {
            return new JournalSpec(SeedType.PAYMENT, JournalSourceType.MANUAL);
        }
        if (seq <= 45) {
            return new JournalSpec(SeedType.SGA, JournalSourceType.MANUAL);
        }
        return new JournalSpec(SeedType.ADJUSTMENT, JournalSourceType.CLOSING);
    }

    private LocalDate pickJournalDate(int seq) {
        long span = JOURNAL_LAST_DATE.toEpochDay() - JOURNAL_BASE_DATE.toEpochDay();
        long offset = (seq - 1) * 3L; // 0, 3, 6, ...
        if (offset > span) {
            offset = offset % (span + 1);
        }
        return JOURNAL_BASE_DATE.plusDays(offset);
    }

    private String nextJournalNo(LocalDate journalDate, Map<LocalDate, Integer> counters) {
        int seqInDay = counters.merge(journalDate, 1, Integer::sum);
        return String.format("%d/%02d/%02d-%d",
                journalDate.getYear(), journalDate.getMonthValue(), journalDate.getDayOfMonth(), seqInDay);
    }

    /** 30 SLIP_ISSUE 에 매핑할 slip 번호 — Stage 2 의 100 slip 중 결정적 30건. */
    private String pickSlipNo(int seq) {
        // 4월 1일부터 결정적 분포 — yyyy/MM/dd-N, SlipSeeder.formatSlipNo 와 동일.
        LocalDate date = SLIP_BASE_DATE.plusDays((seq - 1) * 2L);
        int seqInDay = ((seq - 1) % 9) + 1;
        return String.format("%d/%02d/%02d-%d",
                date.getYear(), date.getMonthValue(), date.getDayOfMonth(), seqInDay);
    }

    private String pickAccountant(int seq) {
        return ACCOUNTANT_LOGINS[seq % ACCOUNTANT_LOGINS.length];
    }

    // ------------------------------------------------------------------
    // 공용 — 결정적 UUID + reflection set
    // ------------------------------------------------------------------

    /**
     * {@code samhan-seed:&lt;type&gt;:&lt;key&gt;} 결정적 UUID 도출 — Stage 1/2/3/4 seeder
     * 모두 동일 namespace 패턴 사용 의무 (cross-stage 참조 정합).
     */
    static UUID deterministicId(String type, String key) {
        return UUID.nameUUIDFromBytes(("samhan-seed:" + type + ":" + key).getBytes(StandardCharsets.UTF_8));
    }

    /** Hibernate 의 {@code @UuidGenerator} 가 random UUID 부여하기 전에 결정 UUID 강제 주입. */
    private static void forceId(Object entity, UUID id) {
        try {
            Field f = entity.getClass().getDeclaredField("id");
            f.setAccessible(true);
            f.set(entity, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Failed to set deterministic id on "
                    + entity.getClass().getSimpleName(), e);
        }
    }

    private enum SeedType { SLIP_ISSUE, PAYMENT, SGA, ADJUSTMENT }

    private record JournalSpec(SeedType type, JournalSourceType sourceType) { }

    private record LineSpec(String accountCode,
                            BigDecimal debit,
                            BigDecimal credit,
                            UUID partnerId,
                            String memo) { }
}
