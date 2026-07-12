import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../storage/database'
import App from './App'

describe('application shell', () => {
  beforeEach(async () => {
    db.close()
    await db.delete()
    await db.open()
  })

  afterEach(() => db.close())

  it('opens the local archive and navigates core workflows', async () => {
    render(<App/>)
    expect(await screen.findByText('Your account, decoded.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Echoes/ }))
    expect(await screen.findByText('Echo inventory')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Scanner/ }))
    expect(await screen.findByText('Decode Echo details')).toBeInTheDocument()
  })
})
