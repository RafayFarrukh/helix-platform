import { hashPassword, verifyPassword } from './password';

// scrypt is deliberately slow (~100ms per hash), so these get a wider timeout
// than the Jest default to stay reliable on a loaded machine.
const SLOW = 30_000;

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('Helix-Demo-2026!');
    await expect(verifyPassword('Helix-Demo-2026!', hash)).resolves.toBe(true);
  }, SLOW);

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('Helix-Demo-2026!');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  }, SLOW);

  it('salts each hash, so identical passwords never collide', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toEqual(b);
    await expect(verifyPassword('same', a)).resolves.toBe(true);
    await expect(verifyPassword('same', b)).resolves.toBe(true);
  }, SLOW);

  it('stores its own parameters, so they can be raised later', async () => {
    const hash = await hashPassword('x');
    expect(hash.startsWith('scrypt$32768$8$1$')).toBe(true);
  }, SLOW);

  it('refuses a malformed stored hash instead of throwing', async () => {
    await expect(verifyPassword('x', 'garbage')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$1$2$3$4$5')).resolves.toBe(false);
  }, SLOW);
});
