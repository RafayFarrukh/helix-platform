import { RbacService } from './rbac.service';

/**
 * Permission checking runs on every authorised request for all 100+ products,
 * so its edge cases are worth pinning down. The dangerous direction is a check
 * that grants too much — each test below is a way that could happen.
 */
describe('RbacService.allows', () => {
  it('grants an exactly matching permission', () => {
    expect(RbacService.allows(['calendar.event.create'], 'calendar.event.create')).toBe(true);
  });

  it('denies a permission that was not granted', () => {
    expect(RbacService.allows(['calendar.event.read'], 'calendar.event.delete')).toBe(false);
  });

  it('denies when the caller holds nothing', () => {
    expect(RbacService.allows([], 'calendar.event.read')).toBe(false);
  });

  it('treats "*" as full access (owner role)', () => {
    expect(RbacService.allows(['*'], 'anything.at.all')).toBe(true);
  });

  it('expands a product-level wildcard', () => {
    expect(RbacService.allows(['calendar.*'], 'calendar.event.create')).toBe(true);
  });

  it('expands a resource-level wildcard', () => {
    expect(RbacService.allows(['calendar.event.*'], 'calendar.event.delete')).toBe(true);
  });

  it('does NOT let one product wildcard leak into another product', () => {
    expect(RbacService.allows(['calendar.*'], 'drive.node.delete')).toBe(false);
  });

  it('does NOT let a resource wildcard leak across resources', () => {
    expect(RbacService.allows(['calendar.event.*'], 'calendar.calendar.manage')).toBe(false);
  });

  it('is not fooled by a prefix that is not a segment boundary', () => {
    // "calendar2" starts with "calendar" but is a different product.
    expect(RbacService.allows(['calendar.*'], 'calendar2.event.read')).toBe(false);
  });
});
