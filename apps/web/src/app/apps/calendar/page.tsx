import { fromApi } from '@/lib/products';
import { EmptyState, ProductPage, Row } from '@/components/ProductPage';

interface Event { id: string; title: string; startsAt: string; meetRoomId: string | null }

/**
 * A product surface inside the platform shell.
 *
 * Today every product UI is a route in this Next.js app. When the number of
 * frontend teams makes one deploy pipeline a bottleneck, these routes become
 * independently deployed micro-frontends loaded through Module Federation — the
 * shell, the design system and this component's contract stay as they are.
 */
export default async function CalendarPage() {
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 30 * 864e5).toISOString();

  const { data, problem } = await fromApi<{ data: Event[] }>(
    `/v1/calendar/events?from=${from}&to=${to}`,
  );
  const events = data?.data ?? [];

  return (
    <ProductPage
      title="Calendar"
      subtitle="The next 30 days. Entries created by other products are marked."
      problem={problem}
    >
      {events.length === 0 ? <EmptyState>No events in the next 30 days.</EmptyState> : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {events.map((e) => (
            <Row
              key={e.id}
              title={e.title}
              meta={`${new Date(e.startsAt).toLocaleString()}${e.meetRoomId ? ' · created from a Meet room' : ''}`}
            />
          ))}
        </ul>
      )}
    </ProductPage>
  );
}
