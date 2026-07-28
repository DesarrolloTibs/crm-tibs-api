export class PhoneUtils {
  /**
   * Limpia cualquier carácter no numérico de una cadena.
   */
  static cleanDigits(phone: string | null | undefined): string {
    if (!phone) return '';
    return String(phone).replace(/\D/g, '');
  }

  /**
   * Normaliza prefijos especiales de canales como WhatsApp.
   * - México: Convierte 521XXXXXXXXXX (13 dígitos) a 52XXXXXXXXXX (12 dígitos).
   * - Argentina: Convierte 549XXXXXXXXXX (13 dígitos) a 54XXXXXXXXXX (12 dígitos).
   */
  static normalizeWhatsAppPhone(phone: string | null | undefined): string {
    const digits = PhoneUtils.cleanDigits(phone);
    if (!digits) return '';

    if (digits.startsWith('521') && digits.length === 13) {
      return '52' + digits.slice(3);
    }
    if (digits.startsWith('549') && digits.length === 13) {
      return '54' + digits.slice(3);
    }
    return digits;
  }

  /**
   * Extrae los últimos 9 a 10 dígitos significativos del número (sufijo nacional).
   */
  static extractSubscriberSuffix(phone: string | null | undefined): string {
    const digits = PhoneUtils.cleanDigits(phone);
    if (!digits) return '';
    return digits.length >= 9 ? digits.slice(-9) : digits;
  }

  /**
   * Genera una lista completa de posibles variantes representativas del número telefónico.
   */
  static getPhoneVariants(phone: string | null | undefined, defaultCountryCode = '52'): string[] {
    const digits = PhoneUtils.cleanDigits(phone);
    if (!digits || digits.length < 7) return [];

    const variants = new Set<string>();

    // 1. Número tal cual limpio
    variants.add(digits);
    variants.add(`+${digits}`);

    // 2. Número sin prefijos especiales de WhatsApp
    const normalized = PhoneUtils.normalizeWhatsAppPhone(digits);
    if (normalized) {
      variants.add(normalized);
      variants.add(`+${normalized}`);
    }

    // 3. Caso especial México (52 vs 521)
    if (digits.startsWith('521') && digits.length === 13) {
      const mxStandard = '52' + digits.slice(3);
      variants.add(mxStandard);
      variants.add(`+${mxStandard}`);
      variants.add(digits.slice(3)); // 10 dígitos locales
    } else if (digits.startsWith('52') && digits.length === 12) {
      const mxWhatsapp = '521' + digits.slice(2);
      variants.add(mxWhatsapp);
      variants.add(`+${mxWhatsapp}`);
      variants.add(digits.slice(2)); // 10 dígitos locales
    }

    // 4. Si es un número local de 10 dígitos
    if (digits.length === 10) {
      const withCountry = `${defaultCountryCode}${digits}`;
      variants.add(withCountry);
      variants.add(`+${withCountry}`);
      if (defaultCountryCode === '52') {
        variants.add(`521${digits}`);
        variants.add(`+521${digits}`);
      }
    }

    // 5. Sufijo de 9 dígitos para búsquedas flexibles
    const suffix = PhoneUtils.extractSubscriberSuffix(digits);
    if (suffix) {
      variants.add(suffix);
    }

    return Array.from(variants).filter((v) => v.length > 0);
  }
}
