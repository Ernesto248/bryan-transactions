export type TransactionType = "deposit" | "withdrawal" | "transfer";

export type Bank = {
  id: string;
  name: string;
};

export type GmailAccountOption = {
  id: string;
  accountName: string;
};

export type Transaction = {
  id: string;
  bank: string;
  accountName: string;
  senderName: string;
  amount: number;
  confirmationCode: string;
  createdAt: string;
  type: TransactionType;
  assignedRemeseroId?: string | null;
  assignedRemeseroNombre?: string | null;
  assignmentHistoryCount?: number;
};

export type Remesero = {
  id: string;
  nombre: string;
  precioActual: number;
  deudaActual: number;
  createdAt: string;
  updatedAt: string;
};

export type RemeseroAssignment = {
  id: string;
  transactionId: string;
  remeseroId: string;
  remeseroNombre: string;
  amountUsd: number;
  priceApplied: number;
  debtAmount: number;
  assignedAt: string;
};

export type RemeseroPayment = {
  id: string;
  remeseroId: string;
  amountPaid: number;
  debtBeforePayment?: number | null;
  debtAfterPayment?: number | null;
  note: string | null;
  paidAt: string;
  revertedAt: string | null;
  revertedReason: string | null;
  cashMovementId?: string | null;
  cashCupBefore?: number | null;
  cashCupAfter?: number | null;
};

export type RemeseroDebtAdjustment = {
  id: string;
  remeseroId: string;
  debtBefore: number;
  debtAfter: number;
  note: string | null;
  adjustedAt: string;
};

export type RemeseroCutType = "PAYMENT" | "MANUAL";

export type RemeseroCut = {
  id: string;
  type: RemeseroCutType;
  cutAt: string;
  balanceAfter: number | null;
  amountPaid: number | null;
  note: string | null;
};

export type RemeseroShareSummaryGroup = {
  priceApplied: number;
  amountsUsd: number[];
  txCount: number;
  totalUsd: number;
  totalCup: number;
  movementCount?: number;
};

export type RemeseroShareSummary = {
  remeseroId: string;
  remeseroNombre: string;
  cutAt: string | null;
  cutType?: RemeseroCutType | null;
  cutNote?: string | null;
  hasPaymentCut: boolean;
  hasManualCut?: boolean;
  lastPaymentAmount: number | null;
  inicioDebt: number;
  totalTiradoUsd: number;
  totalTiradoCup: number;
  finalDebt: number;
  finalDebtType: "DEUDA" | "FONDO";
  netOperationCount?: number;
  movementCount?: number;
  groups: RemeseroShareSummaryGroup[];
  removedGroups: RemeseroShareSummaryGroup[];
  netGroups?: RemeseroShareSummaryGroup[];
};

export type RemeseroDetailRangeOption = {
  id: string;
  label: string;
  from: string | null;
  to: string | null;
  cutType?: RemeseroCutType | null;
  inicioDebt?: number;
};

export type RemeseroDetailAssignment = {
  assignmentId: string;
  transactionId: string;
  senderName: string;
  bank: string | null;
  accountName: string | null;
  confirmationCode: string | null;
  transactionAmount: number;
  amountUsd: number;
  priceApplied: number;
  debtAmount: number;
  assignedAt: string;
  unassignedAt: string | null;
  isActive: boolean;
  assignedInRange?: boolean;
  unassignedInRange?: boolean;
  movementCount?: number;
  netOperations?: number;
  netAmountUsd?: number;
  netDebtAmount?: number;
};

export type RemeseroDetailSummaryGroup = {
  priceApplied: number;
  txCount: number;
  totalUsd: number;
  totalCup: number;
  amountsUsd: number[];
  movementCount?: number;
};

export type RemeseroDetailSummary = {
  txCount: number;
  movementCount?: number;
  totalUsd: number;
  totalCup: number;
  groups: RemeseroDetailSummaryGroup[];
};

