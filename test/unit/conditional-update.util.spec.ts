import { assertConditionalUpdateApplied } from '../../src/common/utils/conditional-update.util';
import { ErrorCode } from '../../src/common/errors/error-codes';
import { DomainException } from '../../src/common/errors/domain.exception';

describe('assertConditionalUpdateApplied', () => {
  it('does not throw when a row was affected', () => {
    expect(() => assertConditionalUpdateApplied(1)).not.toThrow();
  });

  it('throws a DomainException with the given code when zero rows affected', () => {
    expect(() =>
      assertConditionalUpdateApplied(0, ErrorCode.ALREADY_REVIEWED),
    ).toThrow();

    try {
      assertConditionalUpdateApplied(0, ErrorCode.ALREADY_REVIEWED);
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainException);
      expect((err as DomainException).code).toBe(ErrorCode.ALREADY_REVIEWED);
    }
  });

  it('defaults to CONFLICT when no code is specified', () => {
    try {
      assertConditionalUpdateApplied(0);
      fail('expected throw');
    } catch (err) {
      expect((err as DomainException).code).toBe(ErrorCode.CONFLICT);
    }
  });
});
