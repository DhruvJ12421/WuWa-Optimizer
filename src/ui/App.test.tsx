import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(await screen.findByText('Wuthering Waves Archive')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Characters 60/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Echoes/ }))
    expect(await screen.findByText('Echo inventory')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Scanner/ }))
    expect(await screen.findByText('Decode Echo details')).toBeInTheDocument()
  })

  it('warns before leaving a scanner session with unsaved Echo data', async () => {
    render(<App/>)
    await screen.findByText('Wuthering Waves Archive')
    fireEvent.click(screen.getByRole('button', { name: /Scanner/ }))
    fireEvent.click(await screen.findByRole('button', { name: /enter an Echo manually/i }))
    expect(await screen.findByText(/Review queue/)).toHaveTextContent('1')

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: /Echoes/ }))
    expect(screen.getByText('Decode Echo details')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith('Leave the scanner? Screen sharing will stop and all scanned Echo data that has not been approved and saved will be lost.')

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: /Echoes/ }))
    expect(await screen.findByText('Echo inventory')).toBeInTheDocument()
  })
})