export type RemeseroDetailData = {
  remesero: Remesero;
  payments: RemeseroPayment[];
  adjustments?: RemeseroDebtAdjustment[];
  cuts?: RemeseroCut[];
  rangeOptions: RemeseroDetailRangeOption[];
  selectedRange: {
    from: string | null;
    to: string | null;
    inicioDebt?: number;
    cutType?: RemeseroCutType | null;
  };
  summary: RemeseroDetailSummary;
  assignments: RemeseroDetailAssignment[];
};

export type AccountMovementType = "wire" | "expense";

export type AccountBalance = {
  id: string;
  accountName: string;
  incomingTotal: number;
  outgoingTotal: number;
  balance: number;
  transactionCount: number;
  lastTransactionAt: string | null;
  ownerFeePercent: number | null;
};

export type ZelleValuationSummary = {
  balanceUsd: number;
  inventoryUsd: number;
  deficitUsd: number;
  pricedUsd: number;
  unpricedUsd: number;
  costCup: number;
  averagePrice: number | null;
  coveragePercent: number;
};

export type ZelleAccountValuation = ZelleValuationSummary & {
  accountId: string;
  accountName: string;
};

export type WireFifoSnapshot = {
  method: "FIFO_PER_ACCOUNT";
  valuedAt: string;
  balanceBeforeUsd: number;
  balanceAfterUsd: number;
  principalUsd: number;
  wireFeeUsd: number;
  totalDebitUsd: number;
  profit: WireProfitSnapshot | null;
  selected: ZelleValuationSummary;
  remaining: ZelleValuationSummary;
};

export type WireProfitStatus = "EXACT" | "ESTIMATED" | "UNAVAILABLE";

export type WireProfitSnapshot = {
  status: WireProfitStatus;
  globalRate: number;
  settlementAmount: number;
  fifoCostCup: number | null;
  profitCup: number | null;
  profitUsd: number | null;
  ownerFeePercent: number | null;
  ownerFeeAmount: number | null;
  ownerFeeCup: number | null;
  ownerFeeUsd: number | null;
  netProfitCup: number | null;
  netProfitUsd: number | null;
};

export type WireFifoPreview = {
  accountId: string;
  accountName: string;
  requestedUsd: number;
  availableUsd: number;
  canCreate: boolean;
  error: "insufficient_account_balance" | "global_rate_required" | "owner_fee_required" | null;
  principalUsd?: number;
  wireFeeUsd?: number;
  totalDebitUsd?: number;
  profit?: WireProfitSnapshot | null;
  selected: ZelleValuationSummary;
  remaining: ZelleValuationSummary;
};

export type AccountMovement = {
  id: string;
  accountId: string;
  movementType: AccountMovementType;
  amount: number;
  note: string | null;
  createdAt: string;
  revertedAt: string | null;
  revertedReason: string | null;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  settlementCurrency?: FinanceCurrency | null;
  conversionRate?: number | null;
  feePercent?: number | null;
  wireFeeUsd?: number | null;
  totalDebitUsd?: number | null;
  debtAmount?: number | null;
  financeDebtMovementId?: string | null;
  fifoValuation?: WireFifoSnapshot | null;
};

export type FinanceCurrency = "USD" | "CUP";

export type FinanceMovementType =
  | "RECEIVABLE"
  | "RECEIVED"
  | "PAYABLE"
  | "PAID"
  | "SET_RECEIVABLE"
  | "SET_PAYABLE";

export type FinanceSettings = {
  cashUsd: number;
  cashCup: number;
  usdCupRate: number | null;
  updatedAt: string;
};

export type FinanceSettingChange = {
  id: string;
  fieldName: "cashUsd" | "cashCup" | "usdCupRate";
  previousValue: number | null;
  newValue: number | null;
  note: string | null;
  changedAt: string;
};

export type FinanceExpense = {
  id: string;
  currency: FinanceCurrency;
  amount: number;
  description: string;
  balanceBefore: number;
  balanceAfter: number;
  occurredAt: string;
};

