/**
 * 결재유형 템플릿 필드 입력 렌더러.
 *
 * Textarea 는 design-system 에 별도 컴포넌트가 없어 FormField + raw textarea 로만 보강한다.
 */
import { FormField, Input, Select } from '@samhan/design-system'
import type { ApprovalTemplateField } from '../../api/groupwareApprovalTemplate'

export interface DynamicApprovalFieldInputProps {
  field: ApprovalTemplateField
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function DynamicApprovalFieldInput({
  field,
  value,
  onChange,
  disabled = false,
}: DynamicApprovalFieldInputProps) {
  if (field.fieldType === 'SELECT') {
    return (
      <Select
        label={field.label}
        required={field.required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        selectSize="sm"
        data-testid={`dynamic-approval-field-${field.fieldKey}`}
      >
        <option value="">선택</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    )
  }

  if (field.fieldType === 'TEXTAREA') {
    return (
      <FormField
        label={field.label}
        required={field.required}
        render={({ id, ariaDescribedBy, invalid }) => (
          <textarea
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            rows={4}
            placeholder={field.placeholder ?? undefined}
            aria-describedby={ariaDescribedBy}
            aria-invalid={invalid || undefined}
            data-testid={`dynamic-approval-field-${field.fieldKey}`}
            style={{
              width: '100%',
              minHeight: 96,
              resize: 'vertical',
              padding: '8px 10px',
              borderRadius: 4,
              border: '1px solid var(--color-neutral-300)',
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          />
        )}
      />
    )
  }

  const inputType = field.fieldType === 'NUMBER'
    ? 'number'
    : field.fieldType === 'DATE'
      ? 'date'
      : 'text'

  return (
    <Input
      type={inputType}
      label={field.label}
      required={field.required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={field.placeholder ?? undefined}
      inputSize="sm"
      data-testid={`dynamic-approval-field-${field.fieldKey}`}
    />
  )
}
