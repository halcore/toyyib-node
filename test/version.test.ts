import { describe, expect, it } from 'vitest';

import { VERSION } from '../src/index';

describe('VERSION', () => {
  it('is a semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
