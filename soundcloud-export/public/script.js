document.getElementById('exportBtn').addEventListener('click', async () => {
    const profileUrl = document.getElementById('profileUrl').value;
    const statusDiv = document.getElementById('status');
    const btn = document.getElementById('exportBtn');

    if (!profileUrl) {
        statusDiv.innerText = "Bitte gib eine URL ein!";
        statusDiv.style.color = "#ff4444";
        return;
    }

    statusDiv.innerText = "Lade Daten... Das kann bei großen Profilen einen Moment dauern.";
    statusDiv.style.color = "#ccc";
    btn.disabled = true;

    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileUrl })
        });

        const data = await response.json();

        if (data.success) {
            // Blob erstellen und als .txt herunterladen
            const blob = new Blob([data.text], { type: 'text/plain' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = data.fileName;
            link.click();
            URL.revokeObjectURL(link.href);
            
            statusDiv.innerText = "Erfolgreich heruntergeladen!";
            statusDiv.style.color = "#44ff44";
        } else {
            statusDiv.innerText = data.error || "Es gab ein Problem.";
            statusDiv.style.color = "#ff4444";
        }
    } catch (error) {
        statusDiv.innerText = "Netzwerkfehler.";
        statusDiv.style.color = "#ff4444";
    } finally {
        btn.disabled = false;
    }
});