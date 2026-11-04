// Story engine for the TE scenes. A story is four beats (setup, development, turn, ending) put together only from
// things te.js can draw: places, times of day, weather, what the figure does and what happens to them. Every
// choice is weighted by how well it fits the mood (valence x arousal), so one mood keeps telling new stories that
// still feel like it. No model: instant, offline, and every line has a picture.

export const MOOD_VA = {
  melancholic: [0.2, 0.2], calm: [0.5, 0.2], dreamy: [0.8, 0.2],
  mysterious: [0.2, 0.5], focused: [0.5, 0.5], happy: [0.8, 0.5],
  aggressive: [0.2, 0.8], tense: [0.5, 0.8], euphoric: [0.8, 0.8],
};

// the [valence, arousal] spots each thing belongs to
const L = 0.2, M = 0.5, H = 0.8;

export const PLACES = {
  lamp: { va: [[L, L], [L, M]], times: ['dusk', 'night'], acts: ['stand', 'smoke', 'umbrella', 'phone', 'coffee', 'wait', 'lookup'],
    events: ['lightsout', 'stranger', 'cat', 'rainstarts', 'call'], weather: ['rain', 'rain', 'fog', 'snow', 'none'], at: ['UNDER THE STREET LAMP', 'UNDER THE LAST LAMP'] },
  busstop: { va: [[L, L], [M, H], [M, M]], times: ['day', 'dusk', 'night'], acts: ['wait', 'umbrella', 'phone', 'smoke', 'read', 'stand', 'coffee'],
    events: ['bus', 'stranger', 'rainstarts', 'call'], weather: ['rain', 'none', 'snow'], at: ['AT THE BUS STOP'] },
  sea: { va: [[M, L], [L, L], [H, L]], times: ['day', 'dusk', 'night'], acts: ['sit', 'sitsmoke', 'stand', 'walk', 'lookup', 'coffee', 'read', 'guitar'],
    events: ['birds', 'shootingstar', 'stranger', 'dog'], weather: ['none', 'wind', 'fog'], at: ['BY THE SEA', 'ON THE PIER'] },
  field: { va: [[H, L], [M, L]], times: ['day', 'dusk', 'night'], acts: ['lie', 'balloon', 'lookup', 'stand', 'walk', 'guitar', 'sit'],
    events: ['balloonfly', 'shootingstar', 'birds', 'stranger', 'dog'], weather: ['stars', 'none', 'wind'], at: ['IN THE FIELD', 'ON THE HILL'] },
  alley: { va: [[L, M], [L, H]], times: ['night'], acts: ['stand', 'smoke', 'phone', 'walk', 'lookup', 'wait'],
    events: ['lightsout', 'cat', 'stranger', 'call'], weather: ['fog', 'rain', 'none'], at: ['IN THE BACK STREET', 'IN THE ALLEY'] },
  room: { va: [[M, M], [H, M], [L, L]], times: ['day', 'night'], acts: ['synth', 'phone', 'coffee', 'read', 'guitar', 'dance', 'stand'],
    events: ['call', 'cat', 'rainstarts'], weather: ['none'], at: ['AT HOME', 'IN THE STUDIO'] },
  street: { va: [[H, M], [L, H], [M, H]], times: ['day', 'dusk', 'night'], acts: ['walk', 'run', 'stand', 'dance', 'balloon', 'coffee', 'phone', 'jump'],
    events: ['bus', 'stranger', 'birds', 'rainstarts', 'lightning', 'dog'], weather: ['none', 'rain', 'storm', 'wind', 'snow'], at: ['IN THE CITY', 'ON THE BIG STREET'] },
  station: { va: [[M, H], [L, M]], times: ['day', 'dusk', 'night'], acts: ['wait', 'phone', 'smoke', 'read', 'coffee', 'stand'],
    events: ['train', 'stranger', 'call'], weather: ['none', 'snow'], at: ['ON THE PLATFORM', 'AT THE STATION'] },
  stage: { va: [[H, H], [H, M]], times: ['night'], acts: ['dance', 'jump', 'guitar', 'wave'],
    events: ['lightning', 'confettiburst'], weather: ['confetti', 'none'], at: ['ON STAGE'] },
  rooftop: { va: [[L, L], [H, L], [M, M]], times: ['dusk', 'night'], acts: ['stand', 'smoke', 'lookup', 'sit', 'guitar', 'coffee'],
    events: ['shootingstar', 'birds', 'stranger', 'lightning'], weather: ['none', 'stars', 'wind', 'rain'], at: ['ON THE ROOF'] },
  park: { va: [[H, M], [M, L], [H, L]], times: ['day', 'dusk'], acts: ['walk', 'sit', 'read', 'coffee', 'balloon', 'feed', 'stand'],
    events: ['birds', 'stranger', 'dog', 'rainstarts', 'balloonfly'], weather: ['none', 'wind', 'snow'], at: ['IN THE PARK'] },
  bridge: { va: [[L, L], [L, M], [M, L]], times: ['dusk', 'night'], acts: ['stand', 'walk', 'lookup', 'smoke', 'umbrella', 'phone'],
    events: ['stranger', 'lightsout', 'rainstarts', 'train'], weather: ['rain', 'fog', 'none', 'snow'], at: ['ON THE BRIDGE'] },
};

