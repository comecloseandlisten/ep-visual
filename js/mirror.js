// td.html: the picture alone, as the visualizer page draws it, for TouchDesigner's Web Render TOP. The page that
// listens sends its pixel grid to the server and /api/frames pushes it here, so this page needs no audio, no
// permissions and no clicks, and TouchDesigner gets the very picture the panel shows.
// ?paper=black (the default: TouchDesigner's effects work best as light over dark) or white, like the page.
const PAPERS = { black: '#000', white: '#fff' };
const paper = PAPERS[new URLSearchParams(location.search).get('paper')] || PAPERS.black;
document.body.style.background = paper;

const big = document.getElementById('c');
const ctx = big.getContext('2d');
const small = document.createElement('canvas');
const sctx = small.getContext('2d');
const stats = { frames: 0, n: 0, connected: false };

function clear() {
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, big.width, big.height);
}

// uint16 N (little-endian), 2 spare bytes, N*N RGBA cells; alpha 0 is bare paper
function show(buf) {
  const n = new DataView(buf).getUint16(0, true);
  if (!n || buf.byteLength !== 4 + n * n * 4) return;
  if (small.width !== n) small.width = small.height = n;
  sctx.putImageData(new ImageData(new Uint8ClampedArray(buf, 4), n, n), 0, 0);
  clear();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, big.width, big.height);
  stats.frames++;
  stats.n = n;
}

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/frames`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { stats.connected = true; };
  ws.onmessage = (e) => { if (e.data instanceof ArrayBuffer) show(e.data); };
  ws.onclose = () => {
    stats.connected = false;
    setTimeout(connect, 1000);
  };
}

clear();
connect();
window.epMirror = stats;
