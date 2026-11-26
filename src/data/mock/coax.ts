import { isAuMobile } from '@/domain';

/**
 * Coax SMS client interface. The mock below answers after a short delay with "sent" or "failed".
 * The adapter moves a text from queued to sent, and then to delivered after COAX_DELIVERY_MS.
 * Feature work plugs in behind this interface. The Supabase conversion replaces it with coax-send.
 */
export interface CoaxSendInput {
  to: string;
  body: string;
  clientRef: string;
}

export interface CoaxSendResult {
  coaxId: string;
  status: 'sent' | 'failed';
  error: string | null;
}

export interface CoaxClient {
  send(input: CoaxSendInput): Promise<CoaxSendResult>;
}

/** Time the mock Coax takes to accept a text. */
export const COAX_LATENCY_MS = 500;
/** Time from accepted to delivered. */
export const COAX_DELIVERY_MS = 2500;

/**
 * invalid_numbers (default): only 04xx mobiles are accepted, anything else fails with "Invalid mobile number".
 * all_fail: every send fails with a carrier error. For demonstrating the Inbox recovery path.
 */
export type CoaxFailureMode = 'invalid_numbers' | 'all_fail';
let failureMode: CoaxFailureMode = 'invalid_numbers';

export function setCoaxFailureMode(mode: CoaxFailureMode): void {
  failureMode = mode;
}

let coaxCounter = 0;

export const mockCoax: CoaxClient = {
  send({ to }) {
    coaxCounter += 1;
    const coaxId = `coax_${Date.now().toString(36)}${coaxCounter}`;
    return new Promise((resolve) => {
      setTimeout(() => {
        if (failureMode === 'all_fail') {
          resolve({ coaxId, status: 'failed', error: 'Carrier rejected the message' });
          return;
        }
        if (!isAuMobile(to)) {
          resolve({ coaxId, status: 'failed', error: 'Invalid mobile number' });
          return;
        }
        resolve({ coaxId, status: 'sent', error: null });
      }, COAX_LATENCY_MS);
    });
  },
};
