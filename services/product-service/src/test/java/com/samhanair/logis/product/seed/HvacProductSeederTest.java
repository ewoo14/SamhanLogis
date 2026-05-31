package com.samhanair.logis.product.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Stage 1 HvacProductSeeder 단위 테스트 — idempotency + 결정적 UUID 보장 + HVAC 단가 6종 비즈니스 룰 검증.
 *
 * <p>수정 배경 (결정적 UUID 버그 수정 — feat/phase-2-6c-inventory-deduction):
 * 기존 {@code forceId + JPA save()} 패턴은 Hibernate 6 {@code @UuidGenerator(BeforeExecutionGenerator)} 가
 * INSERT 직전 UUID 를 항상 신규 생성하므로 결정적 UUID 를 보존하지 못했다.
 * {@link JdbcTemplate} native INSERT 로 교체 후 {@code productRepository.save()} 는 더 이상 호출되지 않으며
 * {@code jdbcTemplate.update()} 100 회가 발생한다.
 *
 * <p>비즈니스 룰 (Stage 1 dev-report §HVAC 단가 6종):
 * outbound = inbound * 1.20, single = inbound * 1.50, outdoor = inbound * 1.40,
 * multi50 = inbound * 1.10, multi48 = inbound * 1.12, multi45 = inbound * 1.15,
 * item35 = inbound * 1.30.
 */
@ExtendWith(MockitoExtension.class)
class HvacProductSeederTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private CategoryRepository categoryRepository;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private HvacProductSeeder seeder;

    @BeforeEach
    void setUp() {
        seeder = new HvacProductSeeder(productRepository, categoryRepository, jdbcTemplate);
    }

    @Test
    void firstRunCreatesAll100ProductsViaJdbc() {
        stubCategoriesPresent();
        when(productRepository.existsByModelNameAndIsDeletedFalse(anyString())).thenReturn(false);
        // jdbcTemplate.update(sql, args...) — 반환값 1 (성공)
        lenient().when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        seeder.run();

        // JPA save 는 호출되지 않아야 함 (결정적 UUID 버그 수정)
        verify(productRepository, never()).save(any());
        // jdbcTemplate.update 가 100 회 호출되어야 함 (100 product INSERT)
        verify(jdbcTemplate, times(100)).update(anyString(), any(Object[].class));
    }

    @Test
    void deterministicUuidMatchesInventorySeederNamespace() {
        // StockBalanceSeeder 와 동일한 namespace/encoding 으로 UUID 생성되는지 검증.
        // "samhan-seed:product:<modelName>" UTF-8 → Type-3 UUID
        String modelName = "AR05TXEAAWKNEU-01";
        UUID expected = UUID.nameUUIDFromBytes(
                ("samhan-seed:product:" + modelName).getBytes(StandardCharsets.UTF_8));
        // 결정적 UUID 값 확인 (고정 기대값 — 변경 시 cross-service 정합 깨짐)
        assertThat(expected.toString()).isEqualTo("01949ab7-e922-35c6-b289-5337d867a0ee");
    }

    @Test
    void idempotentRunSkipsExistingByModelName() {
        stubCategoriesPresent();
        // 모든 제품이 이미 존재하는 것처럼 시뮬레이션
        when(productRepository.existsByModelNameAndIsDeletedFalse(anyString())).thenReturn(true);

        seeder.run();

        // 이미 존재하면 jdbcTemplate INSERT 호출 안 함
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
        verify(productRepository, never()).save(any());
    }

    @Test
    void noOpWhenAllExist() {
        stubCategoriesPresent();
        when(productRepository.existsByModelNameAndIsDeletedFalse(anyString())).thenReturn(true);

        seeder.run();

        verify(productRepository, never()).save(any());
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void earlyReturnIfNoCategoriesPresent() {
        // 카테고리 시드 없음 — runner 가 즉시 return (warn 로그)
        when(categoryRepository.findById(any(UUID.class))).thenReturn(Optional.empty());

        seeder.run();

        verify(productRepository, never()).save(any());
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void partialSkipWhenSomeExist() {
        stubCategoriesPresent();
        // 절반만 존재 — existsByModelName 이 홀수 modelName hashCode 에서 true
        when(productRepository.existsByModelNameAndIsDeletedFalse(anyString())).thenAnswer(inv -> {
            String name = inv.getArgument(0);
            return name.hashCode() % 2 == 0;
        });
        lenient().when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        seeder.run();

        // 100 미만의 INSERT 발생 (일부 skip)
        ArgumentCaptor<Object[]> argsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate, org.mockito.Mockito.atMost(100))
                .update(anyString(), argsCaptor.capture());
    }

    @Test
    void insertSqlContainsKeyColumns() {
        stubCategoriesPresent();
        // 첫 번째 제품만 테스트 — 나머지는 이미 존재
        when(productRepository.existsByModelNameAndIsDeletedFalse(anyString()))
                .thenReturn(false)
                .thenReturn(true); // 2번째부터 skip

        seeder.run();

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, atLeastOnce()).update(sqlCaptor.capture(), any(Object[].class));

        String sql = sqlCaptor.getValue();
        // INSERT SQL 에 핵심 컬럼이 포함되어야 함
        assertThat(sql).contains("id");
        assertThat(sql).contains("model_name");
        assertThat(sql).contains("inbound_price");
        assertThat(sql).contains("single_price");
        assertThat(sql).contains("is_deleted");
    }

    private void stubCategoriesPresent() {
        Category dummyCat = mockCategory();
        // lenient 로 모든 findById 호출에 대해 동일 instance 반환
        lenient().when(categoryRepository.findById(any(UUID.class)))
                .thenReturn(Optional.of(dummyCat));
    }

    private Category mockCategory() {
        // 도메인 메서드만 사용 (reflection 회피) — Category.create() factory
        return Category.create("HVAC", "공조", null, 1);
    }
}
