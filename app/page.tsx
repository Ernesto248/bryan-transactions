import { Dashboard } from "@/components/dashboard/dashboard"
import { getInitialTransactionFeed } from "@/app/actions/get-transactions"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const feed = await getInitialTransactionFeed()
  return <Dashboard initialTransactions={feed.transactions} initialFeed={feed} />
}
