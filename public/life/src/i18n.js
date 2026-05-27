// EN / PT-BR strings. Keep keys short and grouped by view.
// PT-BR copy is a starting point — refine with a native speaker before launch.

export const STRINGS = {
  en: {
    'optional': '(optional)',
    'gender.m': 'male',
    'gender.f': 'female',
    'gender.x': 'other',

    'onboard.heading': 'How many days do you have left?',
    'onboard.lede': 'An honest counter for an intentional life. No accounts, no tracking.',
    'onboard.birth': 'Your birth date',
    'onboard.birthHint': 'Stored only on this device.',
    'onboard.name': 'Your name',
    'onboard.country': 'Country',
    'onboard.countryOther': 'Other / global',
    'onboard.gender': 'Gender',
    'onboard.lifespan': 'Expected lifespan',
    'onboard.years': 'years',
    'onboard.lifespanHint': 'Default uses your demographic average — slide to override.',
    'onboard.start': 'Start',
    'onboard.privacy': "Everything stays in your browser. Closing the tab won't lose your data.",

    'counter.daysLeft': 'days remaining',
    'counter.h': 'hours',
    'counter.m': 'minutes',
    'counter.s': 'seconds',
    'counter.lived': 'of your expected life lived',
    'counter.todaysPrompt': 'Today',
    'counter.share': 'Share',
    'counter.snapshot': 'Save image',
    'counter.reference': 'Average life expectancy for your demographic: {avg} years. This is a reference, not a prediction.',
    'counter.greetingNamed': '{name}, you have',
    'counter.greetingAnon': 'You have',
    'counter.passed': 'Your set lifespan has already passed. Every day from here is extra.',

    'share.copied': 'Link copied.',
    'share.failed': 'Could not share — link copied instead.',
    'snap.heading': 'Share image',
    'snap.download': 'Download',
    'snap.share': 'Share',
    'snap.copy': 'Image copied.',
    'snap.tag': 'life · mrdapps.com',

    'footer.reset': 'Reset',
    'reset.confirm': 'Clear your saved details and start over?',
    'onboard.invalid': 'Please check your birth date.',
  },

  pt: {
    'optional': '(opcional)',
    'gender.m': 'masculino',
    'gender.f': 'feminino',
    'gender.x': 'outro',

    'onboard.heading': 'Quantos dias você ainda tem?',
    'onboard.lede': 'Um contador honesto para uma vida intencional. Sem conta, sem rastreio.',
    'onboard.birth': 'Sua data de nascimento',
    'onboard.birthHint': 'Guardado apenas neste aparelho.',
    'onboard.name': 'Seu nome',
    'onboard.country': 'País',
    'onboard.countryOther': 'Outro / global',
    'onboard.gender': 'Gênero',
    'onboard.lifespan': 'Expectativa de vida',
    'onboard.years': 'anos',
    'onboard.lifespanHint': 'Padrão usa a média do seu perfil — arraste para ajustar.',
    'onboard.start': 'Começar',
    'onboard.privacy': 'Tudo fica no seu navegador. Fechar a aba não apaga nada.',

    'counter.daysLeft': 'dias restantes',
    'counter.h': 'horas',
    'counter.m': 'minutos',
    'counter.s': 'segundos',
    'counter.lived': 'da sua expectativa já vivida',
    'counter.todaysPrompt': 'Hoje',
    'counter.share': 'Compartilhar',
    'counter.snapshot': 'Salvar imagem',
    'counter.reference': 'Expectativa média do seu perfil: {avg} anos. É referência, não previsão.',
    'counter.greetingNamed': '{name}, você tem',
    'counter.greetingAnon': 'Você tem',
    'counter.passed': 'Sua expectativa já passou. A partir daqui, todo dia é bônus.',

    'share.copied': 'Link copiado.',
    'share.failed': 'Não foi possível compartilhar — copiei o link.',
    'snap.heading': 'Imagem para compartilhar',
    'snap.download': 'Baixar',
    'snap.share': 'Compartilhar',
    'snap.copy': 'Imagem copiada.',
    'snap.tag': 'life · mrdapps.com',

    'footer.reset': 'Recomeçar',
    'reset.confirm': 'Apagar seus dados e recomeçar?',
    'onboard.invalid': 'Verifique sua data de nascimento.',
  },
};

let currentLang = 'en';

export function setLang(lang) {
  currentLang = STRINGS[lang] ? lang : 'en';
  document.documentElement.lang = currentLang === 'pt' ? 'pt-BR' : 'en';
}

export function getLang() { return currentLang; }

export function t(key, vars) {
  const bank = STRINGS[currentLang] || STRINGS.en;
  let s = bank[key];
  if (s == null) s = STRINGS.en[key] || key;
  if (vars) {
    for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
  }
  return s;
}

// Apply translations to all DOM nodes carrying data-i18n.
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-option]').forEach((el) => {
    el.textContent = t(el.dataset.i18nOption);
  });
  // Update the visible label on the lang toggle
  const langShown = root.querySelector('[data-lang-shown]');
  if (langShown) langShown.textContent = currentLang === 'pt' ? 'PT' : 'EN';
}

// Best-effort detect from the browser. Falls back to EN.
export function detectLang() {
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  if (nav.startsWith('pt')) return 'pt';
  return 'en';
}
