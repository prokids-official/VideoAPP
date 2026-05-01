import { describe, expect, it } from 'vitest';
import { displayNameSchema, emailSchema, passwordSchema, signupSchema } from './validators';

describe('emailSchema', () => {
  it('accepts @beva.com addresses', () => {
    expect(emailSchema.safeParse('alice@beva.com').success).toBe(true);
  });

  it('accepts syntactically valid non-beva addresses for whitelist checks', () => {
    expect(emailSchema.safeParse('alice@vendor.com').success).toBe(true);
    expect(emailSchema.safeParse('alice@beva.co').success).toBe(true);
  });

  it('rejects malformed emails', () => {
    expect(emailSchema.safeParse('not-email').success).toBe(false);
  });

  it('normalizes case to lowercase', () => {
    const result = emailSchema.safeParse('Alice@Beva.com');
    expect(result.success && result.data).toBe('alice@beva.com');
  });
});

describe('passwordSchema', () => {
  it('requires at least 8 chars, a digit, and a letter', () => {
    expect(passwordSchema.safeParse('abcdefg1').success).toBe(true);
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('alllowercase').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
  });
});

describe('displayNameSchema', () => {
  it('accepts 1-32 chars', () => {
    expect(displayNameSchema.safeParse('乐美林').success).toBe(true);
    expect(displayNameSchema.safeParse('x').success).toBe(true);
    expect(displayNameSchema.safeParse('y'.repeat(32)).success).toBe(true);
  });

  it('rejects empty or >32', () => {
    expect(displayNameSchema.safeParse('').success).toBe(false);
    expect(displayNameSchema.safeParse(' '.repeat(3)).success).toBe(false);
    expect(displayNameSchema.safeParse('y'.repeat(33)).success).toBe(false);
  });
});

describe('signupSchema', () => {
  it('validates whole payload', () => {
    const result = signupSchema.safeParse({
      email: 'x@beva.com',
      password: 'abcdefg1',
      display_name: '乐美林',
    });

    expect(result.success).toBe(true);
  });
});
