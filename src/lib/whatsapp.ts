/** Digits-only WhatsApp id for wa.me, or null if the phone is unusable. */
export function whatsappDigits(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length < 8) return null;
  if (digits.startsWith("54")) return digits;
  if (digits.length === 10) return `54${digits}`;
  return digits;
}

export function whatsappUrl(phone: string): string | null {
  const digits = whatsappDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}
