"use server";

import { getPool } from "@/lib/db";
import { Transaction } from "@/lib/types";

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