export type FinanceDebtMovement = {
  id: string;
  counterpartyId: string;
  currency: FinanceCurrency;
  movementType: FinanceMovementType;
  amount: number;
  signedAmount: number;
  note: string | null;
  occurredAt: string;
  revertedAt: string | null;
  revertedReason: string | null;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  cashMovementId?: string | null;
  sourceType?: "WIRE" | null;
  sourceId?: string | null;
};

export type FinanceCashMovement = {
  id: string;
  currency: FinanceCurrency;
  signedAmount: number;
  balanceBefore: number;
  balanceAfter: number;
  operationType: "EXTERNAL_DEBT" | "REMESERO_PAYMENT" | "CURRENCY_EXCHANGE";
  operationId: string;
  reversalOfId: string | null;
  note: string | null;
  occurredAt: string;
};

export type FinanceExchangeDirection = "USD_TO_CUP" | "CUP_TO_USD";

export type FinanceCurrencyExchange = {
  id: string;
  direction: FinanceExchangeDirection;
  sourceAmount: number;
  rate: number;
  targetAmount: number;
  note: string | null;
  occurredAt: string;
  revertedAt: string | null;
  revertedReason: string | null;
};

export type FinanceCounterparty = {
  id: string;
  name: string;
  balanceUsd: number;
  balanceCup: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  movements: FinanceDebtMovement[];
};

export type FinanceOverviewTotals = {
  zelleUsd: number;
  zelleValuation: ZelleValuationSummary & {
    accounts: ZelleAccountValuation[];
  };
  pendingAssignments: {
    count: number;
    amountUsd: number;
  };
  remeseros: {
    receivableCup: number;
    payableCup: number;
    netCup: number;
    netUsd: number | null;
  };
  external: {
    receivableUsd: number;
    payableUsd: number;
    netUsd: number;
    receivableCup: number;
    payableCup: number;
    netCup: number;
    netCupUsd: number | null;
  };
  capitalTotalUsd: number | null;
  wireProfits?: {
    lifetime: WireProfitPeriodSummary;
    currentMonth: WireProfitPeriodSummary;
  };
};

export type WireProfitPeriodSummary = {
  profitCup: number;
  profitUsd: number;
  exactProfitCup: number;
  exactProfitUsd: number;
  estimatedProfitCup: number;
  estimatedProfitUsd: number;
  exactCount: number;
  estimatedCount: number;
  pendingCount: number;
  ownerFeeCup: number;
  ownerFeeUsd: number;
  netProfitCup: number;
  netProfitUsd: number;
  netExactProfitCup: number;
  netExactProfitUsd: number;
  netEstimatedProfitCup: number;
  netEstimatedProfitUsd: number;
  netExactCount: number;
  netEstimatedCount: number;
  netPendingCount: number;
};

export type FinanceOverview = {
  settings: FinanceSettings;
  totals: FinanceOverviewTotals;
  counterparties: FinanceCounterparty[];
  settingChanges: FinanceSettingChange[];
  expenses: FinanceExpense[];
  cashMovements: FinanceCashMovement[];
  exchanges: FinanceCurrencyExchange[];
};

export type TransactionFeedPageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
};

export type TransactionFeedDistribution = { name: string; value: number };

export type TransactionFeedChartPoint = {
  date: string;
  bank: string;
  accountName: string;
  amount: number;
};

export type TransactionFeedSummary = {
  totalTransactions: number;
  totalAmount: number;
  avgTransaction: number;
  todayTransactions: number;
  todayTransactionsTrend: number | null;
  totalAmountTrend: number | null;
  bankTotals: Array<{ bank: string; totalAmount: number }>;
  bankDistribution: TransactionFeedDistribution[];
  accountDistribution: TransactionFeedDistribution[];
  chartPoints: TransactionFeedChartPoint[];
};

export type TransactionFeedFilterOptions = {
  banks: string[];
  accounts: string[];
  remeseros: string[];
};

export type TransactionFeed = {
  transactions: Transaction[];
  pageInfo: TransactionFeedPageInfo;
  summary: TransactionFeedSummary;
  filterOptions: TransactionFeedFilterOptions;
};
