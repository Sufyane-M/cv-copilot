# CV Copilot

Tesina di Tecnologie Web per scrivere, revisionare e impaginare un CV in locale. Flask e SQLite gestiscono dati e versioni. React, Vite e Fetch forniscono l’interfaccia. OpenRouter e Chromium entrano nelle fasi dedicate alla revisione e al PDF.

Questa è una ricostruzione assistita da Codex a partire da un progetto di riferimento. Codex implementa gli incrementi, riusa componenti verificati quando appropriato e registra le verifiche effettivamente svolte. I dati usati per lo sviluppo sono sintetici.

Lo sviluppo usa Flask sulla porta 5001 e Vite sulla 5174. Il nuovo ambiente e il nuovo database saranno creati in questa cartella. La configurazione di esempio seleziona la modalità mock.

[Roadmap e registro delle verifiche](docs/ROADMAP.md)

## Avvio del backend

Dalla radice del progetto, in PowerShell.

    py -3.13 -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
    .\.venv\Scripts\python.exe -m flask --app backend.app run --host 127.0.0.1 --port 5001

Il controllo di avvio è disponibile in `GET /api/health`. Il repository locale segue `main` su GitHub.

## Avvio dell’interfaccia

Dal secondo terminale entra in frontend, esegui npm ci e npm run dev. Apri http://127.0.0.1:5174. Il proxy indirizza /api a Flask sulla porta 5001.
