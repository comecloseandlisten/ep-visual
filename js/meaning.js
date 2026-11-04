// What the track is about, and which pictures say the same. The mood (story.js MOOD_VA) places a track on valence x
// arousal; two tracks in one spot can still mean different things, a night drive and a riot. The server reads a
// track's THEMES off its title, album, tags and lyrics, or takes the agent's own reading of it (meaning.py,
// now_playing(feel=...)); here every world, palette and treatment says which themes it carries, and the mixer leans
// toward the ones the track is about, strongly: with a meaning a world that carries none of it is rare, never banned.
// Without a track (pads, the stand) nothing changes.

export const THEMES = ['night', 'lonely', 'love', 'rage', 'war', 'machine', 'void', 'occult', 'speed', 'rave', 'street', 'dream',
  'nature', 'paranoia', 'glory', 'play'];

// theme -> the worlds that carry it (mixer.js DEFS keys, every family); a world carries one to three. A new family can
// say it in its own defs instead, `themes: ['night', 'speed']` (registerFamily hands them here).
const WORLDS = {
  night: 'outrun rain blinds kaiju lightcycles waterfall agents swarm raid festival ninja trainwindow casino tougedrift warehouse '
    + 'pirateradio basement trainyard nightbus cantina hivecity rearwindow heroshooter saferoom story fogcity',
  lonely: 'checkpoint western rain blinds moonride antennas feed bust prison stream railcrossing rooftop bamboo classroom trainwindow '
    + 'recital freedive seatrain climb caveknight desertscarf metroidmap limbo nightbus twinsuns jetpack fellowship cavelake '
    + 'trenchline rearwindow seventhseal zone heartmonitor liminalpool glasspanes testchamber saferoom scriptorium brutalism cubism rothko story memorycard fogcity',
  love: 'disco metaballs benday haring deco rooftop transform festival idol classroom schoolband recital farm tattooflash elvenwood '
    + 'greenhills redroom butterflies heartmonitor feathersea tavernstage kandinsky rothko story',
  rage: 'corridor duel western ring kaiju horde raid prison rally inferno fire constructivist drips powerup mechabattle wallgiants '
    + 'spiraldrill explosionmage onepunch danmaku survivors trainyard punkshow zine cypher forestshow soundclash energyduel '
    + 'bridgeofshadow firemountain treeshepherds warpstorm scrapconvoy swarmtide orbitalfire trunkshot rainbattle rocketarena glitch fightstage',
  war: 'checkpoint corridor duel radar dogfight kaiju periscope dungeon horde rts barrier hexbattle raid jrpg arpg constructivist '
    + 'hangar ninja mechabattle wallgiants giantchess survivors trench energyduel walkers fleet holotable blastdoors beacons '
    + 'darktower siege mines charge hivecity ironclad trenchline swarmtide orbitalfire scrapconvoy warroom rainbattle payload '
    + 'controlpoint citadel defusal lanes engineernest bikejoust trebuchet mechbay railgun tacticsgrid',
  machine: 'radar lightcycles snake testcard waterfall antennas agents swarm feed rts copper dots constructivist hangar mechabattle '
    + 'transmutation metroidmap warehouse tracker scope modular lathe walkers holotable blastdoors throne hivecity ironclad '
    + 'godmachine tombworld warroom telepods breathingtv cyberheaven chromeorbs chrometunnel heartmonitor glasspanes modelviewer '
    + 'testchamber citadel researchlab engineernest brutalism destijl glitch molnar mechbay',
  void: 'arcade dogfight ufo moonride rocket antennas studio swarm cape tunnel starfield dots lens suprematist freedive skymages '
    + 'shipcrew scope hyperspace fleet twinsuns cathedralship warpstorm tombworld orbitalfire monolith stargate moonface '
    + 'cyberheaven fractal',
  occult: 'corridor haunted dungeon ritual tarot spiral pyramid horde arpg inferno fire transmutation caveknight cardbattle limbo '
    + 'survivors tattooflash throne darktower bridgeofshadow cavelake mines firemountain cathedralship warpstorm godmachine inquest '
    + 'tombworld darkshrine hallway breathingtv redroom seventhseal researchlab mansion',
  speed: 'outrun dogfight lightcycles skate boulder crossing tunnel voxel starfield ninja tougedrift danmaku skatespot dirtjumps '
    + 'hyperspace trench jetpack podrace charge scrapconvoy stargate chrometunnel heroshooter rocketarena racer railgun snowslope fogcity',
  rave: 'aerobics arena blockparty disco rhythm plasma tunnel rotozoom copper twister bobs haring drips idol warehouse soundsystem '
    + 'turntables pirateradio freeparty basement punkshow forestshow soundclash castlerave tavernstage fractal riley',
  street: 'rain skate blockparty prison screenprint haring schoolband soundsystem turntables pirateradio freeparty crates tapedeck '
    + 'trainyard wallofhame skatespot punkshow zine stickerpost cypher dirtjumps tattooflash nightbus soundclash trunkshot lowrider '
    + 'courtyardskate',
  dream: 'outrun aerobics moonride tarot spiral bust plasma voxel metaballs bobs lens kusama suprematist miro mobile bulge '
    + 'railcrossing rooftop classroom trainwindow mushiforest skymages seatrain rotatecube crates tapedeck twinsuns elvenwood '
    + 'monolith stargate redroom zone moonface cyberheaven chromeorbs aerogloss butterflies halo liminalpool crystaltemple '
    + 'feathersea scriptorium fractal morpho flow rothko story platformer3d worldmap memorycard discmenu',
  nature: 'ufo periscope chemtrails bigfoot barrier adventure voxel miro cutouts bamboo mushiforest freedive seatrain climb farm '
    + 'desertscarf freeparty dirtjumps forestshow fellowship elvenwood greenhills treeshepherds birdsonwires zone rainbattle '
    + 'aerogloss feathersea morpho flow worldmap snowslope',
  paranoia: 'checkpoint radar ufo periscope haunted blinds spiral testcard waterfall antennas pyramid strings chemtrails flatearth '
    + 'studio agents bigfoot feed barrier motorcade rally kusama bulge wallgiants giantchess dodgebox limbo blastdoors darktower '
    + 'cavelake inquest swarmtide hallway warroom telepods breathingtv trunkshot rearwindow birdsonwires testchamber citadel '
    + 'researchlab defusal saferoom peasantphones glitch riley mansion',
  glory: 'duel western arena rocket chart cape adventure jrpg screenprint deco transform powerup spiraldrill skymages onepunch climb '
    + 'desertscarf energyduel fleet throne fellowship beacons siege charge cathedralship godmachine halo crystaltemple bikeknight worldmap',
  play: 'arcade platformer pong ring aerobics skate blockparty snake crossing rhythm flatearth chart jrpg stream rotozoom twister '
    + 'benday memphis miro cutouts idol festival casino schoolband explosionmage onepunch danmaku farm dodgebox rotatecube shipcrew '
    + 'cardbattle wallofhame cantina payload lanes heroshooter bikeknight gasstation bikejoust pizzaknight trebuchet dragonbbq '
    + 'castlerave tavernstage lowrider peasantphones courtyardskate kandinsky truchet racer platformer3d fightstage discmenu',
};

