package com.samhanair.logis.groupware.repository;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.persistence.LockModeType;
import java.lang.reflect.Method;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Lock;

/** 동시 읽음 처리에서 최초 readAt을 보존하는 repository lock 계약. */
class MessageRepositoryLockContractTest {

    @Test
    void findByIdForUpdate_usesPessimisticWriteLock() throws Exception {
        Method method = MessageRepository.class.getMethod("findByIdForUpdate", UUID.class);

        Lock lock = method.getAnnotation(Lock.class);
        assertThat(lock).as("markRead 조회는 동시 transaction을 직렬화해야 한다").isNotNull();
        assertThat(lock.value()).isEqualTo(LockModeType.PESSIMISTIC_WRITE);
    }
}
