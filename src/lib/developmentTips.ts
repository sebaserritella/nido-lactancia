import { completedCalendarMonths } from "./age";

export type DevelopmentBandId = "m0_3" | "m4_6" | "m9" | "m12" | "m18" | "m24";

export type DevelopmentBandContent = {
  id: DevelopmentBandId;
  title: string;
  expected: string[];
  consultIf: string[];
  tips: string[];
};

const bands: Record<DevelopmentBandId, Omit<DevelopmentBandContent, "id">> = {
  m0_3: {
    title: "0 a 3 meses",
    expected: [
      "Te mira un rato y sigue caras o luces",
      "Se calma con voz o brazos",
      "Sonrisa social hacia las 6–8 semanas",
      "Lleva las manos a la boca; sostiene un momento la cabeza boca abajo",
    ],
    consultIf: [
      "Casi no responde a sonidos fuertes",
      "No fija la mirada",
      "Tono muy flácido o muy rígido",
      "No sonríe a nadie hacia los 3 meses",
    ],
    tips: [
      "¿Te mira cuando le hablás de cerca?",
      "¿Se calma un poco con tu voz o el colo?",
      "¿Hay sonrisa social con personas conocidas?",
    ],
  },
  m4_6: {
    title: "4 a 6 meses",
    expected: [
      "Ríe a carcajadas y busca quién habla",
      "Balbucea",
      "Gira, se sienta con apoyo, pasa objetos de una mano a otra",
      "Reconoce caras conocidas",
    ],
    consultIf: [
      "No balbucea",
      "No muestra interés por las personas",
      "No alcanza objetos",
      "No gira la cabeza al oír su nombre hacia el final de esta etapa",
    ],
    tips: [
      "¿Busca la voz cuando alguien habla?",
      "¿Quiere agarrar lo que le mostrás?",
      "¿Hay juego de risas ida y vuelta?",
    ],
  },
  m9: {
    title: "Alrededor de 9 meses",
    expected: [
      "Gatea o se desplaza; se sienta solo",
      "Empieza la pinza con los dedos",
      "Juego de esconder / aparecer; entiende un “no” básico",
      "Sílabas tipo ba / ma / da; puede haber ansiedad ante desconocidos",
    ],
    consultIf: [
      "No responde al nombre",
      "No busca interacción",
      "No señala ni mira a lo que le mostrás",
      "No balbucea con variedad",
    ],
    tips: [
      "¿Responde cuando lo llamás por su nombre?",
      "¿Te mira para compartir algo interesante?",
      "¿Imita gestos simples (aplauso, chau)?",
    ],
  },
  m12: {
    title: "Alrededor de 12 meses",
    expected: [
      "Camina con apoyo o primeros pasos",
      "1–2 palabras con sentido (mamá / papá / agua)",
      "Señala lo que quiere",
      "Imita gestos; juega a dar y recibir",
    ],
    consultIf: [
      "No señala",
      "No dice ninguna palabra",
      "No imita",
      "No hay juego compartido; evita mucho el contacto visual",
      "Movimientos repetitivos muy rígidos que cortan el juego",
    ],
    tips: [
      "¿Te señala o te trae algo para que lo veas?",
      "¿Usa alguna palabra con sentido?",
      "¿Le importa tu reacción (risa, sorpresa)?",
    ],
  },
  m18: {
    title: "Alrededor de 18 meses",
    expected: [
      "Camina seguro; sube escalones con ayuda",
      "Unas 10–20 palabras; señala partes del cuerpo",
      "Juego de fingir simple (dar de comer a un muñeco)",
      "Trae cosas para mostrar",
    ],
    consultIf: [
      "Menos de ~5–10 palabras",
      "No señala",
      "Poco interés en otros niños o adultos",
      "No hay juego simbólico",
      "Regresión: dejó de hablar o de mirar",
    ],
    tips: [
      "¿Te muestra objetos para compartir, no solo para pedir?",
      "¿Hay juego de fingir aunque sea mínimo?",
      "¿El lenguaje sirve para comunicar (no solo repetir)?",
    ],
  },
  m24: {
    title: "Alrededor de 24 meses",
    expected: [
      "Corre; puede patear una pelota; sube y baja con apoyo",
      "Frases de 2 palabras; sigue órdenes simples de 2 pasos",
      "Juego paralelo con otros niños; más juego de fingir",
    ],
    consultIf: [
      "No junta palabras",
      "No entiende órdenes simples",
      "No hay juego compartido",
      "Rutinas muy fijas con mucha angustia si se cambian",
      "Estereotipias intensas",
    ],
    tips: [
      "¿Junta dos palabras con sentido?",
      "¿Sigue una orden simple de dos pasos?",
      "¿Hay ida y vuelta en el juego o la conversación?",
    ],
  },
};

export function developmentBandForMonths(months: number): DevelopmentBandId | null {
  if (!Number.isFinite(months) || months < 0) return null;
  if (months <= 3) return "m0_3";
  if (months <= 6) return "m4_6";
  if (months <= 10) return "m9";
  if (months <= 14) return "m12";
  if (months <= 20) return "m18";
  if (months <= 24) return "m24";
  return null;
}

export function developmentTipsForBaby(
  bornOn: string | null,
  today: string,
): DevelopmentBandContent | null {
  if (!bornOn) return null;
  const months = completedCalendarMonths(bornOn, today);
  if (months === null) return null;
  const id = developmentBandForMonths(months);
  if (!id) return null;
  const body = bands[id];
  return { id, ...body };
}