// theme -> the palettes (mixer.js PALETTES) and the treatments (mixer.js TREATMENTS) that carry it
const PALS = {
  night: 'neon midnight noir bangkok haze tungsten velvet amber',
  lonely: 'midnight noir silver sepia ice inkwash tape deco',
  love: 'candy pearl velvet pastel latte gold vapor riso',
  rage: 'hell machine toxic crypt occult broadcast warband thermal',
  war: 'military grimdark warband crypt hell royal tabloid',
  machine: 'machine phosphor amber bureau blueprint chrome thermal c64',
  void: 'midnight crystal hologram neon ice oceanic amiga',
  occult: 'occult crypt cult hell grimdark templegold',
  speed: 'neon cga zx thermal broadcast cinema',
  rave: 'neon gold toxic cga zx nineties bangkok velvet amiga',
  street: 'tabloid popprint benday riso tape nineties espresso',
  dream: 'vapor pearl pastel chrome aero hologram haze latte',
  nature: 'swamp parchment oceanic gameboy latte riso felt',
  paranoia: 'thermal phosphor tabloid machine broadcast bureau silver',
  glory: 'royal gold templegold cinema crystal bauhaus deco',
  play: 'candy gameboy popprint benday pastel nineties cga felt zx',
};
const FXS = {
  night: 'film vhs none', lonely: 'film vhs none', love: 'none mirror', rage: 'manga subliminal cards', war: 'hud frame film',
  machine: 'hud code crt', void: 'none crt kaleido', occult: 'subliminal mirror film', speed: 'manga crt', rave: 'kaleido cards crt',
  street: 'vhs crt cards', dream: 'vhs mirror kaleido', nature: 'none film', paranoia: 'quad hud subliminal code', glory: 'film none',
  play: 'frame crt cards',
};

const invert = (table) => {
  const out = {};
  for (const [theme, keys] of Object.entries(table)) for (const k of keys.split(/\s+/).filter(Boolean)) (out[k] ||= []).push(theme);
  return out;
};
export const WORLD_THEMES = invert(WORLDS), PAL_THEMES = invert(PALS), FX_THEMES = invert(FXS);
export function addThemes(world, themes) {
  WORLD_THEMES[world] = [...new Set([...(WORLD_THEMES[world] || []), ...themes.filter((t) => THEMES.includes(t))])];
}

// the track's themes, {theme: weight} summing to one, or null
let current = null, currentKey = '';
export const meaning = () => current;
export const meaningKey = () => currentKey; // '' without a meaning
// returns whether the meaning changed (a new reading wants a new picture)
export function setMeaning(themes) {
  const clean = themes && Object.fromEntries(Object.entries(themes).filter(([t, w]) => THEMES.includes(t) && w > 0));
  const next = clean && Object.keys(clean).length ? clean : null;
  const key = next ? Object.entries(next).sort().map(([t, w]) => `${t}${w}`).join() : '';
  if (key === currentKey) return false;
  current = next;
  currentKey = key;
  return true;
}

// how much of the track's meaning something carries, 0..1 (1: everything the track is about)
const share = (tags, k) => (current ? (tags[k] || []).reduce((s, t) => s + (current[t] || 0), 0) : 0);
// the weight the mixer multiplies by: 1 without a meaning; with one, from 0.15 (carries none of it) to about 3, and
// 0.6 for one nobody has said anything about yet (a world just added)
const lean = (tags, k) => (!current ? 1 : !tags[k] ? 0.6 : 0.15 + 3 * Math.min(1, share(tags, k)));
export const worldMeaning = (k) => lean(WORLD_THEMES, k);
export const palMeaning = (k) => lean(PAL_THEMES, k);
export const fxMeaning = (k) => lean(FX_THEMES, k);
export const worldShare = (k) => share(WORLD_THEMES, k);
