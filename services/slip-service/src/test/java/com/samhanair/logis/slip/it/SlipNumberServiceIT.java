package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.service.SlipNumberService;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

/**
 * 일자별 채번(`SlipNumberSequence`) atomic 동작 검증.
 *
 * <p>BE 도메인 시그니처 (PM 통합 후 정렬):
 * <ul>
 *   <li>{@code SlipNumberSequence.create(slipDate: LocalDate)} — 신규 시퀀스 영속화</li>
 *   <li>{@code SlipNumberSequence.next(): int} — atomic 1씩 증가, 첫 호출 1 반환</li>
 *   <li>{@code SlipNumberService.next(LocalDate): String} — Service facade.
 *       해당 일자 sequence 가 없으면 create + next, 있으면 next.
 *       반환 형식: {@code "yyyy/MM/dd-N"} (예: {@code "2026/05/04-1"}).</li>
 *   <li>{@code SlipNumberService.extractSeqNo(String): int} — 채번 결과 trailing 순번 파싱.</li>
 * </ul>
 *
 * <p>본 IT 는 atomic 채번 + 일자별 독립 시퀀스만 검증한다. 동시성 충돌 (race) 검증은 unit test
 * (트랜잭션 isolation 시뮬레이션이 IT 보다 단위 테스트가 단순).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class SlipNumberServiceIT extends AbstractPostgresIT {

    @Autowired
    private SlipNumberService slipNumberService;

    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;

    @BeforeEach
    void setUpUserInternalClient() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
    }

    @Test
    void next_sameDate_returnsIncreasingSequence() {
        // 같은 날짜로 3회 호출 → trailing 순번 1, 2, 3 (atomic).
        LocalDate date = LocalDate.of(2026, 5, 4);

        String slipNo1 = slipNumberService.next(date);
        String slipNo2 = slipNumberService.next(date);
        String slipNo3 = slipNumberService.next(date);

        assertThat(slipNumberService.extractSeqNo(slipNo1)).isEqualTo(1);
        assertThat(slipNumberService.extractSeqNo(slipNo2)).isEqualTo(2);
        assertThat(slipNumberService.extractSeqNo(slipNo3)).isEqualTo(3);
        assertThat(slipNo1).startsWith("2026/05/04-");
    }

    @Test
    void next_differentDates_eachIndependentFromOne() {
        // 각 날짜는 별도 sequence — 모두 1부터 독립 시작.
        LocalDate dateA = LocalDate.of(2026, 5, 5);
        LocalDate dateB = LocalDate.of(2026, 5, 6);

        String aSlip1 = slipNumberService.next(dateA);
        String bSlip1 = slipNumberService.next(dateB);
        String aSlip2 = slipNumberService.next(dateA);
        String bSlip2 = slipNumberService.next(dateB);

        assertThat(slipNumberService.extractSeqNo(aSlip1)).isEqualTo(1);
        assertThat(slipNumberService.extractSeqNo(bSlip1)).isEqualTo(1);
        assertThat(slipNumberService.extractSeqNo(aSlip2)).isEqualTo(2);
        assertThat(slipNumberService.extractSeqNo(bSlip2)).isEqualTo(2);
        assertThat(aSlip1).startsWith("2026/05/05-");
        assertThat(bSlip1).startsWith("2026/05/06-");
    }

    @Test
    void next_sameDateDifferentSlipTypes_eachIndependentFromOne() {
        // 판매/구매는 서로 다른 메뉴/속성이므로 같은 날짜 같은 공개 전표번호가 허용된다.
        LocalDate date = LocalDate.of(2026, 5, 7);

        String outbound1 = slipNumberService.next(date, SlipType.OUTBOUND);
        String inbound1 = slipNumberService.next(date, SlipType.INBOUND);
        String outbound2 = slipNumberService.next(date, SlipType.OUTBOUND);
        String inbound2 = slipNumberService.next(date, SlipType.INBOUND);

        assertThat(outbound1).isEqualTo("2026/05/07-1");
        assertThat(inbound1).isEqualTo("2026/05/07-1");
        assertThat(outbound2).isEqualTo("2026/05/07-2");
        assertThat(inbound2).isEqualTo("2026/05/07-2");
    }
}
