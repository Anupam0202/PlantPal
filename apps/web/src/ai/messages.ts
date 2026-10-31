import type { AiDataCategory, AiErrorCode } from '@plantpal/schemas';
import { usePrefs, type LocalePref } from '../state/prefs';

/** Messages for AI entry points, the send preview and AI errors (Hindi and Spanish are drafts). */

type ErrCopy = Record<AiErrorCode, { title: string; body: string }>;

const en = {
  spark: 'Uses your Gemini key · about 1 request',
  suggestedByAi: 'Suggested by AI',
  noSources: 'No sources',
  unknowns: 'What I don’t know',
  cancel: 'Cancel',
  send: 'Send',
  sending: 'Asking Gemini…',
  tryAgain: 'Try again',
  tryAgainIn: (s: number) => `Try again in ${s} s`,
  openSettings: 'Open Settings › AI',
  dismiss: 'Dismiss',
  withoutAi: 'Without AI:',
  preview: {
    title: 'Send to Gemini?',
    body: 'This goes from your device straight to Google with your own Gemini API key, under your Gemini API terms. PlantPal does not receive it.',
    needed: 'Needed',
    blocked: (names: string) => `This feature needs: ${names}.`,
    show: 'Show exactly what is sent',
    instructions: 'Instructions PlantPal adds',
    cost: (model: string) => `About 1 request · ${model}`,
    remember: 'Your choices are remembered for this feature.',
    keyInText:
      'Your text contains something that looks like an API key, so nothing will be sent. Remove it; to use a key, add it in Settings › AI.',
  },
  categories: {
    plants: 'Plants',
    space: 'Space and household',
    climate: 'Climate summary',
    journal: 'Your note',
    photos: 'Photo',
    location: 'Area (city or region only)',
  } satisfies Record<AiDataCategory, string>,
  cap: {
    title: 'Daily soft cap reached',
    body: (n: number) => `You set a soft cap of ${n} AI requests a day. Send anyway?`,
    sendAnyway: 'Send anyway',
  },
  errors: {
    KEY_MISSING: {
      title: 'Add your Gemini key to use this',
      body: 'AI features use your own free Gemini API key. It stays encrypted on this device.',
    },
    KEY_INVALID: {
      title: 'That key was not accepted',
      body: 'Check the key in Settings › AI, or create a new one in Google AI Studio.',
    },
    PERMISSION_DENIED: {
      title: 'The key cannot use the Gemini API',
      body: 'The API may be off for its project, or the key is restricted. Check it in Google AI Studio.',
    },
    REGION_UNSUPPORTED: {
      title: 'Gemini is not available in your region',
      body: 'Google does not offer the Gemini API where you are. Everything else in PlantPal still works.',
    },
    RATE_LIMITED: { title: 'Too many requests right now', body: 'Wait a little and try again.' },
    DAILY_QUOTA: {
      title: 'Today’s quota is used up',
      body: 'Your key’s daily limit resets tomorrow. You can keep going without AI.',
    },
    BILLING_REQUIRED: {
      title: 'This model needs billing',
      body: 'The model is not on the free tier for your key. Pick another model in Settings › AI.',
    },
    MODEL_UNAVAILABLE: {
      title: 'No suitable model',
      body: 'PlantPal could not find a model for this. Re-check models in Settings › AI.',
    },
    SAFETY_BLOCKED: {
      title: 'Gemini declined to answer',
      body: 'Its safety filters stopped this request. Try rewording, or carry on without AI.',
    },
    RECITATION: {
      title: 'The answer was withheld',
      body: 'Gemini stopped because the answer repeated a source too closely.',
    },
    OUTPUT_TRUNCATED: { title: 'The answer was cut off', body: 'Nothing was saved. Try again.' },
    SCHEMA_INVALID: {
      title: 'The answer did not pass PlantPal’s checks',
      body: 'It was discarded, so nothing unchecked is shown. Try again or continue without AI.',
    },
    NO_FINAL_OUTPUT: { title: 'No answer came back', body: 'Try again in a moment.' },
    NETWORK: { title: 'Could not reach Gemini', body: 'Check your connection and try again.' },
    TIMEOUT: { title: 'Gemini took too long', body: 'Nothing was saved. Try again.' },
    CANCELLED: { title: 'Cancelled', body: '' },
    CONSENT_REQUIRED: { title: 'Nothing was sent', body: 'This feature needs the data you switched off.' },
    AI_DISABLED: { title: 'AI is switched off', body: 'Turn it on in Settings › AI.' },
  } satisfies ErrCopy as ErrCopy,
  explain: {
    button: 'Explain these matches',
    title: 'Why these plants',
    whyItFits: 'Why it fits',
    watchOuts: 'Watch out for',
    firstSteps: 'First steps',
    extras: 'More to check',
    extrasNote: 'Re-checked against your garden by PlantPal’s rules.',
    dropped: (n: number) =>
      n === 1
        ? '1 AI suggestion was left out: not in PlantPal’s catalogue or not suitable here.'
        : `${n} AI suggestions were left out: not in PlantPal’s catalogue or not suitable here.`,
    fallback: 'the reasons on each plant come from PlantPal’s own rules.',
  },
  capture: {
    button: 'Read with AI',
    fallback: 'use “Read it” for simple notes, or fill in the form.',
    task: 'To do',
    due: (d: string) => `Due ${d}`,
  },
  alt: {
    label: 'Alt text',
    hint: 'Describe the photo for people using screen readers.',
    suggest: 'Suggest with AI',
    save: 'Save',
    saved: 'Alt text saved',
    edit: (name: string) => `Alt text for ${name}`,
    photo: 'photo',
    noPlant: 'Gemini could not see a plant in this photo.',
    fallback: 'write a short description yourself.',
  },
  plain: {
    button: 'Explain in plain words',
    title: 'In plain words',
    terms: 'Words used here',
    simple: 'Simpler',
    fallback: 'each figure above has a short label and source.',
  },
};

