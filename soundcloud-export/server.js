const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Funktion: Dynamisch die Client-ID von der SC-Website scrapen
async function getClientId() {
    try {
        const { data } = await axios.get('https://soundcloud.com');
        const scriptUrls = [...data.matchAll(/<script crossorigin src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+)"/g)].map(m => m[1]);
        
        for (let url of scriptUrls) {
            const { data: scriptData } = await axios.get(url);
            const match = scriptData.match(/client_id:"([a-zA-Z0-9]{32})"/);
            if (match) {
                return match[1];
            }
        }
    } catch (error) {
        console.error('Fehler beim Extrahieren der Client-ID:', error.message);
    }
    throw new Error('Konnte Client-ID nicht finden. Soundcloud hat evtl. die Seite geändert.');
}

// Hilfsfunktion: Alle Seiten einer API-Response abrufen (Pagination)
async function fetchAll(baseUrl, clientId) {
    let results = [];
    let nextHref = `${baseUrl}&client_id=${clientId}&limit=200`;
    
    while (nextHref) {
        try {
            const { data } = await axios.get(nextHref);
            results = results.concat(data.collection);
            nextHref = data.next_href ? `${data.next_href}&client_id=${clientId}` : null;
        } catch (error) {
            console.error('Fehler beim Paginieren:', error.message);
            break;
        }
    }
    return results;
}

// NEUE Hilfsfunktion: Volle Track-Daten anhand von IDs laden (in 50er Chunks)
async function fetchFullTracks(trackIds, clientId) {
    const chunkSize = 50;
    let allTracks = [];
    
    for (let i = 0; i < trackIds.length; i += chunkSize) {
        const chunk = trackIds.slice(i, i + chunkSize);
        const idsString = chunk.join('%2C'); // URL-encoded Komma
        
        try {
            const { data } = await axios.get(`https://api-v2.soundcloud.com/tracks?ids=${idsString}&client_id=${clientId}`);
            allTracks = allTracks.concat(data);
        } catch (err) {
            console.error('Fehler beim Auflösen der Track-IDs:', err.message);
        }
    }
    
    // Tracks wieder in die originale Reihenfolge der Playlist bringen
    const trackMap = {};
    allTracks.forEach(t => trackMap[t.id] = t);
    
    return trackIds.map(id => trackMap[id]).filter(t => t !== undefined);
}

app.post('/api/export', async (req, res) => {
    const { profileUrl } = req.body;

    if (!profileUrl || !profileUrl.includes('soundcloud.com')) {
        return res.status(400).json({ error: 'Bitte eine gültige Soundcloud-URL eingeben.' });
    }

    try {
        const clientId = await getClientId();
        console.log(`Client-ID gefunden: ${clientId}`);

        // 1. User auflösen
        const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(profileUrl)}&client_id=${clientId}`;
        const { data: user } = await axios.get(resolveUrl);
        const userId = user.id;
        const userName = user.username;

        console.log(`Sammle Daten für User: ${userName} (${userId})...`);
        
        const followsData = await fetchAll(`https://api-v2.soundcloud.com/users/${userId}/followings?`, clientId);
        const likesData = await fetchAll(`https://api-v2.soundcloud.com/users/${userId}/track_likes?`, clientId);
        const playlistsData = await fetchAll(`https://api-v2.soundcloud.com/users/${userId}/playlists_without_albums?`, clientId);

        let outputText = `Soundcloud profile name: ${userName}\n\n`;

        // Follows
        outputText += `Follows:\n`;
        followsData.forEach(follow => {
            outputText += `${follow.username}\n`;
        });

        // Liked Tracks
        outputText += `\nLiked Tracks:\n`;
        likesData.forEach(like => {
            if (like.track && like.track.title) {
                const trackName = like.track.title.includes(' - ') 
                    ? like.track.title 
                    : `${like.track.user.username} - ${like.track.title}`;
                outputText += `${trackName}\n`;
            }
        });

        // Playlists (HIER WURDE ANGEPASST)
        for (const playlist of playlistsData) {
            outputText += `\nPlaylist ${playlist.title}\n`;
            
            if (playlist.tracks && playlist.tracks.length > 0) {
                // Alle IDs aus der Playlist extrahieren
                const trackIds = playlist.tracks.map(t => t.id);
                
                // Volle Daten für alle Tracks holen
                const fullTracks = await fetchFullTracks(trackIds, clientId);
                
                fullTracks.forEach(track => {
                    if (track && track.title && track.user) {
                        const trackName = track.title.includes(' - ') 
                            ? track.title 
                            : `${track.user.username} - ${track.title}`;
                        outputText += `${trackName}\n`;
                    }
                });
            }
        }

        res.json({ success: true, text: outputText, fileName: `${userName}_SC.txt` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ein Fehler ist aufgetreten. Überprüfe die Logs.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});