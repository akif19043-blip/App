/**
 * Turkish and English strings. The language follows the device on first run
 * and can be changed in settings. `apply()` fills every element carrying a
 * data-i18n attribute; `t()` is for strings built at runtime.
 */

export const LANGUAGES = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
];

const STRINGS = {
  tr: {
    'app.name': 'Sıçra',
    'app.tagline': 'Çatıdan çatıya',
    'menu.best': 'EN İYİ',
    'menu.coins': 'ALTIN',
    'menu.play': 'KOŞ',
    'menu.shop': 'DÜKKAN',
    'menu.missions': 'GÖREVLER',
    'menu.settings': 'AYARLAR',
    'menu.hint': 'Kaydır: ◀ ▶ şerit · ▲ zıpla · ▼ kay',

    'hud.pause': 'Duraklat',
    'hud.multiplier': '×{mult}',
    'hud.tapToStart': 'Başlamak için dokun',
    'hud.swipeLeftRight': 'Şerit değiştirmek için sağa‑sola kaydır',
    'hud.swipeUp': 'Zıplamak için yukarı kaydır',
    'hud.swipeDown': 'Kaymak için aşağı kaydır',
    'hud.missionDone': 'Görev tamam: {title}',
    'hud.newBest': 'YENİ REKOR!',

    'power.magnet': 'Mıknatıs',
    'power.shield': 'Kalkan',
    'power.wings': 'Kanat',
    'power.magnet.desc': 'Yakındaki altınları çeker',
    'power.shield.desc': 'Engellerden geçersin',
    'power.wings.desc': 'Çatıların üstünden uçarsın',

    'pause.title': 'DURAKLATILDI',
    'pause.resume': 'DEVAM',
    'pause.quit': 'MENÜ',

    'over.title': 'YAKALANDIN',
    'over.fell': 'DÜŞTÜN',
    'over.score': 'SKOR',
    'over.distance': 'MESAFE',
    'over.coins': 'ALTIN',
    'over.best': 'EN İYİ',
    'over.revive': 'DEVAM ET',
    'over.reviveCost': '{cost} altın',
    'over.retry': 'TEKRAR',
    'over.menu': 'MENÜ',

    'shop.title': 'DÜKKAN',
    'shop.characters': 'KARAKTERLER',
    'shop.upgrades': 'GÜÇLENDİRMELER',
    'shop.back': 'GERİ',
    'shop.selected': 'SEÇİLİ',
    'shop.select': 'SEÇ',
    'shop.buy': 'AL',
    'shop.max': 'TAM',
    'shop.level': 'Sv. {level}',
    'shop.tooPoor': 'Yeterli altının yok',
    'shop.bought': '{name} senin!',
    'shop.upgraded': '{name} güçlendi!',
    'shop.seconds': '{s} sn',

    'char.ekin': 'Ekin',
    'char.ekin.desc': 'Kurye. Şehri çatıdan tanır.',
    'char.deniz': 'Deniz',
    'char.deniz.desc': 'Kapüşon, kulaklık, hiç durmaz.',
    'char.robot': 'R-7',
    'char.robot.desc': 'Yedek parçadan yapılmış, pili bitmez.',
    'char.ninja': 'Gölge',
    'char.ninja.desc': 'Kimse gördüğünü hatırlamıyor.',
    'char.astro': 'Astro',
    'char.astro.desc': 'Yerçekimi tavsiye niteliğinde.',
    'char.sultan': 'Sultan',
    'char.sultan.desc': 'Çatılar zaten onun sayılır.',

    'missions.title': 'GÖREVLER',
    'missions.multiplier': 'Skor çarpanı',
    'missions.next': 'Üçünü bitir, çarpan artsın',
    'missions.reward': '+{coins} altın',
    'missions.back': 'GERİ',
    'mission.coinsRun': 'Tek koşuda {n} altın topla',
    'mission.coinsTotal': 'Toplam {n} altın topla',
    'mission.distanceRun': 'Tek koşuda {n} m koş',
    'mission.distanceTotal': 'Toplam {n} m koş',
    'mission.jumps': 'Tek koşuda {n} kez zıpla',
    'mission.slides': 'Tek koşuda {n} kez kay',
    'mission.gaps': 'Tek koşuda {n} boşluk atla',
    'mission.magnets': '{n} mıknatıs al',
    'mission.shields': '{n} kalkan al',
    'mission.wings': '{n} kanat al',
    'mission.nearMisses': 'Tek koşuda {n} kıl payı geç',
    'mission.score': 'Tek koşuda {n} skor yap',

    'settings.title': 'AYARLAR',
    'settings.language': 'Dil',
    'settings.sound': 'Ses',
    'settings.music': 'Müzik',
    'settings.vibrate': 'Titreşim',
    'settings.quality': 'Grafik',
    'settings.quality.high': 'Yüksek',
    'settings.quality.medium': 'Orta',
    'settings.quality.low': 'Düşük',
    'settings.reset': 'İLERLEMEYİ SIFIRLA',
    'settings.resetConfirm': 'Tüm ilerleme silinecek. Emin misin?',
    'settings.back': 'GERİ',
    'settings.stats': 'Toplam {runs} koşu · {distance} m · {coins} altın',
    'settings.on': 'AÇIK',
    'settings.off': 'KAPALI',
    'settings.qualityDropped': 'Grafik {level} seviyesine düşürüldü',
  },
  en: {
    'app.name': 'Sıçra',
    'app.tagline': 'Roof to roof',
    'menu.best': 'BEST',
    'menu.coins': 'COINS',
    'menu.play': 'RUN',
    'menu.shop': 'SHOP',
    'menu.missions': 'MISSIONS',
    'menu.settings': 'SETTINGS',
    'menu.hint': 'Swipe: ◀ ▶ lanes · ▲ jump · ▼ slide',

    'hud.pause': 'Pause',
    'hud.multiplier': '×{mult}',
    'hud.tapToStart': 'Tap to start',
    'hud.swipeLeftRight': 'Swipe left or right to change lane',
    'hud.swipeUp': 'Swipe up to jump',
    'hud.swipeDown': 'Swipe down to slide',
    'hud.missionDone': 'Mission complete: {title}',
    'hud.newBest': 'NEW BEST!',

    'power.magnet': 'Magnet',
    'power.shield': 'Shield',
    'power.wings': 'Wings',
    'power.magnet.desc': 'Pulls in nearby coins',
    'power.shield.desc': 'Smash through obstacles',
    'power.wings.desc': 'Fly above the rooftops',

    'pause.title': 'PAUSED',
    'pause.resume': 'RESUME',
    'pause.quit': 'MENU',

    'over.title': 'CAUGHT',
    'over.fell': 'YOU FELL',
    'over.score': 'SCORE',
    'over.distance': 'DISTANCE',
    'over.coins': 'COINS',
    'over.best': 'BEST',
    'over.revive': 'KEEP GOING',
    'over.reviveCost': '{cost} coins',
    'over.retry': 'RETRY',
    'over.menu': 'MENU',

    'shop.title': 'SHOP',
    'shop.characters': 'CHARACTERS',
    'shop.upgrades': 'POWER-UPS',
    'shop.back': 'BACK',
    'shop.selected': 'SELECTED',
    'shop.select': 'SELECT',
    'shop.buy': 'BUY',
    'shop.max': 'MAX',
    'shop.level': 'Lv. {level}',
    'shop.tooPoor': 'Not enough coins',
    'shop.bought': '{name} is yours!',
    'shop.upgraded': '{name} upgraded!',
    'shop.seconds': '{s} s',

    'char.ekin': 'Ekin',
    'char.ekin.desc': 'Courier. Knows the city by its roofs.',
    'char.deniz': 'Deniz',
    'char.deniz.desc': 'Hoodie, headphones, never stops.',
    'char.robot': 'R-7',
    'char.robot.desc': 'Built from spare parts. Battery never dies.',
    'char.ninja': 'Shade',
    'char.ninja.desc': 'Nobody remembers seeing them.',
    'char.astro': 'Astro',
    'char.astro.desc': 'Treats gravity as a suggestion.',
    'char.sultan': 'Sultan',
    'char.sultan.desc': 'The roofs are technically theirs.',

    'missions.title': 'MISSIONS',
    'missions.multiplier': 'Score multiplier',
    'missions.next': 'Finish all three to raise it',
    'missions.reward': '+{coins} coins',
    'missions.back': 'BACK',
    'mission.coinsRun': 'Collect {n} coins in one run',
    'mission.coinsTotal': 'Collect {n} coins in total',
    'mission.distanceRun': 'Run {n} m in one run',
    'mission.distanceTotal': 'Run {n} m in total',
    'mission.jumps': 'Jump {n} times in one run',
    'mission.slides': 'Slide {n} times in one run',
    'mission.gaps': 'Clear {n} gaps in one run',
    'mission.magnets': 'Pick up {n} magnets',
    'mission.shields': 'Pick up {n} shields',
    'mission.wings': 'Pick up {n} wings',
    'mission.nearMisses': '{n} near misses in one run',
    'mission.score': 'Score {n} in one run',

    'settings.title': 'SETTINGS',
    'settings.language': 'Language',
    'settings.sound': 'Sound',
    'settings.music': 'Music',
    'settings.vibrate': 'Vibration',
    'settings.quality': 'Graphics',
    'settings.quality.high': 'High',
    'settings.quality.medium': 'Medium',
    'settings.quality.low': 'Low',
    'settings.reset': 'RESET PROGRESS',
    'settings.resetConfirm': 'All progress will be erased. Are you sure?',
    'settings.back': 'BACK',
    'settings.stats': '{runs} runs · {distance} m · {coins} coins in total',
    'settings.on': 'ON',
    'settings.off': 'OFF',
    'settings.qualityDropped': 'Graphics lowered to {level}',
  },
};

let current = 'tr';

export function detect() {
  const langs = navigator.languages || [navigator.language || 'tr'];
  for (const lang of langs) {
    if (/^tr/i.test(lang)) return 'tr';
    if (/^en/i.test(lang)) return 'en';
  }
  return 'tr';
}

export function setLanguage(code) {
  current = STRINGS[code] ? code : 'tr';
  document.documentElement.lang = current;
}

export function getLanguage() {
  return current;
}

export function t(key, params = {}) {
  let text = STRINGS[current][key] ?? STRINGS.tr[key] ?? key;
  for (const name of Object.keys(params)) {
    text = text.replace(new RegExp('\\{' + name + '\\}', 'g'), String(params[name]));
  }
  return text;
}

/** Fill every element with data-i18n / data-i18n-aria. */
export function apply(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'));
  }
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  }
}

/** Format a whole number with thin grouping, e.g. 12 480. */
export function num(value) {
  return Math.round(value).toLocaleString(current === 'tr' ? 'tr-TR' : 'en-US');
}
