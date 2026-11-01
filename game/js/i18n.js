/**
 * Turkish and English UI strings.
 *
 * Every player-facing string in the game lives here. The language is picked
 * from the device on first run and can be changed in settings; `apply()` fills
 * in anything in the HTML carrying a data-i18n attribute, and `t()` covers
 * strings built at runtime.
 */

export const LANGUAGES = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
];

const STRINGS = {
  tr: {
    'app.name': 'Dörtyol',
    'app.tagline': 'Şehir Sürüşü',
    'app.description': 'Düşük poligonlu bir şehirde serbest sürüş ve teslimat.',

    'loading.preparing': 'Hazırlanıyor…',
    'loading.error': 'Yükleme hatası: {message}',

    'menu.best': 'EN İYİ',
    'menu.coins': 'JETON',
    'menu.freeRoam': 'SERBEST SÜRÜŞ',
    'menu.freeRoamHint': 'şehirde istediğin gibi gez',
    'menu.rush': 'TRAFİK YARIŞI',
    'menu.rushHint': 'sonsuz otoyol, skor avı',
    'menu.garage': 'GARAJ',
    'menu.settings': 'AYARLAR',
    'menu.controlsHint': 'Direksiyon: ◀ ▶ ya da ekranı kaydır · '
      + 'Fren/geri: FREN · Nitro: N',

    'hud.score': 'SKOR',
    'hud.speedUnit': 'km/sa',
    'hud.nitro': 'NITRO',
    'hud.pause': 'Duraklat',
    'hud.map': 'Harita',

    'control.left': 'Sola',
    'control.right': 'Sağa',
    'control.brake': 'Fren ve geri',
    'control.brakeLabel': 'FREN',
    'control.gas': 'Gaz',
    'control.gasLabel': 'GAZ',
    'control.nitro': 'Nitro',

    'garage.title': 'GARAJ',
    'garage.back': 'GERİ',
    'garage.selected': 'SEÇİLİ',
    'garage.select': 'SEÇ',
    'garage.parts': '{car} · DONANIM',
    'garage.paint': 'RENK',
    'garage.paintOf': 'Renk {color}',
    'garage.full': 'TAM',
    'garage.bought': '{car} garajında!',
    'garage.upgraded': '{car} yükseltildi!',
    'garage.tooPoor': 'Yeterli jetonun yok',
    'garage.repair': 'ONARIM',
    'menu.records': 'KAYITLAR',
    'settings.weather': 'Hava',
    'weather.auto': 'Rastgele',
    'weather.clear': 'Açık',
    'weather.rain': 'Yağmur',
    'rank.1': 'ÇIRAK',
    'rank.2': 'KURYE',
    'rank.3': 'SÜRÜCÜ',
    'rank.4': 'USTA SÜRÜCÜ',
    'rank.5': 'NAKLİYECİ',
    'rank.6': 'ŞEHRİN ADAMI',
    'rank.7': 'EFSANE',
    'rank.8': 'DÖRTYOL KRALI',
    'rank.toNext': 'sonraki için {xp} XP',
    'rank.top': 'en üst kademe',
    'rank.promoted': 'Terfi! Artık {rank}',
    'records.title': 'KAYITLAR',
    'records.career': 'TOPLAM — {xp} XP',
    'records.ranks': 'KADEMELER',
    'records.jobs': 'Tamamlanan iş',
    'records.onTime': 'Zamanında',
    'records.cleanJobs': 'Çizik almadan',
    'records.distance': 'Sürülen yol',
    'records.earned': 'Kazanılan jeton',
    'records.crashes': 'Çarpışma',
    'records.busts': 'Yakalanma',
    'records.escapes': 'Ekme',
    'records.best': 'En iyi skor',
    'garage.repaired': 'Araba onarıldı',
    'police.busted': 'Polis yakaladı — {amount} 🪙 ceza',
    'police.escaped': 'Polisi ektin!',
    'garage.statSpeed': 'Hız',
    'garage.statAccel': 'İvme',
    'garage.statGrip': 'Yol tutuş',
    'garage.payBadge': 'Teslimatta +%{percent}',

    'part.engine': 'Motor',
    'part.gearbox': 'Şanzıman',
    'part.tyres': 'Lastik',
    'part.brakes': 'Fren',

    'car.sport': 'Kavalye GT',
    'car.sport.tag': 'Dengeli ve affedici',
    'car.hatch': 'Ceylan 1.4',
    'car.hatch.tag': 'Küçük, çevik, ucuz',
    'car.van': 'Kervan Panelvan',
    'car.van.tag': 'Yavaş, ama kazancı yüksek',
    'car.muscle': 'Bozkurt V8',
    'car.muscle.tag': 'Ağır ama düz yolda uçar',
    'car.super': 'Şimşek SR',
    'car.super.tag': 'Çok hızlı, çok keskin',

    'settings.title': 'AYARLAR',
    'settings.sound': 'Ses',
    'settings.music': 'Müzik',
    'settings.autoThrottle': 'Otomatik gaz',
    'settings.tilt': 'Eğerek sür (jiroskop)',
    'settings.shadows': 'Gölgeler',
    'settings.leftHanded': 'Solak düzeni',
    'settings.vibrate': 'Titreşim',
    'settings.language': 'Dil',
    'settings.timeOfDay': 'Zaman',
    'time.auto': 'Rastgele',
    'time.day': 'Gündüz',
    'time.dusk': 'Akşam',
    'time.night': 'Gece',
    'settings.back': 'GERİ',
    'settings.noTilt': 'Bu cihazda eğim desteği yok',

    'pause.title': 'DURAKLATILDI',
    'pause.resume': 'DEVAM ET',
    'pause.menu': 'ANA MENÜ',

    'over.crashed': 'ÇARPTIN!',
    'over.record': 'YENİ REKOR!',
    'over.score': 'Skor',
    'over.distance': 'Mesafe',
    'over.coins': 'Jeton',
    'over.best': 'En iyi',
    'over.retry': 'TEKRAR',
    'over.menu': 'ANA MENÜ',

    'toast.coinsRefilled': 'Jetonlar yenilendi!',
    'toast.delivered': 'Teslimat tamam! +{coins} 🪙',
    'toast.deliveredOnTime': 'Zamanında! +{coins} 🪙 ({bonus} bonus)',
    'toast.timeUp': 'Süre doldu — bonus gitti',
    'toast.pickedUp': 'Yolcu alındı — şimdi bırakma noktasına',
    'toast.checkpoint': 'Durak {done}/{total} — devam!',
    'toast.nearMiss': 'Kıl payı! +{points}',
    'toast.nitroFull': 'Nitro dolduruldu!',
    'toast.qualityDropped': 'Akıcılık için görüntü ayarları düşürüldü',

    'tutorial.city': 'GAZ ile sür, ◀ ▶ ile dön. Yeşil işarete git.',
    'tutorial.rush': 'GAZ ile hızlan, ◀ ▶ ile şerit değiştir. Trafiğe çarpma!',
    'tutorial.gotIt': 'ANLADIM',
  },

  en: {
    'app.name': 'Dörtyol',
    'app.tagline': 'City Driver',
    'app.description': 'Free-roam driving and deliveries in a low-poly city.',

    'loading.preparing': 'Getting ready…',
    'loading.error': 'Loading failed: {message}',

    'menu.best': 'BEST',
    'menu.coins': 'COINS',
    'menu.freeRoam': 'FREE ROAM',
    'menu.freeRoamHint': 'drive the city however you like',
    'menu.rush': 'TRAFFIC RUSH',
    'menu.rushHint': 'endless highway, chase the score',
    'menu.garage': 'GARAGE',
    'menu.settings': 'SETTINGS',
    'menu.controlsHint': 'Steer: ◀ ▶ or drag the screen · '
      + 'Brake/reverse: BRAKE · Nitro: N',

    'hud.score': 'SCORE',
    'hud.speedUnit': 'km/h',
    'hud.nitro': 'NITRO',
    'hud.pause': 'Pause',
    'hud.map': 'Map',

    'control.left': 'Left',
    'control.right': 'Right',
    'control.brake': 'Brake and reverse',
    'control.brakeLabel': 'BRAKE',
    'control.gas': 'Throttle',
    'control.gasLabel': 'GAS',
    'control.nitro': 'Nitro',

    'garage.title': 'GARAGE',
    'garage.back': 'BACK',
    'garage.selected': 'IN USE',
    'garage.select': 'DRIVE',
    'garage.parts': '{car} · PARTS',
    'garage.paint': 'PAINT',
    'garage.paintOf': 'Colour {color}',
    'garage.full': 'MAX',
    'garage.bought': '{car} is yours!',
    'garage.upgraded': '{car} upgraded!',
    'garage.tooPoor': 'Not enough coins',
    'garage.repair': 'REPAIR',
    'menu.records': 'RECORDS',
    'settings.weather': 'Weather',
    'weather.auto': 'Random',
    'weather.clear': 'Clear',
    'weather.rain': 'Rain',
    'rank.1': 'ROOKIE',
    'rank.2': 'COURIER',
    'rank.3': 'DRIVER',
    'rank.4': 'PRO DRIVER',
    'rank.5': 'HAULIER',
    'rank.6': 'CITY REGULAR',
    'rank.7': 'LEGEND',
    'rank.8': 'KING OF DÖRTYOL',
    'rank.toNext': '{xp} XP to next',
    'rank.top': 'top rank',
    'rank.promoted': 'Promoted! You are now {rank}',
    'records.title': 'RECORDS',
    'records.career': 'LIFETIME — {xp} XP',
    'records.ranks': 'RANKS',
    'records.jobs': 'Jobs finished',
    'records.onTime': 'On time',
    'records.cleanJobs': 'Without a scratch',
    'records.distance': 'Distance driven',
    'records.earned': 'Coins earned',
    'records.crashes': 'Crashes',
    'records.busts': 'Times caught',
    'records.escapes': 'Getaways',
    'records.best': 'Best score',
    'garage.repaired': 'Car repaired',
    'police.busted': 'Pulled over — {amount} 🪙 fine',
    'police.escaped': 'You lost them!',
    'garage.statSpeed': 'Speed',
    'garage.statAccel': 'Accel',
    'garage.statGrip': 'Grip',
    'garage.payBadge': '+{percent}% per delivery',

    'part.engine': 'Engine',
    'part.gearbox': 'Gearbox',
    'part.tyres': 'Tyres',
    'part.brakes': 'Brakes',

    'car.sport': 'Kavalye GT',
    'car.sport.tag': 'Balanced and forgiving',
    'car.hatch': 'Ceylan 1.4',
    'car.hatch.tag': 'Small, nimble, cheap',
    'car.van': 'Kervan Van',
    'car.van.tag': 'Slow, but it pays',
    'car.muscle': 'Bozkurt V8',
    'car.muscle.tag': 'Heavy, but flies in a straight line',
    'car.super': 'Şimşek SR',
    'car.super.tag': 'Very fast, very sharp',

    'settings.title': 'SETTINGS',
    'settings.sound': 'Sound',
    'settings.music': 'Music',
    'settings.autoThrottle': 'Auto throttle',
    'settings.tilt': 'Tilt steering',
    'settings.shadows': 'Shadows',
    'settings.leftHanded': 'Left-handed layout',
    'settings.vibrate': 'Vibration',
    'settings.language': 'Language',
    'settings.timeOfDay': 'Time of day',
    'time.auto': 'Random',
    'time.day': 'Day',
    'time.dusk': 'Dusk',
    'time.night': 'Night',
    'settings.back': 'BACK',
    'settings.noTilt': 'This device has no tilt sensor',

    'pause.title': 'PAUSED',
    'pause.resume': 'RESUME',
    'pause.menu': 'MAIN MENU',

    'over.crashed': 'CRASHED!',
    'over.record': 'NEW RECORD!',
    'over.score': 'Score',
    'over.distance': 'Distance',
    'over.coins': 'Coins',
    'over.best': 'Best',
    'over.retry': 'RETRY',
    'over.menu': 'MAIN MENU',

    'toast.coinsRefilled': 'Coins respawned!',
    'toast.delivered': 'Delivered! +{coins} 🪙',
    'toast.deliveredOnTime': 'On time! +{coins} 🪙 ({bonus} bonus)',
    'toast.timeUp': 'Out of time — bonus lost',
    'toast.pickedUp': 'Passenger aboard — now to the drop-off',
    'toast.checkpoint': 'Stop {done}/{total} — keep going!',
    'toast.nearMiss': 'Close one! +{points}',
    'toast.nitroFull': 'Nitro topped up!',
    'toast.qualityDropped': 'Visuals lowered to keep it smooth',

    'tutorial.city': 'GAS to drive, ◀ ▶ to steer. Head for the green marker.',
    'tutorial.rush': 'GAS to speed up, ◀ ▶ to change lane. Do not hit traffic!',
    'tutorial.gotIt': 'GOT IT',
  },
};

let current = 'tr';

/** Device language, if we have strings for it. */
export function detect() {
  const preferred = (navigator.languages || [navigator.language || 'tr'])
    .map((tag) => String(tag).slice(0, 2).toLowerCase());
  for (const code of preferred) {
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

/**
 * @param {string} key
 * @param {Object<string, string|number>} [params] filled into {placeholders}
 */
export function t(key, params) {
  const table = STRINGS[current] || STRINGS.en;
  let text = table[key];
  if (text === undefined) text = STRINGS.en[key];
  if (text === undefined) return key;          // loud rather than blank
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (
    params[name] === undefined ? match : params[name]));
}

/** Fill every element in `root` that declares a string. */
export function apply(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  const title = document.querySelector('title');
  if (title) title.textContent = t('app.name') + ' — ' + t('app.tagline');
}
