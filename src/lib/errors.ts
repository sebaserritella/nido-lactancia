const openFeed = "Esta toma ya está en curso en el otro teléfono.";
const badInterval = "El fin tiene que ser después del inicio.";
const badInvite = "El código no sirve, venció o ya se usó.";
const alreadyInHousehold = "Esta cuenta ya está en una familia.";
const badLogin = "Correo o contraseña incorrectos.";
const emailTaken = "Ese correo ya tiene cuenta.";
const generic = "No se pudo guardar. Probá de nuevo.";

export function messageForError(error: { code?: string; message?: string }): string {
  const code = error.code ?? "";
  const message = error.message ?? "";
  const normalized = message.toLowerCase();
  if (code === "23505") {
    return openFeed;
  }
  if (code === "23514" || normalized.includes("feeds_ended_after_start")) {
    return badInterval;
  }
  if (normalized.includes("invalid invite")) {
    return badInvite;
  }
  if (normalized.includes("already in a household")) {
    return alreadyInHousehold;
  }
  if (normalized.includes("invalid login")) {
    return badLogin;
  }
  if (normalized.includes("already registered")) {
    return emailTaken;
  }
  return generic;
}
