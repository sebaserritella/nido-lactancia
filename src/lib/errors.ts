import { es } from "../i18n/es";

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
  if (normalized.includes("weight") && code === "23505") {
    return es.weightDayExists;
  }
  if (normalized.includes("measure_present") && code === "23514") {
    return es.needWeightOrLength;
  }
  if (normalized.includes("length") && code === "23514") {
    return es.invalidLength;
  }
  if ((normalized.includes("weight") || normalized.includes("grams_check")) && code === "23514") {
    return es.invalidWeight;
  }
  if (code === "23505" && normalized.includes("baby_vaccinations")) {
    return es.vaccineAlreadySaved;
  }
  if (code === "23505") {
    return openFeed;
  }
  if (normalized.includes("given_on_not_future") || normalized.includes("visited_on_not_future")) {
    return es.vaccineFutureDate;
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
  if (normalized.includes("invalid email")) {
    return es.invalidEmail;
  }
  if (normalized.includes("invalid phone") || normalized.includes("invalid whatsapp")) {
    return es.invalidPhone;
  }
  if (normalized.includes("rate limit") || normalized.includes("email rate")) {
    return "Supabase limitó el envío de correos. Esperá un rato y probá de nuevo.";
  }
  if (normalized.includes("not authorized")) {
    return "Ese correo no puede recibir el enlace con el mail de prueba de Supabase.";
  }
  if (normalized.includes("email address") && normalized.includes("invalid")) {
    return "Ingresá un correo válido, por ejemplo nombre@gmail.com.";
  }
  if (normalized.includes("not household owner")) {
    return es.notHouseholdOwner;
  }
  if (normalized.includes("owner cannot leave")) {
    return es.ownerCannotLeave;
  }
  if (normalized.includes("cannot transfer to self")) {
    return es.cannotTransferToSelf;
  }
  if (normalized.includes("cannot remove self") || normalized.includes("cannot remove owner")) {
    return es.notHouseholdOwner;
  }
  if (normalized.includes("member not found") || normalized.includes("invite not found")) {
    return generic;
  }
  return generic;
}
