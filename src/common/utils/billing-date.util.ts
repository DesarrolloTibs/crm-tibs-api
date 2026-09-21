/**
 * Utilidades para cálculo de ciclos de facturación y fechas de renovación.
 * Implementa la regla estándar de la industria SaaS "Month-End Clamping"
 * para prevenir desbordamientos en febrero, años bisiestos y meses de 30 días.
 */

/**
 * Suma (o resta si es negativo) meses a una fecha base garantizando:
 * 1. Preservación del día de corte mensual cuando el mes objetivo tiene suficientes días.
 * 2. Month-End Clamping: si el día original (ej. 31) no existe en el mes objetivo (ej. 28 en feb o 30 en abril),
 *    la fecha se fija al último día válido de dicho mes, evitando saltos accidentales de mes en JavaScript.
 * 3. Preservación exacta de la hora, minutos, segundos y milisegundos originales.
 */
export function addBillingMonths(baseDate: Date, months: number): Date {
  const result = new Date(baseDate.getTime());
  const originalDay = baseDate.getDate();

  const totalMonths = baseDate.getMonth() + months;
  const targetYear = baseDate.getFullYear() + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;

  // new Date(año, mes + 1, 0) retorna el último día del mes objetivo (ej. 28, 29, 30 o 31)
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const adjustedDay = Math.min(originalDay, daysInTargetMonth);

  result.setFullYear(targetYear, targetMonth, adjustedDay);
  return result;
}

/**
 * Resta meses a una fecha base con la misma regla de month-end clamping.
 */
export function subtractBillingMonths(baseDate: Date, months: number): Date {
  return addBillingMonths(baseDate, -months);
}
