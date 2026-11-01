/**
 * English and Turkish. English is the default: the portals are worldwide.
 * HTML elements carrying data-i18n are filled by apply(); t() covers text
 * built at run time.
 */

const STRINGS = {
  en: {
    'title.tagline': 'Survive the night. Light the meadow.',
    'title.play': 'PLAY',
    'title.shop': 'UPGRADES',
    'title.settings': 'SETTINGS',
    'title.best': 'Best',
    'title.bestNone': '—',
    'title.dawns': 'Dawns',
    'title.freeGold': 'Watch an ad: +{gold} gold',
    'title.howTo': 'Move with WASD, the arrows, or drag. Everything else fires by itself.',

    'hud.level': 'LV',
    'hud.pause': 'Pause',
    'hud.toDawn': 'until dawn',

    'level.title': 'LEVEL UP',
    'level.pick': 'Choose one',
    'level.new': 'NEW',
    'level.lv': 'Lv {level}',
    'level.reroll': 'Watch an ad: new choices',

    'pause.title': 'PAUSED',
    'pause.resume': 'RESUME',
    'pause.quit': 'END RUN',

    'over.dead': 'THE NIGHT GOT YOU',
    'over.dawn': 'DAWN!',
    'over.time': 'Survived',
    'over.level': 'Level',
    'over.kills': 'Bugs',
    'over.gold': 'Gold',
    'over.best': 'New best!',
    'over.revive': 'Watch an ad: revive',
    'over.double': 'Watch an ad: +{gold} gold',
    'over.again': 'PLAY AGAIN',
    'over.menu': 'MENU',

    'shop.title': 'UPGRADES',
    'shop.max': 'MAX',
    'shop.back': 'BACK',

    'settings.title': 'SETTINGS',
    'settings.sound': 'Sound',
    'settings.music': 'Music',
    'settings.numbers': 'Damage numbers',
    'settings.language': 'Language',
    'settings.back': 'BACK',

    'ad.playing': 'Ad playing…',
    'ad.fake': 'TEST AD',
    'ad.none': 'No ad available right now — try again in a bit',
    'ad.notPaid': 'Ad not finished — no reward',
    'toast.gold': '+{gold} gold',
    'toast.bought': '{name} upgraded!',
    'toast.poor': 'Not enough gold',
    'toast.elite': 'A great moth approaches…',
    'toast.boss': 'The Night Queen has come!',
    'toast.ring': 'They are all around you!',

    // Weapons
    'w.spark': 'Spark',
    'w.spark.d': 'Shoots a bolt of light at the nearest bug.',
    'w.halo': 'Halo',
    'w.halo.d': 'Lights circle you, burning what they touch.',
    'w.pulse': 'Pulse',
    'w.pulse.d': 'A burst of light that knocks bugs back.',
    'w.arc': 'Arc',
    'w.arc.d': 'Lightning that jumps from bug to bug.',
    'w.embers': 'Embers',
    'w.embers.d': 'Leave a trail of burning embers as you fly.',
    // Passives
    'p.wings': 'Wings',
    'p.wings.d': '+8% move speed.',
    'p.glow': 'Glow',
    'p.glow.d': '+30% pickup range.',
    'p.shell': 'Shell',
    'p.shell.d': '+20 max health.',
    'p.nectar': 'Nectar',
    'p.nectar.d': 'Heal 0.4 health per second.',
    'p.focus': 'Focus',
    'p.focus.d': 'Weapons recharge 7% faster.',
    'p.bright': 'Brightness',
    'p.bright.d': '+10% damage.',
    'p.reach': 'Reach',
    'p.reach.d': '+10% area.',
    'h.honey': 'Honey',
    'h.honey.d': 'Heal 30 and take 10 gold.',
    // Shop
    'm.vitality': 'Vitality',
    'm.vitality.d': '+15 max health per level.',
    'm.power': 'Power',
    'm.power.d': '+8% damage per level.',
    'm.swiftness': 'Swiftness',
    'm.swiftness.d': '+4% move speed per level.',
    'm.magnetism': 'Magnetism',
    'm.magnetism.d': '+10% pickup range per level.',
    'm.greed': 'Greed',
    'm.greed.d': '+10% gold per level.',
    'm.vigor': 'Vigor',
    'm.vigor.d': 'Heal 0.25 health per second, per level.',
  },
  tr: {
    'title.tagline': 'Geceyi atlat. Çayırı aydınlat.',
    'title.play': 'OYNA',
    'title.shop': 'GELİŞTİR',
    'title.settings': 'AYARLAR',
    'title.best': 'En iyi',
    'title.bestNone': '—',
    'title.dawns': 'Şafak',
    'title.freeGold': 'Reklam izle: +{gold} altın',
    'title.howTo': 'WASD, ok tuşları ya da sürükleyerek uç. Gerisi kendiliğinden ateşlenir.',

    'hud.level': 'SV',
    'hud.pause': 'Duraklat',
    'hud.toDawn': 'şafağa',

    'level.title': 'SEVİYE ATLADIN',
    'level.pick': 'Birini seç',
    'level.new': 'YENİ',
    'level.lv': 'Sv {level}',
    'level.reroll': 'Reklam izle: yeni seçenekler',

    'pause.title': 'DURAKLATILDI',
    'pause.resume': 'DEVAM',
    'pause.quit': 'TURU BİTİR',

    'over.dead': 'GECE SENİ YAKALADI',
    'over.dawn': 'ŞAFAK SÖKTÜ!',
    'over.time': 'Dayandın',
    'over.level': 'Seviye',
    'over.kills': 'Böcek',
    'over.gold': 'Altın',
    'over.best': 'Yeni rekor!',
    'over.revive': 'Reklam izle: yeniden doğ',
    'over.double': 'Reklam izle: +{gold} altın',
    'over.again': 'TEKRAR',
    'over.menu': 'MENÜ',

    'shop.title': 'GELİŞTİR',
    'shop.max': 'TAM',
    'shop.back': 'GERİ',

    'settings.title': 'AYARLAR',
    'settings.sound': 'Ses',
    'settings.music': 'Müzik',
    'settings.numbers': 'Hasar sayıları',
    'settings.language': 'Dil',
    'settings.back': 'GERİ',

    'ad.playing': 'Reklam oynuyor…',
    'ad.fake': 'TEST REKLAMI',
    'ad.none': 'Şu an reklam yok — biraz sonra tekrar dene',
    'ad.notPaid': 'Reklam yarıda kaldı — ödül yok',
    'toast.gold': '+{gold} altın',
    'toast.bought': '{name} geliştirildi!',
    'toast.poor': 'Yeterli altının yok',
    'toast.elite': 'Dev bir güve yaklaşıyor…',
    'toast.boss': 'Gece Kraliçesi geldi!',
    'toast.ring': 'Dört bir yanını sardılar!',

    'w.spark': 'Kıvılcım',
    'w.spark.d': 'En yakın böceğe ışık oku atar.',
    'w.halo': 'Hale',
    'w.halo.d': 'Etrafında dönen ışıklar dokunduğunu yakar.',
    'w.pulse': 'Dalga',
    'w.pulse.d': 'Böcekleri geri iten bir ışık patlaması.',
    'w.arc': 'Şimşek',
    'w.arc.d': 'Böcekten böceğe sıçrayan yıldırım.',
    'w.embers': 'Kor',
    'w.embers.d': 'Uçtuğun yere yanan korlar bırakır.',
    'p.wings': 'Kanat',
    'p.wings.d': '+%8 hız.',
    'p.glow': 'Parıltı',
    'p.glow.d': '+%30 toplama mesafesi.',
    'p.shell': 'Kabuk',
    'p.shell.d': '+20 azami can.',
    'p.nectar': 'Nektar',
    'p.nectar.d': 'Saniyede 0,4 can yeniler.',
    'p.focus': 'Odak',
    'p.focus.d': 'Silahlar %7 daha hızlı dolar.',
    'p.bright': 'Parlaklık',
    'p.bright.d': '+%10 hasar.',
    'p.reach': 'Erişim',
    'p.reach.d': '+%10 alan.',
    'h.honey': 'Bal',
    'h.honey.d': '30 can yenile ve 10 altın al.',
    'm.vitality': 'Dirilik',
    'm.vitality.d': 'Seviye başına +15 azami can.',
    'm.power': 'Güç',
    'm.power.d': 'Seviye başına +%8 hasar.',
    'm.swiftness': 'Çeviklik',
    'm.swiftness.d': 'Seviye başına +%4 hız.',
    'm.magnetism': 'Mıknatıs',
    'm.magnetism.d': 'Seviye başına +%10 toplama mesafesi.',
    'm.greed': 'Açgözlülük',
    'm.greed.d': 'Seviye başına +%10 altın.',
    'm.vigor': 'Zindelik',
    'm.vigor.d': 'Seviye başına saniyede 0,25 can yenileme.',
  },
};

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'tr', label: 'Türkçe' },
];

let current = 'en';

export function detect() {
  const tags = navigator.languages || [navigator.language || 'en'];
  for (const tag of tags) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (STRINGS[code]) return code;
  }
  return 'en';
}

export function setLanguage(code) {
  current = STRINGS[code] ? code : 'en';
  document.documentElement.lang = current;
  return current;
}

export function language() {
  return current;
}

export function t(key, params) {
  let text = STRINGS[current][key];
  if (text === undefined) text = STRINGS.en[key];
  if (text === undefined) return key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (
    params[name] === undefined ? match : params[name]));
}

export function apply(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}

/** The numbers the strings quote, for a test to compare against config. */
export const STRINGS_FOR_TESTS = STRINGS;