const TIMES = { day: [[H, M], [M, M], [H, L]], dusk: [[M, L], [L, L], [M, M]], night: [[L, L], [L, M], [H, L], [L, H], [H, H]] };

const WEATHER = {
  none: [[M, M], [H, M], [M, L]], rain: [[L, L], [L, M]], snow: [[M, L], [H, L]], fog: [[L, M], [L, L]], stars: [[H, L], [M, L]],
  storm: [[L, H], [M, H]], wind: [[M, M], [H, M]], confetti: [[H, H]],
};
const RAINY = new Set(['rain', 'storm', 'snow']);

export const ACTS = {
  stand: { va: [[M, M], [L, L]], say: ['STANDS THERE', 'STOPS FOR A MINUTE'] },
  smoke: { va: [[L, L], [L, M], [M, H]], say: ['SMOKES', 'LIGHTS A CIGARETTE', 'LIGHTS ONE MORE'] },
  sitsmoke: { va: [[L, L], [M, L]], say: ['SITS AND SMOKES'] },
  umbrella: { va: [[L, L], [M, L]], say: ['HIDES UNDER AN UMBRELLA', 'OPENS AN OLD UMBRELLA'], rainy: true },
  phone: { va: [[L, M], [M, H]], say: ['LOOKS AT THE PHONE', 'WAITS FOR A MESSAGE'] },
  coffee: { va: [[M, L], [M, M]], say: ['HOLDS A HOT COFFEE', 'DRINKS COFFEE'] },
  read: { va: [[M, L], [H, L]], say: ['READS A BOOK', 'READS'] },
  guitar: { va: [[H, L], [H, M], [M, L]], say: ['PLAYS GUITAR', 'PLAYS AN OLD SONG'] },
  sit: { va: [[M, L], [L, L], [H, L]], say: ['SITS', 'SITS ON A BENCH'] },
  lie: { va: [[H, L]], say: ['LIES IN THE GRASS'] },
  walk: { va: [[H, M], [M, M], [L, L]], say: ['WALKS', 'TAKES THE LONG WAY'] },
  run: { va: [[L, H], [M, H]], say: ['RUNS', 'RUNS AS FAST AS POSSIBLE'] },
  wait: { va: [[M, H], [L, M]], say: ['CHECKS THE TIME', 'WAITS'] },
  dance: { va: [[H, H], [H, M]], say: ['DANCES', 'CANNOT STOP DANCING'] },
  jump: { va: [[H, H]], say: ['JUMPS', 'JUMPS TO THE BEAT'] },
  synth: { va: [[M, M], [H, M]], say: ['BUILDS A BEAT', 'PLAYS A SYNTH'] },
  balloon: { va: [[H, L], [H, M]], say: ['HOLDS A BALLOON'] },
  feed: { va: [[H, L], [M, L]], say: ['FEEDS THE PIGEONS'] },
  lookup: { va: [[H, L], [L, L], [M, L]], say: ['LOOKS UP', 'LOOKS AT THE SKY'] },
  wave: { va: [[H, M], [H, H]], say: ['WAVES', 'WAVES AT SOMEONE'] },
};

