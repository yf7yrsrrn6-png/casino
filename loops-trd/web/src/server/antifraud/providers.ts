/**
 * Зовнішні перевірки — інтерфейси-заглушки для майбутнього підключення
 * AMLBot / Chainalysis / Crystal та сервісів IP-розвідки (ipinfo, IPQualityScore тощо).
 */

export type AmlLevel = "low" | "medium" | "high" | "unknown";

export interface AmlResult {
  level: AmlLevel;
  score?: number;
  source: string;
  details?: string;
}

export interface AmlProvider {
  readonly name: string;
  checkAddress(address: string): Promise<AmlResult>;
}

/**
 * Заглушка: повертає "unknown" для всіх адрес, крім явно позначених у змінній
 * AML_STUB_HIGH_RISK (через кому) — зручно для тестування сценаріїв блокування.
 */
export class StubAmlProvider implements AmlProvider {
  readonly name = "stub";
  private readonly high: Set<string>;
  private readonly medium: Set<string>;

  constructor(high: string[] = [], medium: string[] = []) {
    this.high = new Set(high.map((a) => a.toLowerCase()));
    this.medium = new Set(medium.map((a) => a.toLowerCase()));
  }

  async checkAddress(address: string): Promise<AmlResult> {
    const a = address.toLowerCase();
    if (this.high.has(a)) return { level: "high", score: 90, source: this.name, details: "У списку заглушки (high)" };
    if (this.medium.has(a)) return { level: "medium", score: 50, source: this.name, details: "У списку заглушки (medium)" };
    return { level: "unknown", source: this.name };
  }
}

/**
 * Каркас для AMLBot. Підключення: реалізуйте запит до API AMLBot відповідно до їхньої документації
 * та змапте відповідь на AmlResult (riskscore 0–100 → low/medium/high).
 * Поки ключ не заданий або API не реалізовано — повертає "unknown" і не блокує угоди.
 */
export class AmlBotProvider implements AmlProvider {
  readonly name = "amlbot";
  constructor(private readonly apiKey: string | undefined) {}

  async checkAddress(_address: string): Promise<AmlResult> {
    if (!this.apiKey) return { level: "unknown", source: this.name, details: "AMLBOT_API_KEY не задано" };
    // TODO: виклик API AMLBot. Не вигадуємо формат запиту — додайте за офіційною документацією.
    return { level: "unknown", source: this.name, details: "Інтеграцію ще не реалізовано" };
  }
}

export interface IpIntelResult {
  proxy: boolean;
  reasons: string[];
  source: string;
}

export interface IpIntelProvider {
  check(ip: string | null, hints: string[]): Promise<IpIntelResult>;
}

/** Евристика за заголовками запиту. Замініть на сервіс IP-розвідки для точного виявлення VPN. */
export class HeuristicIpIntel implements IpIntelProvider {
  async check(_ip: string | null, hints: string[]): Promise<IpIntelResult> {
    return { proxy: hints.length > 0, reasons: hints, source: "headers" };
  }
}

export function defaultAmlProvider(): AmlProvider {
  if (process.env.AMLBOT_API_KEY) return new AmlBotProvider(process.env.AMLBOT_API_KEY);
  const split = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
  return new StubAmlProvider(split(process.env.AML_STUB_HIGH_RISK), split(process.env.AML_STUB_MEDIUM_RISK));
}
