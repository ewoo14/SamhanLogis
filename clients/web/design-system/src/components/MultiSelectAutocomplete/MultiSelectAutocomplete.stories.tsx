import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { MultiSelectAutocomplete, type MultiSelectAutocompleteProps } from './MultiSelectAutocomplete'

interface Person {
  id: string
  name: string
  department: string
}

const people: Person[] = [
  { id: 'person-1', name: '김민수', department: '재무팀' },
  { id: 'person-2', name: '이서윤', department: '인사팀' },
  { id: 'person-3', name: '박지훈', department: '영업팀' },
]

const meta: Meta<typeof MultiSelectAutocomplete<Person, Person>> = {
  title: 'Components/MultiSelectAutocomplete',
  component: MultiSelectAutocomplete,
  args: {
    listboxLabel: '사원 검색 결과',
    ariaLabel: '사원 검색',
    placeholder: '사원 이름 검색',
    getOptionKey: (person) => person.id,
    getSelectedKey: (person) => person.id,
    getInputLabel: (person) => person.name,
    renderOption: (person) => (
      <span>
        {person.name} <small>{person.department}</small>
      </span>
    ),
    getChipProps: (person, index) => ({
      label: String(index + 1),
      value: `${person.name} (${person.department})`,
      removeLabel: person.name,
    }),
    search: async (query) => people.filter((person) => person.name.includes(query)),
    selected: [],
    onAdd: () => undefined,
    onRemove: () => undefined,
    debounceMs: 0,
  },
}

export default meta

type Story = StoryObj<typeof meta>

function StatefulMultiSelectStory({
  args,
}: {
  args: MultiSelectAutocompleteProps<Person, Person>
}) {
  const [selected, setSelected] = useState<Person[]>([people[0]!])
  return (
    <MultiSelectAutocomplete<Person, Person>
      {...args}
      selected={selected}
      onAdd={(person) => setSelected((current) => [...current, person])}
      onRemove={(person) => setSelected((current) => current.filter((item) => item.id !== person.id))}
    />
  )
}

export const 기본: Story = {}

export const 두명선택: Story = {
  render: (args) => (
    <StatefulMultiSelectStory args={args as MultiSelectAutocompleteProps<Person, Person>} />
  ),
}

export const 최대두명: Story = {
  ...두명선택,
  args: { ...기본.args, max: 2 },
}