// the turn: what happens, how the figure takes it, and the weather it may bring
export const EVENTS = {
  lightsout: { va: [[L, M], [L, L]], night: true, say: ['THE LIGHT GOES OUT', 'THE LAMP FLICKERS AND DIES'], react: ['lookup', 'stand', 'smoke'] },
  stranger: { va: [[M, M], [L, M], [H, M]], say: ['SOMEONE COMES CLOSER', 'A STRANGER STOPS NEXT TO {O}'], react: ['wave', 'stand', 'lookup'] },
  cat: { va: [[H, L], [M, L], [L, M]], say: ['A CAT SITS NEXT TO {O}', 'A BLACK CAT WALKS BY'], react: ['stand', 'lookup', 'sit'] },
  rainstarts: { va: [[L, L], [L, M]], say: ['THEN IT STARTS TO RAIN', 'THE FIRST DROPS FALL'], react: ['umbrella', 'run', 'stand', 'lookup'], weather: 'rain' },
  call: { va: [[L, M], [M, H]], say: ['THE PHONE RINGS', 'A CALL AT LAST'], react: ['phone'] },
  bus: { va: [[M, M], [L, L]], say: ['A BUS COMES', 'THE LAST BUS PASSES BY'], react: ['wave', 'walk', 'lookup'] },
  train: { va: [[M, H], [L, M]], say: ['THE TRAIN ARRIVES', 'A TRAIN RUSHES PAST'], react: ['walk', 'lookup', 'wave'] },
  birds: { va: [[H, M], [H, L], [M, L]], say: ['THE PIGEONS FLY UP', 'BIRDS EVERYWHERE'], react: ['lookup', 'jump', 'wave'] },
  shootingstar: { va: [[H, L], [L, L]], night: true, say: ['A STAR FALLS', 'ONE STAR FALLS'], react: ['lookup', 'wave'] },
  lightning: { va: [[L, H], [M, H], [H, H]], say: ['LIGHTNING', 'THE SKY CRACKS OPEN'], react: ['run', 'lookup', 'jump'], weather: 'storm' },
  balloonfly: { va: [[H, L], [L, L]], needs: 'balloon', say: ['THE BALLOON GETS AWAY', '{P} LETS IT GO'], react: ['lookup'] },
  dog: { va: [[H, M], [H, L]], say: ['A DOG RUNS UP', 'A DOG FINDS {O}'], react: ['stand', 'wave', 'jump'] },
  confettiburst: { va: [[H, H]], say: ['THE DROP HITS', 'EVERYONE GOES UP'], react: ['jump', 'dance'], weather: 'confetti' },
};

export const ENDINGS = {
  leave: { va: [[L, L], [M, M], [L, M]], act: 'walk', gone: true, say: ['{W} WALKS AWAY', 'AND {P} GOES HOME', '{P} DOES NOT LOOK BACK'] },
  stay: { va: [[M, L], [L, L], [H, L]], act: 'lookup', say: ['{P} STAYS A LITTLE LONGER', 'NOTHING ELSE HAPPENS'] },
  sitdown: { va: [[M, L]], act: 'sit', say: ['{P} SITS DOWN AND WAITS'] },
  together: { va: [[H, M], [M, M], [H, L]], act: 'walk', needs: ['stranger', 'dog'], together: true, gone: true,
    say: ['THEY WALK ON TOGETHER', 'THEY LEAVE TOGETHER'] },
  dance: { va: [[H, H], [H, M]], act: 'dance', say: ['{P} DANCES ANYWAY', 'AND {P} DANCES'] },
  runoff: { va: [[L, H], [M, H]], act: 'run', gone: true, say: ['{P} RUNS', 'NO TIME. {P} RUNS'] },
};

