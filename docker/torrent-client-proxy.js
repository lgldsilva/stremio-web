const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const TORRENT_CLIENT_URL = process.env.TORRENT_CLIENT_URL || '';
const TORRENT_CLIENT_TYPE = (process.env.TORRENT_CLIENT_TYPE || 'transmission').toLowerCase();
const TORRENT_CLIENT_DOWNLOAD_DIR = process.env.TORRENT_CLIENT_DOWNLOAD_DIR || '';
const TORRENT_PROXY_PORT = parseInt(process.env.TORRENT_PROXY_PORT || '7700', 10);

let transmissionSessionId = '';

function makeRequest(urlStr, options, body) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(urlStr);
        const mod = parsed.protocol === 'https:' ? https : http;
        const opts = {
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            ...options,
        };
        const req = mod.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// --- Transmission adapter ---

async function transmissionRpc(method, args) {
    const headers = {
        'Content-Type': 'application/json',
        'X-Transmission-Session-Id': transmissionSessionId,
    };
    const body = JSON.stringify({ method, arguments: args });

    let res = await makeRequest(TORRENT_CLIENT_URL, { method: 'POST', headers }, body);

    if (res.status === 409) {
        transmissionSessionId = res.headers['x-transmission-session-id'] || '';
        headers['X-Transmission-Session-Id'] = transmissionSessionId;
        res = await makeRequest(TORRENT_CLIENT_URL, { method: 'POST', headers }, body);
    }

    return JSON.parse(res.body);
}

async function addTorrentTransmission(magnet, downloadDir) {
    const args = { filename: magnet };
    if (downloadDir) args['download-dir'] = downloadDir;
    return transmissionRpc('torrent-add', args);
}

// --- Generic dispatch ---

async function addTorrent(magnet, downloadDir) {
    switch (TORRENT_CLIENT_TYPE) {
        case 'transmission':
            return addTorrentTransmission(magnet, downloadDir);
        default:
            throw new Error(`Unsupported torrent client type: ${TORRENT_CLIENT_TYPE}`);
    }
}

// --- Subtitle download helper ---

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const mod = parsed.protocol === 'https:' ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'stremio-torrent-proxy' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function downloadSubtitle(subtitleUrl, destDir, baseName) {
    const ext = path.extname(new URL(subtitleUrl).pathname) || '.srt';
    const fileName = baseName.replace(/\.[^.]+$/, '') + ext;
    const destPath = path.join(destDir, fileName);

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const data = await fetchUrl(subtitleUrl);
    fs.writeFileSync(destPath, data);
    return fileName;
}

// --- HTTP helpers ---

function readBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => resolve(body));
    });
}

function sendJson(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}

// --- Server ---

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        return res.end();
    }

    try {
        if (req.url === '/config' && req.method === 'GET') {
            sendJson(res, 200, {
                enabled: !!TORRENT_CLIENT_URL,
                clientType: TORRENT_CLIENT_TYPE,
                downloadDir: TORRENT_CLIENT_DOWNLOAD_DIR || null,
            });
        } else if (req.url === '/add' && req.method === 'POST') {
            if (!TORRENT_CLIENT_URL) {
                return sendJson(res, 503, { error: 'Torrent client not configured' });
            }

            const body = JSON.parse(await readBody(req));
            const { magnet, subtitleUrl, subtitleName } = body;

            if (!magnet) {
                return sendJson(res, 400, { error: 'magnet is required' });
            }

            let downloadDir = body.downloadDir || TORRENT_CLIENT_DOWNLOAD_DIR || '';
            if (body.downloadSubfolder && downloadDir) {
                downloadDir = path.join(downloadDir, body.downloadSubfolder);
            }
            const result = await addTorrent(magnet, downloadDir);

            // Save subtitle alongside if provided and download dir is accessible
            let subtitleFile = null;
            if (subtitleUrl && downloadDir) {
                try {
                    const baseName = subtitleName || 'subtitle.srt';
                    subtitleFile = await downloadSubtitle(subtitleUrl, downloadDir, baseName);
                } catch (e) {
                    subtitleFile = null;
                    console.error('Subtitle download failed:', e.message);
                }
            }

            sendJson(res, 200, { ...result, subtitleFile });
        } else {
            sendJson(res, 404, { error: 'Not found' });
        }
    } catch (e) {
        console.error('Torrent proxy error:', e.message);
        sendJson(res, 500, { error: e.message });
    }
});

server.listen(TORRENT_PROXY_PORT, '127.0.0.1', () => {
    console.log(`Torrent client proxy on 127.0.0.1:${TORRENT_PROXY_PORT} [${TORRENT_CLIENT_URL ? 'active' : 'disabled'}] type=${TORRENT_CLIENT_TYPE}`);
});
