import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ScanCandidate } from '../domain/types'
import { ScanReviewCard } from './ScanReviewCard'

const candidate = (valid: boolean): ScanCandidate => ({
  id: 'candidate', createdAt: 1, imageDataUrl: '', fingerprint: 'x', source: 'manual',
  fields: {
    name: { value: valid ? 'Hooscamp' : 'Unknown Echo', confidence: .2 },
    cost: { value: 1, confidence: 1 }, rarity: { value: 5, confidence: 1 }, level: { value: 25, confidence: 1 },
    sonata: { value: valid ? 'Lingering Tunes' : 'Unknown Sonata', confidence: .2 },
    mainStat: { value: { key: 'atkPercent', value: 18 }, confidence: 1 }, subStats: []
  }
})

function Harness({ initial, onSave }: { initial: ScanCandidate; onSave: () => void }) {
  const [value, setValue] = useState(initial)
  return <ScanReviewCard candidate={value} onChange={setValue} onDiscard={() => undefined} onSave={onSave}/>
}

describe('scan review checkpoint', () => {
  it('blocks invalid OCR defaults from persistence', () => {
    render(<Harness initial={candidate(false)} onSave={vi.fn()}/>)
    expect(screen.getByRole('button', { name: 'Approve & save' })).toBeDisabled()
    expect(screen.getByText(/Enter the Echo name/)).toBeInTheDocument()
  })

  it('allows corrected identity fields to pass review', () => {
    const onSave = vi.fn()
    render(<Harness initial={candidate(false)} onSave={onSave}/>)
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Hooscamp' } })
    fireEvent.change(screen.getByLabelText(/Sonata/), { target: { value: 'Lingering Tunes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve & save' }))
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('renders a valid candidate as saveable', () => {
    render(<Harness initial={candidate(true)} onSave={vi.fn()}/>)
    expect(screen.getByRole('button', { name: 'Approve & save' })).toBeEnabled()
  })
})
