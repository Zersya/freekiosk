export type MdmEnrollmentQrPayload = {
  wsUrl: string;
  enrollmentToken: string;
};

export function parseMdmEnrollmentQr(value: string): MdmEnrollmentQrPayload {
  let payload: unknown;

  try {
    payload = JSON.parse(value);
  } catch {
    throw new Error('This QR code is not a TransKIOSK MDM enrollment code.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('This QR code is not a TransKIOSK MDM enrollment code.');
  }

  const candidate = payload as Record<string, unknown>;
  const wsUrl = typeof candidate.wsUrl === 'string' ? candidate.wsUrl.trim() : '';
  const enrollmentToken =
    typeof candidate.enrollmentToken === 'string'
      ? candidate.enrollmentToken.trim()
      : '';

  if (candidate.type !== 'enroll' || !wsUrl || !enrollmentToken) {
    throw new Error('The enrollment QR is missing its MDM URL or token.');
  }

  if (!/^wss?:\/\/[^/\s]+(?:\/.*)?$/i.test(wsUrl)) {
    throw new Error('The enrollment QR must use a valid ws:// or wss:// MDM URL.');
  }

  return { wsUrl, enrollmentToken };
}
