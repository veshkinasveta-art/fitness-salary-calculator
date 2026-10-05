import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const selectSingle = vi.fn()
  const updateSingle = vi.fn()
  const selectChain = {
    eq: vi.fn(),
    single: selectSingle,
  }
  selectChain.eq.mockReturnValue(selectChain)
  const updateChain = {
    eq: vi.fn(),
    select: vi.fn(),
    single: updateSingle,
  }
  updateChain.eq.mockReturnValue(updateChain)
  updateChain.select.mockReturnValue(updateChain)
  return {
    selectSingle,
    updateSingle,
    from: vi.fn(() => ({
      select: vi.fn(() => selectChain),
      update: vi.fn(() => updateChain),
    })),
    getUser: vi.fn(),
  }
})

vi.mock('./supabase.ts', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}))

import { saveRemoteBonusTiers } from './studioRepository.ts'

describe('bonus tiers persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'owner-id' } },
      error: null,
    })
    mocks.selectSingle.mockResolvedValue({
      data: {
        id: 'studio-id',
        name: 'Студия',
        version: 3,
        settings: { studioName: 'Студия', distribution: 'equal' },
      },
      error: null,
    })
  })

  it('writes tiers to studios.settings and uses the database response', async () => {
    mocks.updateSingle.mockResolvedValue({
      data: {
        name: 'Студия',
        settings: {
          studioName: 'Студия',
          distribution: 'equal',
          bonusTiers: [
            { thresholdPercent: 85, fundKopecks: 4_500_000 },
            { thresholdPercent: 105, fundKopecks: 6_500_000 },
          ],
        },
      },
      error: null,
    })

    const saved = await saveRemoteBonusTiers('studio-id', [
      { thresholdPercent: 85, fundKopecks: 4_500_000 },
      { thresholdPercent: 105, fundKopecks: 6_500_000 },
    ])

    expect(saved.bonusTiers).toEqual([
      { thresholdPercent: 85, fundKopecks: 4_500_000 },
      { thresholdPercent: 105, fundKopecks: 6_500_000 },
    ])
    expect(mocks.from).toHaveBeenCalledWith('studios')
  })

  it('does not accept duplicate thresholds', async () => {
    await expect(
      saveRemoteBonusTiers('studio-id', [
        { thresholdPercent: 80, fundKopecks: 4_000_000 },
        { thresholdPercent: 80, fundKopecks: 6_000_000 },
      ]),
    ).rejects.toThrow('Проценты уровней премии должны отличаться')
  })
})
