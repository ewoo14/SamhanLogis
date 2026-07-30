package com.samhanair.logis.groupware.seed;

import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.ApprovalStep;
import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.groupware.domain.Schedule;
import com.samhanair.logis.groupware.domain.ScheduleParticipant;
import com.samhanair.logis.groupware.domain.ScheduleStatus;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.groupware.repository.ScheduleRepository;
import com.samhanair.logis.groupware.service.ApprovalNumberService;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
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
 * Stage 4 (back-office) local-test seed — groupware-service 전자결재 / 메신저 / 일정.
 *
 * <p>건수 분포:
 * <ul>
 *   <li>{@link ApprovalLine} 8건 + {@link ApprovalStep} 16건 (각 라인당 2단계)
 *       — PENDING 3 / APPROVED 4 / REJECTED 1</li>
 *   <li>{@link Message} 20건 — 16 employee 순환 송수신, seq%3==0 미열람</li>
 *   <li>{@link Schedule} 5건 + {@link ScheduleParticipant} 15건 — 등록자 포함 3명 대상</li>
 * </ul>
 *
 * <p><b>이중 가드</b>: {@code @Profile("dev")} + {@code app.groupware.seed-test-data=true} 둘 다 true 시 실행.
 *
 * <p><b>Idempotency</b>: 결정적 UUID ({@code samhan-seed:&lt;type&gt;:&lt;key&gt;}) 로 existsById skip.
 *
 * <p><b>외부 의존</b>: 16 employee — loginId 기반 deterministic UUID
 * ({@code samhan-seed:employee:&lt;loginId&gt;}). 부서장 / 임원 employee 결재자 chain.
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.groupware.seed-test-data", havingValue = "true")
@Order(50)
public class GroupwareSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(GroupwareSeeder.class);

    /** OrgChartSeeder 가 시드한 16 employee — loginId 결정 도출 (samhan-seed:employee:&lt;loginId&gt;). */
    private static final String[] EMPLOYEE_LOGINS = {
            "kimmiseon",     // 대표
            "janyeonggu",    // 전무
            "obyeongseung",  // 영업1팀 이사
            "hongjisu",
            "kimgicheol",    // 영업2팀 부장
            "simmigwang",
            "jeongminguk",
            "leejiyong",
            "gyeonjinseong", // 영업3팀 차장
            "parkeunwoo",
            "sinhyeonmin",
            "leeseongmi",    // 회계 사원
            "heoyujin",
            "rahaeram",
            "kimeunji",
            "parkjisu"
    };

    /** 결재선 8건 — 제목 / 본문 / 결재자 chain (2단계: 직속상사 + 임원). */
    private static final ApprovalSeed[] APPROVAL_SEEDS = {
            new ApprovalSeed("2026년 5월 휴가 신청 - 김철수",
                    "5/15 ~ 5/17 (3일) 가족 여행 휴가 신청합니다.",
                    "hongjisu", "obyeongseung", "janyeonggu"),
            new ApprovalSeed("창고 재고 부족 보고 - 1번 창고 6kW 모델",
                    "수도권 1번 창고 6kW 에어컨 재고 5대 미만 — 긴급 발주 요청.",
                    "simmigwang", "kimgicheol", "obyeongseung"),
            new ApprovalSeed("거래처 단가 인상 요청 - VIP 5개사",
                    "원자재 인상 반영, VIP 거래처 5개사 단가 5% 인상안 검토.",
                    "jeongminguk", "kimgicheol", "janyeonggu"),
            new ApprovalSeed("2026년 5월 영업회의 출장 결재",
                    "부산 거래처 5개사 방문 (5/20~5/22) — 차량 + 숙박 정산.",
                    "leejiyong", "kimgicheol", "obyeongseung"),
            new ApprovalSeed("법인카드 한도 증액 요청",
                    "신규 거래처 회식 증가 — 월 한도 200만원 → 300만원 증액.",
                    "parkeunwoo", "gyeonjinseong", "janyeonggu"),
            new ApprovalSeed("교육 참석 결재 - HVAC 기술 세미나",
                    "5/30 강남 코엑스 — 회사 비용 부담 (등록비 50만원).",
                    "sinhyeonmin", "gyeonjinseong", "obyeongseung"),
            new ApprovalSeed("월말 재고 실사 일정 결재",
                    "5/31 토요일 — 1/2번 창고 전수 실사. 5명 출근 OT 신청.",
                    "leeseongmi", "obyeongseung", "janyeonggu"),
            new ApprovalSeed("연차 사용 신청 - 박지수",
                    "5/22 (금) 가정사 연차 1일 사용.",
                    "parkjisu", "leeseongmi", "janyeonggu")
    };

    /** Schedule 5건 — 제목 / 소유자 / 시작·종료 시각 / 참여자 loginId. */
    private static final ScheduleSeed[] SCHEDULE_SEEDS = {
            new ScheduleSeed("월간 영업회의",
                    "obyeongseung", LocalDateTime.of(2026, 5, 11, 10, 0),
                    LocalDateTime.of(2026, 5, 11, 12, 0),
                    "본사 회의실 — 5월 매출 리뷰 + 6월 목표 설정.",
                    new String[] {"kimgicheol", "gyeonjinseong"}),
            new ScheduleSeed("거래처 미팅 - (주)서울에어컨",
                    "kimgicheol", LocalDateTime.of(2026, 5, 13, 14, 0),
                    LocalDateTime.of(2026, 5, 13, 16, 0),
                    "단가 협상 + 6월 발주 사전 협의.",
                    new String[] {"hongjisu", "simmigwang"}),
            new ScheduleSeed("연차 휴가 - 견진성 차장",
                    "gyeonjinseong", LocalDateTime.of(2026, 5, 18, 0, 0),
                    LocalDateTime.of(2026, 5, 19, 23, 59),
                    "개인 연차 (2일).",
                    new String[] {}),
            new ScheduleSeed("창고 실사 일정",
                    "leeseongmi", LocalDateTime.of(2026, 5, 31, 9, 0),
                    LocalDateTime.of(2026, 5, 31, 18, 0),
                    "1/2번 창고 전수 실사 — 회계 + 영업 합동.",
                    new String[] {"heoyujin", "rahaeram"}),
            new ScheduleSeed("2분기 결산 마감 회의",
                    "janyeonggu", LocalDateTime.of(2026, 5, 28, 15, 0),
                    LocalDateTime.of(2026, 5, 28, 17, 0),
                    "2Q 결산 마감 + 3Q 예산 점검.",
                    new String[] {"kimmiseon", "leeseongmi"})
    };

    /** Message 20건 본문 — 16 employee 순환 송수신. */
    private static final String[] MESSAGE_BODIES = {
            "5월 영업회의 일정 안내 — 11일(월) 10시 본사 회의실.",
            "전표 2026/05/08-001 결재 부탁드립니다.",
            "거래처 (주)서울에어컨 단가 협상 결과 공유 드립니다.",
            "재고 실사 5/31 (토) 출근 OT 신청 완료했습니다.",
            "법인카드 한도 증액 결재 진행 중입니다.",
            "다음 주 부산 출장 — 차량 예약 부탁드립니다.",
            "월간 KPI 보고서 첨부드립니다.",
            "5월 신규 거래처 발굴 현황 공유합니다.",
            "외상매출금 회수 일정 — 거래처 5개사 정리드립니다.",
            "신입사원 박은우 환영회 일정 공지드립니다.",
            "재고 부족 모델 — 1번 창고 6kW 긴급 발주 요청드립니다.",
            "5월 휴가 신청서 결재 처리 부탁드립니다.",
            "고객사 컴플레인 1건 처리 완료했습니다.",
            "이번 주 영업 목표 달성률 80% — 추가 푸쉬 요청드립니다.",
            "월말 마감 일정 안내 — 5/30 (목) 18시 마감.",
            "신규 모델 6kW 매뉴얼 첨부 — 영업팀 공유 부탁드립니다.",
            "거래처 미팅 일지 — 5/13 (수) 작성 완료했습니다.",
            "월간 결재 통계 — 처리 완료 12건 / 진행 중 5건.",
            "2Q 결산 일정 안내 — 6월 첫째 주 마감 예정.",
            "주간 회의 자료 사전 공유드립니다."
    };

    private final ApprovalLineRepository approvalLineRepository;
    private final MessageRepository messageRepository;
    private final ScheduleRepository scheduleRepository;
    private final ApprovalNumberService approvalNumberService;

    public GroupwareSeeder(ApprovalLineRepository approvalLineRepository,
                           MessageRepository messageRepository,
                           ScheduleRepository scheduleRepository,
                           ApprovalNumberService approvalNumberService) {
        this.approvalLineRepository = approvalLineRepository;
        this.messageRepository = messageRepository;
        this.scheduleRepository = scheduleRepository;
        this.approvalNumberService = approvalNumberService;
    }

    @Override
    @Transactional
    public void run(String... args) {
        seedApprovals();
        seedMessages();
        seedSchedules();
    }

    // ------------------------------------------------------------------
    // 1) ApprovalLine 8 + Step 16
    // ------------------------------------------------------------------
    private void seedApprovals() {
        int created = 0;
        int skipped = 0;
        for (int i = 0; i < APPROVAL_SEEDS.length; i++) {
            ApprovalSeed seed = APPROVAL_SEEDS[i];
            int seq = i + 1;
            String approvalKey = String.format("approval-%02d", seq);
            UUID lineId = deterministicId("approval-line", approvalKey);
            if (approvalLineRepository.existsById(lineId)) {
                skipped++;
                continue;
            }
            try {
                UUID requesterId = employeeId(seed.requesterLogin);
                UUID approver1Id = employeeId(seed.approver1Login);
                UUID approver2Id = employeeId(seed.approver2Login);

                ApprovalLine line = ApprovalLine.open(
                        approvalNumberService.next(), requesterId, seed.title, seed.content);
                forceId(line, lineId);

                ApprovalStep step1 = line.appendStep(approver1Id);
                forceId(step1, deterministicId("approval-step", approvalKey + ":1"));
                ApprovalStep step2 = line.appendStep(approver2Id);
                forceId(step2, deterministicId("approval-step", approvalKey + ":2"));

                // 상태 분포 — PENDING 3 (seq 1, 5, 8) / APPROVED 4 (seq 2, 3, 6, 7) / REJECTED 1 (seq 4)
                applyApprovalStatus(line, seq, approver1Id, approver2Id);

                approvalLineRepository.save(line);
                created++;
            } catch (RuntimeException ex) {
                log.error("Failed to seed approval {} ({}): {}",
                        approvalKey, seed.title, ex.getMessage(), ex);
            }
        }
        log.info("GroupwareSeeder approval — created {} (skipped {})", created, skipped);
    }

    private void applyApprovalStatus(ApprovalLine line, int seq, UUID approver1, UUID approver2) {
        // PENDING 3 — seq 1, 5, 8 (그대로 둠)
        if (seq == 1 || seq == 5 || seq == 8) {
            return;
        }
        // REJECTED 1 — seq 4 (1단계 반려)
        if (seq == 4) {
            line.reject(approver1, "예산 한도 초과 — 재검토 후 재신청 요청");
            return;
        }
        // APPROVED 4 — seq 2, 3, 6, 7 (2단계 모두 승인)
        line.approve(approver1);
        line.approve(approver2);
    }

    // ------------------------------------------------------------------
    // 2) Message 20
    // ------------------------------------------------------------------
    private void seedMessages() {
        int created = 0;
        int skipped = 0;
        for (int seq = 1; seq <= MESSAGE_BODIES.length; seq++) {
            UUID id = deterministicId("message", String.format("message-%02d", seq));
            if (messageRepository.existsById(id)) {
                skipped++;
                continue;
            }
            try {
                int senderIdx = (seq - 1) % EMPLOYEE_LOGINS.length;
                int receiverIdx = (senderIdx + 3) % EMPLOYEE_LOGINS.length; // 3명 건너뛰어 자기 자신 회피
                UUID senderId = employeeId(EMPLOYEE_LOGINS[senderIdx]);
                UUID receiverId = employeeId(EMPLOYEE_LOGINS[receiverIdx]);
                String body = MESSAGE_BODIES[seq - 1];

                Message msg = Message.send(senderId, receiverId, body);
                forceId(msg, id);

                // seq % 3 == 0 → 미열람 / 그 외 열람 처리
                if (seq % 3 != 0) {
                    msg.markRead(receiverId);
                }
                messageRepository.save(msg);
                created++;
            } catch (RuntimeException ex) {
                log.error("Failed to seed message #{}: {}", seq, ex.getMessage(), ex);
            }
        }
        log.info("GroupwareSeeder message — created {} (skipped {})", created, skipped);
    }

    // ------------------------------------------------------------------
    // 3) Schedule 5 + Participant 10
    // ------------------------------------------------------------------
    private void seedSchedules() {
        int created = 0;
        int skipped = 0;
        for (int i = 0; i < SCHEDULE_SEEDS.length; i++) {
            ScheduleSeed seed = SCHEDULE_SEEDS[i];
            int seq = i + 1;
            String scheduleKey = String.format("schedule-%02d", seq);
            UUID id = deterministicId("schedule", scheduleKey);
            if (scheduleRepository.existsById(id)) {
                skipped++;
                continue;
            }
            try {
                UUID ownerId = employeeId(seed.ownerLogin);
                Schedule schedule = Schedule.create(ownerId, seed.title, seed.description,
                        seed.startsAt, seed.endsAt, ScheduleStatus.CONFIRMED);
                forceId(schedule, id);
                schedule.addParticipant(ownerId);

                int p = 1;
                for (String participantLogin : seed.participantLogins) {
                    UUID participantId = employeeId(participantLogin);
                    schedule.addParticipant(participantId);
                    // 마지막 추가된 participant 에 결정 UUID 부여
                    List<ScheduleParticipant> view = schedule.getParticipantsView();
                    ScheduleParticipant added = view.get(view.size() - 1);
                    forceId(added, deterministicId("schedule-participant",
                            scheduleKey + ":" + p));
                    p++;
                }

                scheduleRepository.save(schedule);
                created++;
            } catch (RuntimeException ex) {
                log.error("Failed to seed schedule #{} ({}): {}",
                        seq, seed.title, ex.getMessage(), ex);
            }
        }
        log.info("GroupwareSeeder schedule — created {} (skipped {})", created, skipped);
    }

    // ------------------------------------------------------------------
    // 공용
    // ------------------------------------------------------------------

    /**
     * {@code samhan-seed:employee:&lt;loginId&gt;} 결정 도출 — 모든 Stage seeder 동일 namespace 의무.
     * user-service 의 OrgChartSeeder 가 random UUID 를 부여한 16 employee 와 직접 join 되지는 않지만
     * (별도 DB), 본 seed 데이터 검증 / cross-stage 시나리오 테스트 시 동일 키 도출 가능.
     */
    static UUID employeeId(String loginId) {
        return UUID.nameUUIDFromBytes(("samhan-seed:employee:" + loginId).getBytes(StandardCharsets.UTF_8));
    }

    static UUID deterministicId(String type, String key) {
        return UUID.nameUUIDFromBytes(("samhan-seed:" + type + ":" + key).getBytes(StandardCharsets.UTF_8));
    }

    private static void forceId(Object entity, UUID id) {
        try {
            Class<?> clazz = entity.getClass();
            Field f = null;
            while (clazz != null && f == null) {
                try {
                    f = clazz.getDeclaredField("id");
                } catch (NoSuchFieldException nsfe) {
                    clazz = clazz.getSuperclass();
                }
            }
            if (f == null) {
                throw new NoSuchFieldException("id");
            }
            f.setAccessible(true);
            f.set(entity, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Failed to set deterministic id on "
                    + entity.getClass().getSimpleName(), e);
        }
    }

    private record ApprovalSeed(String title, String content,
                                String requesterLogin,
                                String approver1Login,
                                String approver2Login) { }

    private record ScheduleSeed(String title, String ownerLogin,
                                LocalDateTime startsAt, LocalDateTime endsAt,
                                String description,
                                String[] participantLogins) { }
}
