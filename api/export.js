const axios = require('axios');

const SOUNDCLOUD_BASE_URL = 'https://api-v2.soundcloud.com';
const SOUNDCLOUD_HOME_URL = 'https://soundcloud.com';
const PAGE_LIMIT = 200;
const TRACK_CHUNK_SIZE = 50;

function sendJson(response, statusCode, payload) {
    response.statusCode = statusCode;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify(payload));
}

function isValidSoundCloudUrl(profileUrl) {
    try {
        const url = new URL(profileUrl);
        return ['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname.toLowerCase());
    } catch {
        return false;
    }
}

async function readRequestBody(request) {
    if (request.body) {
        return typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    }

    const chunks = [];

    for await (const chunk of request) {
        chunks.push(chunk);
    }

    if (chunks.length === 0) {
        return {};
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Dynamically scrape the SoundCloud client ID from the current website assets.
async function getClientId() {
    const { data } = await axios.get(SOUNDCLOUD_HOME_URL);
    const scriptUrls = [...data.matchAll(/<script crossorigin src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+)"/g)].map(
        match => match[1]
    );

    for (const url of scriptUrls) {
        const { data: scriptData } = await axios.get(url);
        const match = scriptData.match(/client_id:"([a-zA-Z0-9]{32})"/);

        if (match) {
            return match[1];
        }
    }

    throw new Error('Konnte Client-ID nicht finden. SoundCloud hat evtl. die Seite geändert.');
}

async function fetchAll(baseUrl, clientId) {
    const results = [];
    let nextHref = `${baseUrl}&client_id=${clientId}&limit=${PAGE_LIMIT}`;

    while (nextHref) {
        const { data } = await axios.get(nextHref);
        results.push(...(data.collection || []));
        nextHref = data.next_href ? `${data.next_href}&client_id=${clientId}` : null;
    }

    return results;
}

async function fetchFullTracks(trackIds, clientId) {
    const allTracks = [];

    for (let i = 0; i < trackIds.length; i += TRACK_CHUNK_SIZE) {
        const chunk = trackIds.slice(i, i + TRACK_CHUNK_SIZE);
        const idsString = chunk.join('%2C');
        const { data } = await axios.get(`${SOUNDCLOUD_BASE_URL}/tracks?ids=${idsString}&client_id=${clientId}`);
        allTracks.push(...data);
    }

    const trackMap = new Map(allTracks.map(track => [track.id, track]));
    return trackIds.map(id => trackMap.get(id)).filter(Boolean);
}

function formatTrack(track) {
    if (!track?.title || !track?.user?.username) {
        return null;
    }

    return track.title.includes(' - ') ? track.title : `${track.user.username} - ${track.title}`;
}

async function buildExportText(profileUrl) {
    const clientId = await getClientId();
    const resolveUrl = `${SOUNDCLOUD_BASE_URL}/resolve?url=${encodeURIComponent(profileUrl)}&client_id=${clientId}`;
    const { data: user } = await axios.get(resolveUrl);
    const userId = user.id;
    const userName = user.username;

    const [followsData, likesData, playlistsData] = await Promise.all([
        fetchAll(`${SOUNDCLOUD_BASE_URL}/users/${userId}/followings?`, clientId),
        fetchAll(`${SOUNDCLOUD_BASE_URL}/users/${userId}/track_likes?`, clientId),
        fetchAll(`${SOUNDCLOUD_BASE_URL}/users/${userId}/playlists_without_albums?`, clientId)
    ]);

    const lines = [`Soundcloud profile name: ${userName}`, '', 'Follows:'];

    for (const follow of followsData) {
        if (follow.username) {
            lines.push(follow.username);
        }
    }

    lines.push('', 'Liked Tracks:');

    for (const like of likesData) {
        const trackName = formatTrack(like.track);

        if (trackName) {
            lines.push(trackName);
        }
    }

    for (const playlist of playlistsData) {
        lines.push('', `Playlist ${playlist.title}`);

        if (playlist.tracks?.length > 0) {
            const trackIds = playlist.tracks.map(track => track.id).filter(Boolean);
            const fullTracks = await fetchFullTracks(trackIds, clientId);

            for (const track of fullTracks) {
                const trackName = formatTrack(track);

                if (trackName) {
                    lines.push(trackName);
                }
            }
        }
    }

    return {
        text: `${lines.join('\n')}\n`,
        fileName: `${userName}_SC.txt`
    };
}

module.exports = async function handler(request, response) {
    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return sendJson(response, 405, { error: 'Nur POST-Anfragen sind erlaubt.' });
    }

    try {
        const { profileUrl } = await readRequestBody(request);

        if (!profileUrl || !isValidSoundCloudUrl(profileUrl)) {
            return sendJson(response, 400, { error: 'Bitte eine gültige SoundCloud-URL eingeben.' });
        }

        const exportResult = await buildExportText(profileUrl);
        return sendJson(response, 200, { success: true, ...exportResult });
    } catch (error) {
        console.error(error);
        return sendJson(response, 500, { error: 'Ein Fehler ist aufgetreten. Überprüfe die Logs.' });
    }
};
