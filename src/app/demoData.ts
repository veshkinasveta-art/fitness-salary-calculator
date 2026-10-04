import type {
  EmployeeInput,
  PeriodRecord,
  Product,
  StudioSettings,
  TeamResult,
} from './model'

export const defaultProducts: Product[] = [
  { id: '11111111-1111-4111-8111-111111111008', name: '8 тренировок', trainings: 8, priceKopecks: 300_000, active: true },
  { id: '11111111-1111-4111-8111-111111111012', name: '12 тренировок', trainings: 12, priceKopecks: 450_000, active: true },
  { id: '11111111-1111-4111-8111-111111111024', name: '24 тренировки', trainings: 24, priceKopecks: 800_000, active: true },
  { id: '11111111-1111-4111-8111-111111111048', name: '48 тренировок', trainings: 48, priceKopecks: 1_400_000, active: true },
  { id: '11111111-1111-4111-8111-111111111064', name: '64 тренировки', trainings: 64, priceKopecks: 1_800_000, active: true },
  { id: '11111111-1111-4111-8111-111111111096', name: '96 тренировок', trainings: 96, priceKopecks: 2_500_000, active: true },
  { id: '11111111-1111-4111-8111-111111111128', name: '128 тренировок', trainings: 128, priceKopecks: 3_200_000, active: true },
]

export const defaultSettings: StudioSettings = {
  studioName: 'Студия Баланс',
  teamPlanKopecks: 80_000_000,
  shiftCostKopecks: 200_000,
  bonusTiers: [
    { thresholdPercent: 80, fundKopecks: 4_000_000 },
    { thresholdPercent: 100, fundKopecks: 6_000_000 },
  ],
  kpiTrials: 20,
  kpiMemberships: 5,
  kpiAmountKopecks: 1_000_000,
  distribution: 'proportional',
}

export const defaultEmployees: EmployeeInput[] = [
  {
    id: '22222222-2222-4222-8222-222222222201',
    name: 'Елена',
    role: 'Менеджер',
    color: 'sage',
    shifts: 14,
    trials: 22,
    weight: 1,
    sales: {
      '11111111-1111-4111-8111-111111111008': 28,
      '11111111-1111-4111-8111-111111111012': 22,
      '11111111-1111-4111-8111-111111111024': 14,
      '11111111-1111-4111-8111-111111111048': 5,
      '11111111-1111-4111-8111-111111111064': 2,
      '11111111-1111-4111-8111-111111111096': 1,
      '11111111-1111-4111-8111-111111111128': 0,
    },
  },
  {
    id: '22222222-2222-4222-8222-222222222202',
    name: 'Мария',
    role: 'Менеджер',
    color: 'amber',
    shifts: 13,
    trials: 18,
    weight: 1,
    sales: {
      '11111111-1111-4111-8111-111111111008': 25,
      '11111111-1111-4111-8111-111111111012': 18,
      '11111111-1111-4111-8111-111111111024': 11,
      '11111111-1111-4111-8111-111111111048': 3,
      '11111111-1111-4111-8111-111111111064': 2,
      '11111111-1111-4111-8111-111111111096': 0,
      '11111111-1111-4111-8111-111111111128': 0,
    },
  },
]

export const emptyResult: TeamResult = {
  totalRevenueKopecks: 0,
  totalSalaryKopecks: 0,
  completionPercent: 0,
  bonusFundKopecks: 0,
  employees: [],
}

export const demoHistory: PeriodRecord[] = [
  {
    id: '2026-08',
    month: '2026-08',
    status: 'closed',
    updatedAt: '2026-09-01T09:00:00.000Z',
    employees: defaultEmployees,
    result: {
      totalRevenueKopecks: 76_400_000,
      totalSalaryKopecks: 8_900_000,
      completionPercent: 95.5,
      bonusFundKopecks: 4_000_000,
      employees: [],
    },
  },
  {
    id: '2026-09',
    month: '2026-09',
    status: 'closed',
    updatedAt: '2026-10-01T09:00:00.000Z',
    employees: defaultEmployees,
    result: {
      totalRevenueKopecks: 84_900_000,
      totalSalaryKopecks: 11_400_000,
      completionPercent: 106.1,
      bonusFundKopecks: 6_000_000,
      employees: [],
    },
  },
]
