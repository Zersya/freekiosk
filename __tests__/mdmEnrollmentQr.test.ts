import { parseMdmEnrollmentQr } from '../src/utils/mdmEnrollmentQr';

describe('parseMdmEnrollmentQr', () => {
  it('parses an MDM enrollment QR payload', () => {
    expect(
      parseMdmEnrollmentQr(
        JSON.stringify({
          type: 'enroll',
          wsUrl: 'wss://mdm.example.com/api/agent/ws',
          enrollmentToken: 'site-token',
        }),
      ),
    ).toEqual({
      wsUrl: 'wss://mdm.example.com/api/agent/ws',
      enrollmentToken: 'site-token',
    });
  });

  it.each([
    'not-json',
    JSON.stringify({ type: 'other', wsUrl: 'wss://mdm.example.com', enrollmentToken: 'token' }),
    JSON.stringify({ type: 'enroll', wsUrl: 'https://mdm.example.com', enrollmentToken: 'token' }),
    JSON.stringify({ type: 'enroll', wsUrl: 'wss://mdm.example.com' }),
  ])('rejects invalid enrollment data', value => {
    expect(() => parseMdmEnrollmentQr(value)).toThrow();
  });
});