export type AiMessages = typeof en;

const hi: AiMessages = {
  spark: 'आपकी Gemini कुंजी का उपयोग · लगभग 1 अनुरोध',
  suggestedByAi: 'AI का सुझाव',
  noSources: 'कोई स्रोत नहीं',
  unknowns: 'मुझे क्या पता नहीं',
  cancel: 'रद्द करें',
  send: 'भेजें',
  sending: 'Gemini से पूछ रहे हैं…',
  tryAgain: 'फिर से कोशिश करें',
  tryAgainIn: (s) => `${s} सेकंड में फिर कोशिश करें`,
  openSettings: 'सेटिंग्स › AI खोलें',
  dismiss: 'बंद करें',
  withoutAi: 'AI के बिना:',
  preview: {
    title: 'Gemini को भेजें?',
    body: 'यह आपके डिवाइस से सीधे Google को आपकी अपनी Gemini API कुंजी से, आपकी Gemini API शर्तों के तहत जाता है। PlantPal को यह नहीं मिलता।',
    needed: 'ज़रूरी',
    blocked: (names) => `इस सुविधा को चाहिए: ${names}।`,
    show: 'ठीक-ठीक क्या भेजा जाएगा, दिखाएँ',
    instructions: 'PlantPal के निर्देश',
    cost: (model) => `लगभग 1 अनुरोध · ${model}`,
    remember: 'इस सुविधा के लिए आपकी पसंद याद रखी जाती है।',
    keyInText:
      'आपके टेक्स्ट में API कुंजी जैसा कुछ है, इसलिए कुछ नहीं भेजा जाएगा। उसे हटाएँ; कुंजी सेटिंग्स › AI में जोड़ें।',
  },
  categories: {
    plants: 'पौधे',
    space: 'जगह और घर',
    climate: 'जलवायु सारांश',
    journal: 'आपका नोट',
    photos: 'फ़ोटो',
    location: 'इलाका (केवल शहर या क्षेत्र)',
  },
  cap: {
    title: 'दैनिक सीमा पूरी हुई',
    body: (n) => `आपने रोज़ ${n} AI अनुरोधों की सीमा रखी है। फिर भी भेजें?`,
    sendAnyway: 'फिर भी भेजें',
  },
  errors: {
    KEY_MISSING: {
      title: 'इसके लिए अपनी Gemini कुंजी जोड़ें',
      body: 'AI सुविधाएँ आपकी अपनी मुफ़्त Gemini API कुंजी से चलती हैं। यह इस डिवाइस पर एन्क्रिप्टेड रहती है।',
    },
    KEY_INVALID: {
      title: 'यह कुंजी स्वीकार नहीं हुई',
      body: 'सेटिंग्स › AI में कुंजी जाँचें, या Google AI Studio में नई बनाएँ।',
    },
    PERMISSION_DENIED: {
      title: 'यह कुंजी Gemini API का उपयोग नहीं कर सकती',
      body: 'उसके प्रोजेक्ट में API बंद हो सकता है या कुंजी सीमित है। Google AI Studio में जाँचें।',
    },
    REGION_UNSUPPORTED: {
      title: 'आपके क्षेत्र में Gemini उपलब्ध नहीं है',
      body: 'Google आपके क्षेत्र में Gemini API नहीं देता। PlantPal का बाकी सब काम करता है।',
    },
    RATE_LIMITED: { title: 'अभी बहुत सारे अनुरोध', body: 'थोड़ा रुककर फिर कोशिश करें।' },
    DAILY_QUOTA: {
      title: 'आज का कोटा खत्म',
      body: 'आपकी कुंजी की दैनिक सीमा कल फिर शुरू होगी। AI के बिना जारी रखें।',
    },
    BILLING_REQUIRED: {
      title: 'इस मॉडल के लिए बिलिंग चाहिए',
      body: 'यह मॉडल आपकी कुंजी के मुफ़्त स्तर में नहीं है। सेटिंग्स › AI में दूसरा मॉडल चुनें।',
    },
    MODEL_UNAVAILABLE: {
      title: 'कोई उपयुक्त मॉडल नहीं',
      body: 'सेटिंग्स › AI में मॉडल फिर से जाँचें।',
    },
    SAFETY_BLOCKED: {
      title: 'Gemini ने जवाब नहीं दिया',
      body: 'सुरक्षा फ़िल्टर ने इसे रोका। शब्द बदलें या AI के बिना जारी रखें।',
    },
    RECITATION: { title: 'जवाब रोका गया', body: 'जवाब किसी स्रोत से बहुत मिलता-जुलता था।' },
    OUTPUT_TRUNCATED: { title: 'जवाब अधूरा रहा', body: 'कुछ सहेजा नहीं गया। फिर कोशिश करें।' },
    SCHEMA_INVALID: {
      title: 'जवाब PlantPal की जाँच में पास नहीं हुआ',
      body: 'उसे हटा दिया गया, इसलिए बिना जाँचा कुछ नहीं दिखाया गया।',
    },
    NO_FINAL_OUTPUT: { title: 'कोई जवाब नहीं आया', body: 'थोड़ी देर में फिर कोशिश करें।' },
    NETWORK: { title: 'Gemini तक नहीं पहुँच सके', body: 'कनेक्शन जाँचें और फिर कोशिश करें।' },
    TIMEOUT: { title: 'Gemini ने बहुत देर लगाई', body: 'कुछ सहेजा नहीं गया। फिर कोशिश करें।' },
    CANCELLED: { title: 'रद्द किया गया', body: '' },
    CONSENT_REQUIRED: { title: 'कुछ नहीं भेजा गया', body: 'इस सुविधा को वह डेटा चाहिए जो आपने बंद किया।' },
    AI_DISABLED: { title: 'AI बंद है', body: 'इसे सेटिंग्स › AI में चालू करें।' },
  },
  explain: {
    button: 'इन पौधों को समझाएँ',
    title: 'ये पौधे क्यों',
    whyItFits: 'क्यों उपयुक्त',
    watchOuts: 'ध्यान दें',
    firstSteps: 'पहले कदम',
    extras: 'और देखने लायक',
    extrasNote: 'PlantPal के नियमों से आपके बगीचे के लिए फिर से जाँचा गया।',
    dropped: (n) => `${n} AI सुझाव छोड़े गए: PlantPal की सूची में नहीं या यहाँ उपयुक्त नहीं।`,
    fallback: 'हर पौधे के कारण PlantPal के अपने नियमों से आते हैं।',
  },
  capture: {
    button: 'AI से पढ़ें',
    fallback: 'सरल नोट के लिए “पढ़ें” या फ़ॉर्म भरें।',
    task: 'करना है',
    due: (d) => `${d} तक`,
  },
  alt: {
    label: 'वैकल्पिक टेक्स्ट',
    hint: 'स्क्रीन रीडर उपयोगकर्ताओं के लिए फ़ोटो का वर्णन करें।',
    suggest: 'AI से सुझाव',
    save: 'सहेजें',
    saved: 'वैकल्पिक टेक्स्ट सहेजा गया',
    edit: (name) => `${name} का वैकल्पिक टेक्स्ट`,
    photo: 'फ़ोटो',
    noPlant: 'Gemini को इस फ़ोटो में पौधा नहीं दिखा।',
    fallback: 'खुद एक छोटा वर्णन लिखें।',
  },
  plain: {
    button: 'आसान शब्दों में समझाएँ',
    title: 'आसान शब्दों में',
    terms: 'यहाँ के शब्द',
    simple: 'और आसान',
    fallback: 'ऊपर हर आँकड़े का छोटा लेबल और स्रोत है।',
  },
};

