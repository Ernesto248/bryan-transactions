export type Bank = "Wells Fargo" | "Bank of America"

export type Transaction = {
  id: string
  bank: Bank
  emailAccount: string
  senderName: string
  amount: number
  confirmationCode: string
  createdAt: string
  type: "deposit" | "withdrawal" | "transfer"
}

export const mockTransactions: Transaction[] = [
  {
    id: "txn_001",
    bank: "Wells Fargo",
    emailAccount: "personal@gmail.com",
    senderName: "María García López",
    amount: 1250.00,
    confirmationCode: "WF-2024-8847291",
    createdAt: "2026-02-05T14:32:00Z",
    type: "deposit"
  },
  {
    id: "txn_002",
    bank: "Bank of America",
    emailAccount: "business@gmail.com",
    senderName: "Carlos Mendez",
    amount: 3500.00,
    confirmationCode: "BOA-TX-99281742",
    createdAt: "2026-02-05T12:15:00Z",
    type: "transfer"
  },
  {
    id: "txn_003",
    bank: "Wells Fargo",
    emailAccount: "work@gmail.com",
    senderName: "Ana Rodríguez",
    amount: 780.50,
    confirmationCode: "WF-2024-8847292",
    createdAt: "2026-02-05T10:45:00Z",
    type: "deposit"
  },
  {
    id: "txn_004",
    bank: "Bank of America",
    emailAccount: "personal@gmail.com",
    senderName: "Roberto Sánchez",
    amount: 2100.00,
    confirmationCode: "BOA-TX-99281743",
    createdAt: "2026-02-04T18:22:00Z",
    type: "deposit"
  },
  {
    id: "txn_005",
    bank: "Wells Fargo",
    emailAccount: "business@gmail.com",
    senderName: "Laura Martínez",
    amount: 950.75,
    confirmationCode: "WF-2024-8847293",
    createdAt: "2026-02-04T16:08:00Z",
    type: "transfer"
  },
  {
    id: "txn_006",
    bank: "Bank of America",
    emailAccount: "work@gmail.com",
    senderName: "Diego Torres",
    amount: 4200.00,
    confirmationCode: "BOA-TX-99281744",
    createdAt: "2026-02-04T11:30:00Z",
    type: "deposit"
  },
  {
    id: "txn_007",
    bank: "Wells Fargo",
    emailAccount: "personal@gmail.com",
    senderName: "Patricia Herrera",
    amount: 1875.25,
    confirmationCode: "WF-2024-8847294",
    createdAt: "2026-02-03T15:45:00Z",
    type: "deposit"
  },
  {
    id: "txn_008",
    bank: "Bank of America",
    emailAccount: "business@gmail.com",
    senderName: "Miguel Ángel Ruiz",
    amount: 620.00,
    confirmationCode: "BOA-TX-99281745",
    createdAt: "2026-02-03T09:12:00Z",
    type: "withdrawal"
  },
  {
    id: "txn_009",
    bank: "Wells Fargo",
    emailAccount: "work@gmail.com",
    senderName: "Sofía Vargas",
    amount: 3100.00,
    confirmationCode: "WF-2024-8847295",
    createdAt: "2026-02-02T14:20:00Z",
    type: "deposit"
  },
  {
    id: "txn_010",
    bank: "Bank of America",
    emailAccount: "personal@gmail.com",
    senderName: "Fernando Castro",
    amount: 1450.00,
    confirmationCode: "BOA-TX-99281746",
    createdAt: "2026-02-02T10:05:00Z",
    type: "transfer"
  },
  {
    id: "txn_011",
    bank: "Wells Fargo",
    emailAccount: "business@gmail.com",
    senderName: "Carmen Díaz",
    amount: 2750.50,
    confirmationCode: "WF-2024-8847296",
    createdAt: "2026-02-01T17:33:00Z",
    type: "deposit"
  },
  {
    id: "txn_012",
    bank: "Bank of America",
    emailAccount: "work@gmail.com",
    senderName: "José Luis Moreno",
    amount: 890.00,
    confirmationCode: "BOA-TX-99281747",
    createdAt: "2026-02-01T13:48:00Z",
    type: "deposit"
  }
]

export const chartDataByBank = [
  { date: "30 Ene", wellsFargo: 2400, bankOfAmerica: 1800 },
  { date: "31 Ene", wellsFargo: 1800, bankOfAmerica: 3200 },
  { date: "01 Feb", wellsFargo: 2750, bankOfAmerica: 890 },
  { date: "02 Feb", wellsFargo: 3100, bankOfAmerica: 1450 },
  { date: "03 Feb", wellsFargo: 1875, bankOfAmerica: 620 },
  { date: "04 Feb", wellsFargo: 950, bankOfAmerica: 6300 },
  { date: "05 Feb", wellsFargo: 2030, bankOfAmerica: 3500 },
]

export const chartDataByEmail = [
  { date: "30 Ene", personal: 1200, business: 1800, work: 1200 },
  { date: "31 Ene", personal: 2100, business: 1400, work: 1500 },
  { date: "01 Feb", personal: 0, business: 2750, work: 890 },
  { date: "02 Feb", personal: 1450, business: 0, work: 3100 },
  { date: "03 Feb", personal: 1875, business: 620, work: 0 },
  { date: "04 Feb", personal: 2100, business: 950, work: 4200 },
  { date: "05 Feb", personal: 1250, business: 3500, work: 780 },
]

export const emailAccounts = [
  { email: "personal@gmail.com", transactionCount: 4, totalAmount: 6675.25 },
  { email: "business@gmail.com", transactionCount: 4, totalAmount: 7821.25 },
  { email: "work@gmail.com", transactionCount: 4, totalAmount: 8970.50 },
]

export const stats = {
  totalTransactions: mockTransactions.length,
  totalAmount: mockTransactions.reduce((acc, t) => acc + t.amount, 0),
  wellsFargoTotal: mockTransactions.filter(t => t.bank === "Wells Fargo").reduce((acc, t) => acc + t.amount, 0),
  bankOfAmericaTotal: mockTransactions.filter(t => t.bank === "Bank of America").reduce((acc, t) => acc + t.amount, 0),
  avgTransaction: mockTransactions.reduce((acc, t) => acc + t.amount, 0) / mockTransactions.length,
  todayTransactions: mockTransactions.filter(t => t.createdAt.startsWith("2026-02-05")).length,
}
