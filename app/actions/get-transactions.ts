"use server";

import { getPool } from "@/lib/db";
import { Transaction, TransactionFeed } from "@/lib/types";
import { loadTransactionFeed } from "@/lib/transaction-feed";
import { TRANSACTION_TIME_ZONE } from "@/lib/date-time";

function startOfZonedDay(daysAgo: number) {
  const source = new Date(Date.now() - daysAgo * 86_400_000);
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TRANSACTION_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const values = Object.fromEntries(formatter.formatToParts(source).map((part) => [part.type, part.value]));
  const localMidnightAsUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
  const probeValues = Object.fromEntries(formatter.formatToParts(new Date(localMidnightAsUtc)).map((part) => [part.type, part.value]));
  const representedProbe = Date.UTC(Number(probeValues.year), Number(probeValues.month) - 1, Number(probeValues.day), Number(probeValues.hour), Number(probeValues.minute), Number(probeValues.second));
  return new Date(localMidnightAsUtc - (representedProbe - localMidnightAsUtc));
}

export async function getInitialTransactionFeed(): Promise<TransactionFeed> {
  const client = await getPool().connect();
  try {
    return await loadTransactionFeed(client, { limit: 30, from: startOfZonedDay(7).toISOString() });
  } finally {
    client.release();
  }
}

export async function getTransactions(): Promise<Transaction[]> {
  const client = await getPool().connect();
  try {
    const query = `
      SELECT
        t.id,
        b.name as bank,
        g.account_name as "accountName",
        t.actor_name as "senderName",
        t.amount,
        t.confirmation_code as "confirmationCode",
        t.occurred_at as "createdAt",
        rta.remesero_id as "assignedRemeseroId",
        r.nombre as "assignedRemeseroNombre"
      FROM transactions t
      LEFT JOIN banks b ON t.bank_id = b.id
      LEFT JOIN gmail_accounts g ON t.gmail_account_id = g.id
      LEFT JOIN remesero_transaction_assignments rta ON rta.transaction_id = t.id AND rta.unassigned_at IS NULL
      LEFT JOIN remeseros r ON r.id = rta.remesero_id
      ORDER BY t.occurred_at DESC
    `;

    const result = await client.query(query);

    return result.rows.map((row) => {
      const amount = Number(row.amount);
      const confirmationCode = String(row.confirmationCode ?? "");

      const type = confirmationCode.startsWith("TR-")
        ? "transfer"
        : amount < 0
          ? "withdrawal"
          : "deposit";

      return {
        ...row,
        amount,
        createdAt: row.createdAt
          ? new Date(row.createdAt).toISOString()
          : new Date().toISOString(),
        type,
      };
    });
  } finally {
    client.release();
  }
}