const es: AiMessages = {
  spark: 'Usa tu clave de Gemini · alrededor de 1 solicitud',
  suggestedByAi: 'Sugerido por IA',
  noSources: 'Sin fuentes',
  unknowns: 'Lo que no sé',
  cancel: 'Cancelar',
  send: 'Enviar',
  sending: 'Consultando a Gemini…',
  tryAgain: 'Reintentar',
  tryAgainIn: (s) => `Reintenta en ${s} s`,
  openSettings: 'Abrir Ajustes › IA',
  dismiss: 'Cerrar',
  withoutAi: 'Sin IA:',
  preview: {
    title: '¿Enviar a Gemini?',
    body: 'Esto va de tu dispositivo directamente a Google con tu propia clave de la API de Gemini, según tus términos de la API. PlantPal no lo recibe.',
    needed: 'Necesario',
    blocked: (names) => `Esta función necesita: ${names}.`,
    show: 'Ver exactamente lo que se envía',
    instructions: 'Instrucciones que añade PlantPal',
    cost: (model) => `Alrededor de 1 solicitud · ${model}`,
    remember: 'Tus elecciones se recuerdan para esta función.',
    keyInText:
      'Tu texto contiene algo parecido a una clave de API, así que no se enviará nada. Quítala; para usar una clave, añádela en Ajustes › IA.',
  },
  categories: {
    plants: 'Plantas',
    space: 'Espacio y hogar',
    climate: 'Resumen del clima',
    journal: 'Tu nota',
    photos: 'Foto',
    location: 'Zona (solo ciudad o región)',
  },
  cap: {
    title: 'Límite diario alcanzado',
    body: (n) => `Pusiste un límite de ${n} solicitudes de IA al día. ¿Enviar de todos modos?`,
    sendAnyway: 'Enviar de todos modos',
  },
  errors: {
    KEY_MISSING: {
      title: 'Añade tu clave de Gemini para usar esto',
      body: 'Las funciones de IA usan tu propia clave gratuita de la API de Gemini. Queda cifrada en este dispositivo.',
    },
    KEY_INVALID: {
      title: 'La clave no fue aceptada',
      body: 'Revisa la clave en Ajustes › IA o crea una nueva en Google AI Studio.',
    },
    PERMISSION_DENIED: {
      title: 'La clave no puede usar la API de Gemini',
      body: 'Puede que la API esté desactivada en su proyecto o la clave esté restringida. Revísala en Google AI Studio.',
    },
    REGION_UNSUPPORTED: {
      title: 'Gemini no está disponible en tu región',
      body: 'Google no ofrece la API de Gemini donde estás. Todo lo demás de PlantPal sigue funcionando.',
    },
    RATE_LIMITED: { title: 'Demasiadas solicitudes ahora', body: 'Espera un poco y vuelve a intentarlo.' },
    DAILY_QUOTA: {
      title: 'Se agotó la cuota de hoy',
      body: 'El límite diario de tu clave se renueva mañana. Puedes seguir sin IA.',
    },
    BILLING_REQUIRED: {
      title: 'Este modelo requiere facturación',
      body: 'El modelo no está en el nivel gratuito de tu clave. Elige otro en Ajustes › IA.',
    },
    MODEL_UNAVAILABLE: {
      title: 'Ningún modelo adecuado',
      body: 'Vuelve a comprobar los modelos en Ajustes › IA.',
    },
    SAFETY_BLOCKED: {
      title: 'Gemini no respondió',
      body: 'Sus filtros de seguridad detuvieron la solicitud. Cambia la redacción o sigue sin IA.',
    },
    RECITATION: { title: 'Se retuvo la respuesta', body: 'La respuesta repetía demasiado una fuente.' },
    OUTPUT_TRUNCATED: {
      title: 'La respuesta quedó cortada',
      body: 'No se guardó nada. Vuelve a intentarlo.',
    },
    SCHEMA_INVALID: {
      title: 'La respuesta no pasó las comprobaciones de PlantPal',
      body: 'Se descartó, así que no se muestra nada sin comprobar.',
    },
    NO_FINAL_OUTPUT: { title: 'No llegó ninguna respuesta', body: 'Vuelve a intentarlo en un momento.' },
    NETWORK: { title: 'No se pudo conectar con Gemini', body: 'Revisa tu conexión y vuelve a intentarlo.' },
    TIMEOUT: { title: 'Gemini tardó demasiado', body: 'No se guardó nada. Vuelve a intentarlo.' },
    CANCELLED: { title: 'Cancelado', body: '' },
    CONSENT_REQUIRED: {
      title: 'No se envió nada',
      body: 'Esta función necesita los datos que desactivaste.',
    },
    AI_DISABLED: { title: 'La IA está desactivada', body: 'Actívala en Ajustes › IA.' },
  },
  explain: {
    button: 'Explicar estas plantas',
    title: 'Por qué estas plantas',
    whyItFits: 'Por qué encaja',
    watchOuts: 'Atención',
    firstSteps: 'Primeros pasos',
    extras: 'Más para revisar',
    extrasNote: 'Revisadas para tu jardín con las reglas de PlantPal.',
    dropped: (n) => `${n} sugerencias de IA se omitieron: no están en el catálogo o no son adecuadas aquí.`,
    fallback: 'los motivos de cada planta vienen de las reglas de PlantPal.',
  },
  capture: {
    button: 'Leer con IA',
    fallback: 'usa “Leer” para notas simples o rellena el formulario.',
    task: 'Pendiente',
    due: (d) => `Para el ${d}`,
  },
  alt: {
    label: 'Texto alternativo',
    hint: 'Describe la foto para quienes usan lectores de pantalla.',
    suggest: 'Sugerir con IA',
    save: 'Guardar',
    saved: 'Texto alternativo guardado',
    edit: (name) => `Texto alternativo de ${name}`,
    photo: 'foto',
    noPlant: 'Gemini no vio ninguna planta en esta foto.',
    fallback: 'escribe tú una breve descripción.',
  },
  plain: {
    button: 'Explicar con palabras sencillas',
    title: 'En palabras sencillas',
    terms: 'Términos usados',
    simple: 'Más sencillo',
    fallback: 'cada dato tiene una etiqueta y su fuente.',
  },
};

const catalogs: Record<LocalePref, AiMessages> = { en, hi, es };

export function useAiT(): AiMessages {
  const locale = usePrefs((s) => s.locale);
  return catalogs[locale];
}

export const aiMessagesEn: AiMessages = en;
