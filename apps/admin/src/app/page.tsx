export default function AdminHome() {
  return (
    <>
      <h1 style={{ fontSize: 20 }}>Platform operations</h1>
      <p style={{ color: '#A8A29E', maxWidth: 640 }}>
        Tenant lifecycle, product enablement, plan and quota management, feature-flag
        rollout and the audit trail. Every action here is itself audited, and the
        console holds no data of its own — it is a client of the same API, with an
        elevated permission set.
      </p>
    </>
  );
}
