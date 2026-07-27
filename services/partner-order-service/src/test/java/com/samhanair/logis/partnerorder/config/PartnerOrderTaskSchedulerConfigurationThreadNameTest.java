package com.samhanair.logis.partnerorder.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * #888 적대검증 R1 결함2 — Boot 기본 콘솔 로그 패턴({@code CONSOLE_LOG_PATTERN})의 스레드 필드는
 * {@code %15.15t}다(최소/최대 폭 15). Logback 문서상 필드 폭 초과분은 문자열 <b>앞부분</b>에서
 * 제거되어 꼬리 15자만 로그에 남는다. fix 전 접두어 {@code partner-order-scheduling-}(25자)·
 * {@code partner-order-outbox-}(21자)는 번호가 붙으면 15자를 넘어, 실기동 대조 원문대로
 * {@code partner-order-scheduling-4}(26자) → {@code er-scheduling-4}, {@code
 * partner-order-outbox-1}(22자) → {@code -order-outbox-1}로 잘린다 — 두 풀을 구분하려 붙인
 * {@code partner-order-} 접두어 자체가 로그에서 소실된다.
 *
 * <p><b>환원 근거</b>: "로그 출력 형태(잘렸을 때 읽을 수 있는가)"는 문자열을 직접 렌더링하지
 * 않는 한 assert하기 까다롭다. 대신 <b>Boot 기본 패턴이 단 한 글자도 자르지 않는 길이(15자
 * 이하)로 스레드 이름 전체가 들어온다</b>는, truncate 여부와 무관하게 항상 참인 더 엄격한 상위
 * 호환 성질로 환원했다 — 이름이 15자 이하이면 truncate 규칙(초과분만 제거) 자체가 발동하지
 * 않으므로 "잘려도 식별 가능"보다 강한 조건이다(이 조건을 만족하면 잘려도 식별 가능함이 항상
 * 따라온다. 역은 성립하지 않을 수 있으나 이번 fix는 아예 안 잘리는 쪽을 택했다). 스레드 이름은
 * 하드코드 리터럴이 아니라 {@link ThreadPoolTaskScheduler}의 실제 {@code ThreadFactory} 구현
 * ({@code newThread} — 내부 실행기가 pool worker를 만들 때 호출하는 바로 그 메서드)으로 직접
 * 얻는다.
 */
class PartnerOrderTaskSchedulerConfigurationThreadNameTest {

    /** Boot 기본 CONSOLE_LOG_PATTERN 스레드 필드 폭 — {@code %15.15t}. */
    private static final int LOG_THREAD_FIELD_WIDTH = 15;

    @Test
    void 형제_풀_스레드_이름은_로그_필드_15자_이하여서_한_글자도_잘리면_안_된다() {
        ThreadPoolTaskScheduler sibling = new PartnerOrderTaskSchedulerConfiguration().taskScheduler(5);
        String threadName = sibling.newThread(() -> { }).getName();

        assertThat(threadName.length())
                .as("스레드 이름 '%s'(%d자)가 Boot 기본 로그 패턴 %%15.15t 필드(15자)를 넘으면 앞부분이"
                        + " 잘려 운영 로그에서 풀 식별용 접두어가 사라진다", threadName, threadName.length())
                .isLessThanOrEqualTo(LOG_THREAD_FIELD_WIDTH);
        assertThat(threadName)
                .as("잘리지 않아도 스레드 이름 자체에 풀을 식별할 단서가 있어야 한다")
                .containsIgnoringCase("sched");
    }

    @Test
    void outbox_풀_스레드_이름은_로그_필드_15자_이하여서_한_글자도_잘리면_안_된다() {
        ThreadPoolTaskScheduler outbox = new PartnerOrderTaskSchedulerConfiguration().outboxTaskScheduler();
        String threadName = outbox.newThread(() -> { }).getName();

        assertThat(threadName.length())
                .as("스레드 이름 '%s'(%d자)가 Boot 기본 로그 패턴 %%15.15t 필드(15자)를 넘으면 앞부분이"
                        + " 잘려 운영 로그에서 풀 식별용 접두어가 사라진다", threadName, threadName.length())
                .isLessThanOrEqualTo(LOG_THREAD_FIELD_WIDTH);
        assertThat(threadName)
                .as("잘리지 않아도 스레드 이름 자체에 풀을 식별할 단서가 있어야 한다")
                .containsIgnoringCase("outbox");
    }

    @Test
    void 형제_풀과_outbox_풀의_스레드_이름은_서로_달라야_로그만으로_구분할_수_있다() {
        ThreadPoolTaskScheduler sibling = new PartnerOrderTaskSchedulerConfiguration().taskScheduler(5);
        ThreadPoolTaskScheduler outbox = new PartnerOrderTaskSchedulerConfiguration().outboxTaskScheduler();

        String siblingName = sibling.newThread(() -> { }).getName();
        String outboxName = outbox.newThread(() -> { }).getName();

        assertThat(siblingName)
                .as("두 풀의 스레드 이름이 같으면 로그만으로 소속 풀을 구분할 수 없다")
                .isNotEqualTo(outboxName);
    }
}
