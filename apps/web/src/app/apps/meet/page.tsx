import { fromApi } from '@/lib/products';
import { EmptyState, ProductPage, Row } from '@/components/ProductPage';

interface Room { id: string; code: string; title: string; maxParticipants: number; sfuRegion: string }

export default async function MeetPage() {
  const { data, problem } = await fromApi<Room[]>('/v1/meet/rooms');

  return (
    <ProductPage
      title="Meet"
      subtitle="Signalling and room metadata are served by the platform; media runs on a separate plane."
      problem={problem}
    >
      {!data?.length ? (
        <EmptyState>No active rooms. Scheduling one also creates a Calendar entry, via the event bus.</EmptyState>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {data.map((r) => (
            <Row key={r.id} title={r.title} meta={`${r.code} · up to ${r.maxParticipants} · SFU region ${r.sfuRegion}`} />
          ))}
        </ul>
      )}
    </ProductPage>
  );
}
