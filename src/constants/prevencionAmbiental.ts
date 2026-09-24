// SECURE_OS — ODS 12: prevención de incidentes ambientales.
// Textos fijos de "Qué hacer" / "Qué no hacer" por subtipo ambiental.
// Se muestran en una tarjeta informativa después de enviar un reporte
// ambiental; no bloquean el envío y se cierran con "Entendido".
import { EnvironmentalSubtype } from '../types';

export interface PrevencionAmbiental {
  label: string;
  hacer: string[];
  noHacer: string[];
}

export const PREVENCION_AMBIENTAL: Record<EnvironmentalSubtype, PrevencionAmbiental> = {
  derrame_quimico: {
    label: 'Derrame o fuga química',
    hacer: [
      'Aléjate del lugar.',
      'Avisa a bomberos o a la autoridad ambiental municipal.',
      'Indica a otras personas que se mantengan lejos.',
    ],
    noHacer: [
      'No toques ni respires la sustancia.',
      'No la laves hacia el desagüe.',
      'No intentes limpiarla tú.',
    ],
  },
  fuga_gas: {
    label: 'Fuga de gas',
    hacer: [
      'Aléjate de la zona.',
      'Ventila si puedes hacerlo sin exponerte.',
      'Avisa a bomberos y a la empresa de gas.',
    ],
    noHacer: [
      'No enciendas fuego, luces ni aparatos eléctricos.',
      'No uses el celular dentro de la zona de la fuga.',
    ],
  },
  quema_residuos: {
    label: 'Quema de residuos',
    hacer: [
      'Aléjate del humo.',
      'Cúbrete nariz y boca.',
      'Avisa a la autoridad municipal.',
    ],
    noHacer: [
      'No respires el humo.',
      'No intentes apagarla si hay plásticos o químicos.',
      'No arrojes agua a residuos desconocidos.',
    ],
  },
  botadero_ilegal: {
    label: 'Botadero ilegal',
    hacer: [
      'Fotografía desde lejos.',
      'Anota la ubicación exacta.',
      'Avisa a la autoridad municipal.',
    ],
    noHacer: [
      'No manipules ni muevas los residuos.',
      'No los quemes.',
      'No dejes que niños o mascotas se acerquen.',
    ],
  },
  contaminacion_agua_suelo: {
    label: 'Contaminación de agua o suelo',
    hacer: [
      'Evita el contacto y no consumas esa agua.',
      'Avisa a la autoridad ambiental.',
      'Advierte a los vecinos.',
    ],
    noHacer: [
      'No uses el agua para beber, cocinar o regar.',
      'No lo mezcles con otros cuerpos de agua.',
    ],
  },
};
