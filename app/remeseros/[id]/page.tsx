import { RemeseroDetailPage } from "@/components/remeseros/remesero-detail-page";

export const dynamic = "force-dynamic";

export default async function RemeseroDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  return <RemeseroDetailPage remeseroId={resolvedParams.id} />;
}
