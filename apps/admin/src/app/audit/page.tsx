/**
 * The audit trail is read here, never written here. The console cannot mutate
 * history — the API grants it no such permission and the database revokes UPDATE
 * and DELETE on the table from the application role entirely.
 */
export default function AuditPage() {
  return (
    <>
      <h1 style={{ fontSize: 20 }}>Audit log</h1>
      <p style={{ color: '#A8A29E' }}>
        Filter by tenant, actor, product, action or correlation id. Every mutating
        request across every product, plus every denied access attempt.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#A8A29E', fontSize: 12 }}>
            <th style={{ padding: 8 }}>Time</th>
            <th style={{ padding: 8 }}>Tenant</th>
            <th style={{ padding: 8 }}>Actor</th>
            <th style={{ padding: 8 }}>Product</th>
            <th style={{ padding: 8 }}>Action</th>
            <th style={{ padding: 8 }}>Outcome</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan={6} style={{ padding: 8, color: '#57534E' }}>Connected to GET /v1/platform/audit</td></tr>
        </tbody>
      </table>
    </>
  );
}
