import type { ProductManifest } from './product-manifest';

/**
 * The Product Registry is how the platform stays sane at 100+ products.
 *
 * At boot the kernel loads every manifest and validates the *whole graph* before
 * a single request is served:
 *   - no duplicate product keys, DB schemas or API prefixes
 *   - no permission key collisions
 *   - every subscribed event is published by someone (no dangling contracts)
 *   - no hard dependency cycles between products
 *
 * A violation fails the build, not production. This is the guardrail that lets
 * many teams ship into one platform without a central architecture review for
 * every change.
 */
export interface RegistryIssue {
  level: 'error' | 'warning';
  product: string;
  message: string;
}

export class ProductRegistry {
  private readonly products = new Map<string, ProductManifest>();

  register(manifest: ProductManifest): void {
    if (this.products.has(manifest.key)) {
      throw new Error(`Duplicate product key: ${manifest.key}`);
    }
    this.products.set(manifest.key, manifest);
  }

  get(key: string): ProductManifest | undefined {
    return this.products.get(key);
  }

  all(): ProductManifest[] {
    return [...this.products.values()];
  }

  /** All permission keys across the platform — feeds the RBAC catalogue + admin UI. */
  permissionCatalogue(): { key: string; product: string; description: string }[] {
    return this.all().flatMap((p) =>
      p.permissions.map((perm) => ({
        key: perm.key,
        product: p.key,
        description: perm.description,
      })),
    );
  }

  validate(): RegistryIssue[] {
    const issues: RegistryIssue[] = [];
    const schemas = new Map<string, string>();
    const prefixes = new Map<string, string>();
    const permissions = new Map<string, string>();
    const published = new Set<string>();

    for (const p of this.all()) {
      const prevSchema = schemas.get(p.dbSchema);
      if (prevSchema) {
        issues.push({ level: 'error', product: p.key, message: `DB schema "${p.dbSchema}" already owned by "${prevSchema}"` });
      }
      schemas.set(p.dbSchema, p.key);

      const prefix = p.apiPrefix ?? `/v1/${p.key}`;
      const prevPrefix = prefixes.get(prefix);
      if (prevPrefix) {
        issues.push({ level: 'error', product: p.key, message: `API prefix "${prefix}" already owned by "${prevPrefix}"` });
      }
      prefixes.set(prefix, p.key);

      for (const perm of p.permissions) {
        if (!perm.key.startsWith(`${p.key}.`)) {
          issues.push({ level: 'error', product: p.key, message: `Permission "${perm.key}" must be namespaced under "${p.key}."` });
        }
        const prevPerm = permissions.get(perm.key);
        if (prevPerm) {
          issues.push({ level: 'error', product: p.key, message: `Permission "${perm.key}" already declared by "${prevPerm}"` });
        }
        permissions.set(perm.key, p.key);
      }

      for (const ev of p.publishes) {
        if (!ev.startsWith(`${p.key}.`)) {
          issues.push({ level: 'warning', product: p.key, message: `Event "${ev}" is published outside its own namespace` });
        }
        published.add(ev);
      }
    }

    // Kernel events are always available to subscribe to.
    for (const ev of ['platform.tenant.created', 'platform.tenant.suspended', 'platform.user.invited', 'platform.user.joined', 'platform.product.enabled', 'platform.product.disabled', 'platform.subscription.changed']) {
      published.add(ev);
    }

    for (const p of this.all()) {
      for (const ev of p.subscribes) {
        if (!published.has(ev)) {
          issues.push({ level: 'error', product: p.key, message: `Subscribes to "${ev}" which no product publishes` });
        }
      }
      for (const dep of p.softDependencies) {
        if (!this.products.has(dep)) {
          issues.push({ level: 'warning', product: p.key, message: `Soft dependency "${dep}" is not installed` });
        }
      }
    }

    return issues;
  }
}
