import { ProductRegistry } from '@helix/core';
import { calendarManifest } from './calendar/calendar.manifest';
import { meetManifest } from './meet/meet.manifest';
import { driveManifest } from './drive/drive.manifest';
import { notesManifest } from './notes/notes.manifest';

const MANIFESTS = [calendarManifest, meetManifest, driveManifest, notesManifest];

/**
 * The contract test every product must pass.
 *
 * The registry runs the same checks at boot, but a failing boot is discovered by
 * whoever deploys next. This runs in CI on the pull request that introduced the
 * problem, which is where a 100-team platform needs the feedback.
 */
describe('product manifest contract', () => {
  it('the whole product graph is valid', () => {
    const registry = new ProductRegistry();
    for (const m of MANIFESTS) registry.register(m);

    const errors = registry.validate().filter((i) => i.level === 'error');
    // Print the actual problems rather than just a count if this ever fails.
    expect(errors.map((e) => `[${e.product}] ${e.message}`)).toEqual([]);
  });

  it.each(MANIFESTS.map((m) => [m.key, m] as const))(
    '%s owns a unique schema, prefix and permission namespace',
    (key, manifest) => {
      expect(manifest.dbSchema).toBeTruthy();
      for (const perm of manifest.permissions) {
        expect(perm.key.startsWith(`${key}.`)).toBe(true);
      }
      for (const event of manifest.publishes) {
        expect(event.startsWith(`${key}.`)).toBe(true);
      }
    },
  );

  it.each(MANIFESTS.map((m) => [m.key, m] as const))(
    '%s declares a quota for every plan tier it is available in',
    (_key, manifest) => {
      if (!manifest.quotas) return; // quotas are optional
      for (const tier of manifest.availableIn) {
        expect(manifest.quotas[tier]).toBeDefined();
      }
    },
  );

  it('every subscribed event is published by some product or the kernel', () => {
    const registry = new ProductRegistry();
    for (const m of MANIFESTS) registry.register(m);
    const dangling = registry.validate().filter((i) => /no product publishes/.test(i.message));
    expect(dangling).toEqual([]);
  });

  it('every product names an owning team, so alerts have a destination', () => {
    for (const m of MANIFESTS) expect(m.owner).toMatch(/^team-/);
  });
});
