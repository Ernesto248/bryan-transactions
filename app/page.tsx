import { Dashboard } from "@/components/dashboard/dashboard"
import { getTransactions } from "@/app/actions/get-transactions"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const transactions = await getTransactions()
  return <Dashboard initialTransactions={transactions} />
}
