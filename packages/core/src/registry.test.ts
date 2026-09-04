import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ProductRegistry } from './registry';
import { defineProduct, type ProductManifestInput } from './product-manifest';

/**
 * These tests cover the guardrail the whole "100+ products" claim rests on: the
 * registry must refuse a manifest graph that would let products collide. If
 * these pass, adding product #101 cannot silently break products 1-100.
 */
const base: ProductManifestInput = {
  key: 'calendar',
  name: 'Calendar',
  version: '1.0.0',
  category: 'productivity',
  owner: 'team-a',
  dbSchema: 'calendar',
  permissions: [{ key: 'calendar.event.read', description: 'read' }],
  publishes: ['calendar.event.created'],
};

const make = (over: Partial<ProductManifestInput> = {}) =>
  defineProduct({ ...base, ...over } as ProductManifestInput);

describe('ProductRegistry', () => {
  test('a valid graph produces no issues', () => {
    const r = new ProductRegistry();
    r.register(make());
    r.register(make({ key: 'meet', name: 'Meet', dbSchema: 'meet',
      permissions: [{ key: 'meet.room.read', description: 'read' }],
      publishes: ['meet.room.scheduled'] }));
    assert.deepEqual(r.validate(), []);
  });

  test('rejects a duplicate product key outright', () => {
    const r = new ProductRegistry();
    r.register(make());
    assert.throws(() => r.register(make()), /Duplicate product key/);
  });

  test('rejects two products claiming the same database schema', () => {
    const r = new ProductRegistry();
    r.register(make());
    r.register(make({ key: 'notes', name: 'Notes', dbSchema: 'calendar',
      permissions: [{ key: 'notes.item.read', description: 'read' }], publishes: [] }));
    const errors = r.validate().filter((i) => i.level === 'error');
    assert.ok(errors.some((e) => /schema "calendar" already owned/.test(e.message)));
  });

  test('rejects two products claiming the same API prefix', () => {
    const r = new ProductRegistry();
    r.register(make({ apiPrefix: '/v1/shared' }));
    r.register(make({ key: 'notes', name: 'Notes', dbSchema: 'notes', apiPrefix: '/v1/shared',
      permissions: [{ key: 'notes.item.read', description: 'read' }], publishes: [] }));
    const errors = r.validate().filter((i) => i.level === 'error');
    assert.ok(errors.some((e) => /prefix "\/v1\/shared" already owned/.test(e.message)));
  });

  test('rejects a permission declared outside the product namespace', () => {
    const r = new ProductRegistry();
    r.register(make({ key: 'notes', name: 'Notes', dbSchema: 'notes',
      permissions: [{ key: 'calendar.event.read', description: 'stolen' }], publishes: [] }));
    const errors = r.validate().filter((i) => i.level === 'error');
    assert.ok(errors.some((e) => /must be namespaced under "notes\."/.test(e.message)));
  });

  test('rejects a permission already declared by another product', () => {
    const r = new ProductRegistry();
    r.register(make());
    r.register(make({ key: 'calendar2', name: 'C2', dbSchema: 'calendar2',
      permissions: [{ key: 'calendar.event.read', description: 'dupe' }], publishes: [] }));
    const errors = r.validate().filter((i) => i.level === 'error');
    assert.ok(errors.some((e) => /already declared by "calendar"/.test(e.message)));
  });

  test('rejects subscribing to an event nobody publishes', () => {
    const r = new ProductRegistry();
    r.register(make({ subscribes: ['ghost.event.happened'] }));
    const errors = r.validate().filter((i) => i.level === 'error');
    assert.ok(errors.some((e) => /no product publishes/.test(e.message)));
  });

  test('kernel events are always subscribable', () => {
    const r = new ProductRegistry();
    r.register(make({ subscribes: ['platform.tenant.created'] }));
    assert.deepEqual(r.validate().filter((i) => i.level === 'error'), []);
  });

  test('a missing soft dependency warns but does not fail the boot', () => {
    const r = new ProductRegistry();
    r.register(make({ softDependencies: ['not-installed'] }));
    const issues = r.validate();
    assert.equal(issues.filter((i) => i.level === 'error').length, 0);
    assert.ok(issues.some((i) => i.level === 'warning' && /not installed/.test(i.message)));
  });

  test('the permission catalogue aggregates across every product', () => {
    const r = new ProductRegistry();
    r.register(make());
    r.register(make({ key: 'meet', name: 'Meet', dbSchema: 'meet',
      permissions: [{ key: 'meet.room.read', description: 'read' }], publishes: [] }));
    assert.deepEqual(
      r.permissionCatalogue().map((p) => p.key).sort(),
      ['calendar.event.read', 'meet.room.read'],
    );
  });
});

describe('ProductManifest validation', () => {
  test('rejects a malformed product key at definition time', () => {
    assert.throws(() => make({ key: 'Not Valid!' }));
  });

  test('rejects a permission key that is not product.resource.action', () => {
    assert.throws(() => make({ permissions: [{ key: 'tooshort', description: 'x' }] }));
  });

  test('applies defaults so a minimal manifest is still complete', () => {
    const m = make();
    assert.deepEqual(m.availableIn, ['free', 'pro', 'business', 'enterprise']);
    assert.deepEqual(m.subscribes, []);
    assert.deepEqual(m.softDependencies, []);
  });
});
