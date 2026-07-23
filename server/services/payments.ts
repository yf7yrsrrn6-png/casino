import { config } from '../config.ts'

/**
 * Provider-agnostic payments boundary.
 *
 * Real cash movement is intentionally NOT implemented. A licensed operator wires
 * a concrete PaymentProvider (Stripe, a PSP, a crypto gateway, …) that performs
 * KYC/AML, charges cards and settles payouts, then sets REAL_MONEY_ENABLED=true.
 * Until then every method reports the feature as unavailable so nothing can move
 * real funds. This keeps the surface ready without pretending to be live.
 */
export interface PaymentIntent {
  id: string
  amountMinor: number
  currency: string
  status: 'requires_action' | 'processing' | 'succeeded' | 'failed'
  clientSecret?: string
}

export interface PaymentProvider {
  readonly name: string
  createDepositIntent(userId: string, amountMinor: number, currency: string): Promise<PaymentIntent>
  requestWithdrawal(userId: string, amountMinor: number, currency: string): Promise<PaymentIntent>
}

class DisabledPaymentProvider implements PaymentProvider {
  readonly name = 'disabled'
  async createDepositIntent(): Promise<PaymentIntent> {
    throw new Error('real_money_disabled')
  }
  async requestWithdrawal(): Promise<PaymentIntent> {
    throw new Error('real_money_disabled')
  }
}

// Swap this factory for the licensed provider at go-live.
export function getPaymentProvider(): PaymentProvider {
  // if (config.realMoneyEnabled) return new StripeProvider(...)
  return new DisabledPaymentProvider()
}

export const paymentsStatus = {
  realMoneyEnabled: config.realMoneyEnabled,
  provider: getPaymentProvider().name,
}
