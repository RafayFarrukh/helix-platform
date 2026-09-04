/**
 * A product surface inside the platform shell.
 *
 * Today every product UI is a route in this Next.js app. When the number of
 * frontend teams makes one deploy pipeline a bottleneck, these routes become
 * independently deployed micro-frontends loaded through Module Federation — the
 * shell, the design system and the SDK stay exactly as they are.
 */
export default async function CalendarPage() {
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 30 * 864e5).toISOString();

  const res = await fetch(
    `${process.env.INTERNAL_API_URL ?? 'http://localhost:4100'}/v1/calendar/events?from=${from}&to=${to}`,
    { headers: { authorization: `Bearer ${process.env.DEMO_TOKEN ?? ''}` }, cache: 'no-store' },
  ).catch(() => null);

  const events = res?.ok ? (await res.json()).data : [];

  return (
    <>
      <h1 style={{ fontSize: 20 }}>Calendar</h1>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {events.map((e: { id: string; title: string; startsAt: string; meetRoomId: string | null }) => (
          <li key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--helix-border)' }}>
            <div style={{ fontWeight: 600 }}>{e.title}</div>
            <div style={{ color: 'var(--helix-muted)', fontSize: 12 }}>
              {new Date(e.startsAt).toLocaleString()}
              {e.meetRoomId && ' · has a Meet room'}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