const WEATHER_SAY = {
  rain: ['THE RAIN DOES NOT STOP', 'IT RAINS HARDER'], snow: ['SNOW FALLS SLOWLY', 'EVERYTHING GOES WHITE'],
  fog: ['THE FOG COMES IN', 'THE END OF THE STREET IS GONE'], stars: ['THE SKY IS FULL OF STARS'], storm: ['THE STORM IS CLOSE'],
  wind: ['THE WIND PICKS UP'], confetti: ['CONFETTI IN THE AIR'], none: [],
};
const TIME_SAY = { day: ['A SLOW AFTERNOON', 'THE SUN IS OUT'], dusk: ['THE SUN GOES DOWN', 'THE SKY TURNS ORANGE'], night: ['IT IS LATE', 'THE CITY IS ASLEEP'] };
const NAMES = [['MAX', 'HE', 'HIM'], ['LEO', 'HE', 'HIM'], ['OLEG', 'HE', 'HIM'], ['TIM', 'HE', 'HIM'],
  ['ANNA', 'SHE', 'HER'], ['KIRA', 'SHE', 'HER'], ['MIA', 'SHE', 'HER'], ['ZOE', 'SHE', 'HER']];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
// how well something fits the mood: near one of its spots in the valence x arousal square
const fit = (va, v, a) => va.reduce((m, [pv, pa]) => Math.max(m, Math.exp(-((v - pv) ** 2 + (a - pa) ** 2) / 0.06)), 0) + 0.03;

function pickW(rnd, keys, weight) {
  const ws = keys.map(weight);
  let u = rnd() * ws.reduce((x, y) => x + y, 0);
  for (let i = 0; i < keys.length; i++) if ((u -= ws[i]) <= 0) return keys[i];
  return keys[keys.length - 1];
}

// One story for a mood. `avoid` is the last place, so the next story usually goes somewhere else.
export function makeStory(rnd, mood, avoid = null) {
  const [v, a] = MOOD_VA[mood] || MOOD_VA.focused;
  const place = pickW(rnd, Object.keys(PLACES), (k) => fit(PLACES[k].va, v, a) * (k === avoid ? 0.2 : 1));
  const P = PLACES[place];
  const time = pickW(rnd, P.times, (k) => fit(TIMES[k], v, a));
  const weather = pickW(rnd, P.weather.filter((w) => w !== 'stars' || time === 'night'), (k) => fit(WEATHER[k], v, a));
  const [who, he, him] = pick(rnd, NAMES);
  const fill = (s) => s.replace('{W}', who).replace('{P}', he).replace('{O}', him);
  const actW = (k) => fit(ACTS[k].va, v, a);
  const can = (wx) => (k) => !ACTS[k].rainy || RAINY.has(wx);

  const a1 = pickW(rnd, P.acts.filter(can(weather)), actW);
  const a2 = rnd() < 0.35 ? a1 : pickW(rnd, P.acts.filter((k) => k !== a1 && can(weather)(k)), actW);
  const events = P.events.filter((e) => (!EVENTS[e].night || time === 'night') && (!EVENTS[e].needs || [a1, a2].includes(EVENTS[e].needs))
    && EVENTS[e].weather !== weather);
  const ev = events.length ? pickW(rnd, events, (k) => fit(EVENTS[k].va, v, a)) : 'stranger';
  const E = EVENTS[ev], after = E.weather || weather;
  const a3 = pickW(rnd, E.react.filter(can(after)), actW);
  const endings = Object.keys(ENDINGS).filter((k) => !ENDINGS[k].needs || ENDINGS[k].needs.includes(ev));
  const end = pickW(rnd, endings, (k) => fit(ENDINGS[k].va, v, a) * (ENDINGS[k].together ? 3 : 1));
  const Z = ENDINGS[end];

  const develop = [...WEATHER_SAY[weather], ...TIME_SAY[time], a2 === a1 ? `${he} ${pick(rnd, ACTS[a2].say)} AGAIN` : `${he} ${pick(rnd, ACTS[a2].say)}`];
  return {
    mood, place, time, weather, who,
    lines: [`${who} ${pick(rnd, ACTS[a1].say)} ${pick(rnd, P.at)}`, pick(rnd, develop), fill(pick(rnd, E.say)), fill(pick(rnd, Z.say))],
    beats: [
      { act: a1, weather },
      { act: a2, weather },
      { act: a3, weather: after, event: ev },
      { act: Z.act, weather: after, gone: !!Z.gone, together: !!Z.together },
    ],
  };
}
