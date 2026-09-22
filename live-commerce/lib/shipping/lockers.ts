// A sample of InPost Paczkomat lockers, standing in for the InPost Points API
// (https://api-shipx-pl.easypack24.net/v1/points) that the Geowidget queries.

export interface Paczkomat {
  id: string;
  city: string;
  street: string;
  postalCode: string;
  description: string;
  lat: number;
  lng: number;
  open247: boolean;
}

export const PACZKOMAT_ID_PATTERN = /^[A-Z]{3}[0-9]{1,4}[A-Z]{1,3}$/;

export function isValidPaczkomatId(id: string): boolean {
  return PACZKOMAT_ID_PATTERN.test(id);
}

const L = (
  id: string,
  city: string,
  street: string,
  postalCode: string,
  description: string,
  lat: number,
  lng: number,
  open247 = true,
): Paczkomat => ({ id, city, street, postalCode, description, lat, lng, open247 });

export const PACZKOMATY: Paczkomat[] = [
  L("WAW123M", "Warszawa", "ul. Marszałkowska 104", "00-017", "Przy stacji metra Świętokrzyska", 52.2352, 21.0086),
  L("WAW01N", "Warszawa", "ul. Nowy Świat 22", "00-373", "Obok księgarni", 52.2334, 21.0189),
  L("WAW45A", "Warszawa", "al. Jerozolimskie 179", "02-222", "Parking Blue City", 52.2127, 20.9535),
  L("WAW88M", "Warszawa", "ul. Puławska 145", "02-715", "Przy Galerii Mokotów", 52.1797, 21.0038),
  L("WAW210P", "Warszawa", "ul. Targowa 72", "03-734", "Praga, przy Dworcu Wileńskim", 52.2552, 21.0359),
  L("WAW317M", "Warszawa", "ul. Kondratowicza 20", "03-285", "Targówek, przy Rossmannie", 52.2921, 21.0482),
  L("WAW09B", "Warszawa", "ul. Grójecka 208", "02-390", "Ochota, stacja paliw", 52.2083, 20.9713, false),
  L("KRA01N", "Kraków", "ul. Pawia 5", "31-154", "Galeria Krakowska, poziom -1", 50.0676, 19.9475),
  L("KRA112M", "Kraków", "ul. Karmelicka 30", "31-128", "Przy Biedronce", 50.0664, 19.9304),
  L("KRA56A", "Kraków", "os. Centrum E 1", "31-934", "Nowa Huta, plac Centralny", 50.0717, 20.0374),
  L("KRA203P", "Kraków", "ul. Kalwaryjska 12", "30-504", "Podgórze, przy tramwaju", 50.0452, 19.9486),
  L("WRO07M", "Wrocław", "ul. Świdnicka 40", "50-024", "Renoma, wejście od Podwala", 51.1033, 17.0303),
  L("WRO150N", "Wrocław", "pl. Grunwaldzki 22", "50-363", "Pasaż Grunwaldzki", 51.1123, 17.0600),
  L("WRO33A", "Wrocław", "ul. Legnicka 58", "54-204", "Magnolia Park", 51.1197, 16.9906),
  L("GDA02M", "Gdańsk", "ul. Grunwaldzka 141", "80-264", "Galeria Bałtycka", 54.3831, 18.5994),
  L("GDA77N", "Gdańsk", "ul. Podwale Grodzkie 8", "80-895", "Przy Dworcu Głównym", 54.3561, 18.6446),
  L("GDY14A", "Gdynia", "ul. Świętojańska 30", "81-372", "Centrum, przy PKO", 54.5189, 18.5405),
  L("POZ08A", "Poznań", "ul. Półwiejska 32", "61-888", "Stary Browar", 52.4020, 16.9275),
  L("POZ120M", "Poznań", "ul. Głogowska 67", "60-736", "Łazarz, przy targowisku", 52.3974, 16.9036),
  L("LOD05M", "Łódź", "ul. Piotrkowska 99", "90-425", "Pasaż Rubinsteina", 51.7626, 19.4574),
  L("LOD61N", "Łódź", "ul. Karskiego 5", "91-071", "Manufaktura", 51.7801, 19.4468),
  L("KAT19M", "Katowice", "ul. 3 Maja 30", "40-097", "Galeria Katowicka", 50.2587, 19.0170),
  L("LUB03A", "Lublin", "ul. Lipowa 13", "20-020", "Plaza Lublin", 51.2445, 22.5537),
  L("SZC11N", "Szczecin", "al. Wyzwolenia 18", "70-554", "Galaxy Centrum", 53.4337, 14.5496),
  L("BYD22M", "Bydgoszcz", "ul. Gdańska 45", "85-005", "Przy Hali Targowej", 53.1276, 18.0088),
  L("BIA04A", "Białystok", "ul. Lipowa 16", "15-427", "Przy katedrze", 53.1325, 23.1590),
  L("RZE09M", "Rzeszów", "al. Piłsudskiego 44", "35-001", "Galeria Rzeszów", 50.0366, 22.0045),
  L("TOR16N", "Toruń", "ul. Szeroka 20", "87-100", "Starówka", 53.0102, 18.6099),
];

function fold(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export interface LockerSearch {
  query?: string;
  near?: { lat: number; lng: number };
  limit?: number;
}

export function searchPaczkomaty({ query = "", near, limit = 12 }: LockerSearch): (Paczkomat & {
  distanceKm: number | null;
})[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const hits = PACZKOMATY.filter((p) => {
    const hay = fold(`${p.id} ${p.city} ${p.street} ${p.postalCode} ${p.description}`);
    return terms.every((t) => hay.includes(t));
  }).map((p) => ({ ...p, distanceKm: near ? distanceKm(near, p) : null }));

  if (near) hits.sort((a, b) => a.distanceKm! - b.distanceKm!);
  return hits.slice(0, limit);
}

export function findPaczkomat(id: string): Paczkomat | undefined {
  return PACZKOMATY.find((p) => p.id === id);
}
