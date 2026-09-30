/**
 * Normalize display-only punctuation while preserving the number's country
 * prefix. SpaGym is responsible for country-specific number normalization.
 */
export const normalizePhone = (phone: string) => {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("00") ? digits.slice(2) : digits;
};

/**
 * Validate phone numbers without assuming a country. E.164 numbers contain
 * at most 15 digits; allowing 7 digits also supports shorter local numbers
 * when the user does not provide a country code.
 */
export const isValidPhone = (phone: string) => {
  const trimmed = phone.trim();
  if (!trimmed || !/^\+?[\d\s().-]+$/.test(trimmed)) return false;
  return /^\d{7,15}$/.test(normalizePhone(trimmed));
};

export const formatPhone = (phone: string) => phone;
