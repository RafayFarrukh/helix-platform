import { fromApi } from '@/lib/products';
import { EmptyState, ProductPage, Row } from '@/components/ProductPage';

interface Node { id: string; name: string; kind: 'folder' | 'file'; sizeBytes: string }

function size(bytes: string): string {
  const n = Number(bytes);
  if (!n) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export default async function DrivePage() {
  const { data, problem } = await fromApi<Node[]>('/v1/drive/nodes');

  return (
    <ProductPage
      title="Drive"
      subtitle="Drive owns the tree; the bytes live in object storage and never pass through the API."
      problem={problem}
    >
      {!data?.length ? (
        <EmptyState>This folder is empty. Uploads go straight to object storage through a pre-signed URL.</EmptyState>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {data.map((n) => (
            <Row key={n.id} title={n.name} meta={n.kind === 'folder' ? 'Folder' : size(n.sizeBytes)} />
          ))}
        </ul>
      )}
    </ProductPage>
  );
}
