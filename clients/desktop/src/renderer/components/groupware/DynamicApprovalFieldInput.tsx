/**
 * 결재유형 템플릿 필드 입력 렌더러.
 *
 * Textarea 는 design-system 에 별도 컴포넌트가 없어 FormField + raw textarea 로만 보강한다.
 */
import { FormField, Input, Select } from '@samhan/design-system'
import type { ApprovalTemplateField } from '../../api/groupwareApprovalTemplate'
import type { DocCoeditProvider } from '../../realtime/createCoeditProvider'
import { CollaborativeSlipInput } from '../collab/CollaborativeSlipInput'
import { CollaborativeSlipTextArea } from '../collab/CollaborativeSlipTextArea'

export interface DynamicApprovalFieldInputProps {
  field: ApprovalTemplateField
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  provider?: DocCoeditProvider | null
  fieldPath?: string
  coeditPending?: boolean
}

function headerKeyFromFieldPath(fieldPath: string): string {
  // header 키는 dot 을 포함할 수 있으므로(동적필드 field_a.b 등) 첫 dot 이후 전체를 키로 사용 — split[1] 절단 버그 방지.
  const firstDot = fieldPath.indexOf('.')
  if (firstDot < 0 || fieldPath.slice(0, firstDot) !== 'header') return ''
  return fieldPath.slice(firstDot + 1)
}

const textareaStyle = {
  width: '100%',
  minHeight: 96,
  resize: 'vertical',
  padding: '8px 10px',
  borderRadius: 4,
  border: '1px solid var(--color-neutral-300)',
  fontSize: 13,
  fontFamily: 'inherit',
} as const

export function DynamicApprovalFieldInput({
  field,
  value,
  onChange,
  disabled = false,
  provider = null,
  fieldPath,
  coeditPending = false,
}: DynamicApprovalFieldInputProps) {
  if (field.fieldType === 'SELECT') {
    const effectiveDisabled = disabled || coeditPending
    return (
      <Select
        label={field.label}
        required={field.required}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value
          onChange(nextValue)
          if (provider && fieldPath) {
            // SELECT 은 edit-pulse 미표시(D2 LWW-no-cursor)라 lastEdit awareness 는 미시각화 → 값 sync 만.
            provider.setHeaderValue(headerKeyFromFieldPath(fieldPath), nextValue)
          }
        }}
        disabled={effectiveDisabled}
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
    if (provider && fieldPath) {
      return (
        <FormField
          label={field.label}
          required={field.required}
          render={({ id, ariaDescribedBy, invalid }) => (
            <CollaborativeSlipTextArea
              id={id}
              provider={provider}
              fieldPath={fieldPath}
              value={value}
              onValueChange={onChange}
              rows={4}
              placeholder={field.placeholder ?? undefined}
              readOnly={disabled}
              coeditPending={coeditPending}
              textareaStyle={textareaStyle}
              aria-label={field.label}
              aria-describedby={ariaDescribedBy}
              aria-invalid={invalid}
              data-testid={`dynamic-approval-field-${field.fieldKey}`}
            />
          )}
        />
      )
    }
    return (
      <FormField
        label={field.label}
        required={field.required}
        render={({ id, ariaDescribedBy, invalid }) => (
          <textarea
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled || coeditPending}
            rows={4}
            placeholder={field.placeholder ?? undefined}
            aria-describedby={ariaDescribedBy}
            aria-invalid={invalid || undefined}
            data-testid={`dynamic-approval-field-${field.fieldKey}`}
            style={textareaStyle}
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

  if (provider && fieldPath) {
    return (
      <CollaborativeSlipInput
        provider={provider}
        coeditPending={coeditPending}
        fieldPath={fieldPath}
        type={inputType}
        label={field.label}
        required={field.required}
        value={value}
        onValueChange={onChange}
        readOnly={disabled}
        placeholder={field.placeholder ?? undefined}
        inputSize="sm"
        aria-label={field.label}
        data-testid={`dynamic-approval-field-${field.fieldKey}`}
      />
    )
  }

  return (
    <Input
      type={inputType}
      label={field.label}
      required={field.required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || coeditPending}
      placeholder={field.placeholder ?? undefined}
      inputSize="sm"
      data-testid={`dynamic-approval-field-${field.fieldKey}`}
    />
  )
}
