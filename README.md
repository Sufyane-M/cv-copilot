# CV Copilot

CV Copilot permette di scrivere e impaginare un curriculum direttamente su un foglio A4. L’utente sceglie un template, modifica testi e stile, confronta le proposte della chat e decide quali applicare. La cronologia conserva testi e impostazioni grafiche di ogni versione salvata.

È una tesina di Tecnologie Web e un’app **monoutente locale, senza login**. Quando apri un CV, la chat è a sinistra e il documento è a destra. Il pannello del documento contiene **Modifica**, **Anteprima PDF**, **Template**, **Personalizza**, **Salva** e **Scarica PDF**. Su mobile, **Chat** e **Documento** alternano i pannelli conservando lo stato. **I miei CV** apre l’archivio e **Cronologia** permette di consultare e ripristinare le versioni.

Il progetto è stato ricostruito per fasi in un repository indipendente. Usa un proprio ambiente Python, proprie dipendenze frontend e un database SQLite locale. La configurazione iniziale seleziona la modalità mock. [Roadmap e registro delle verifiche](docs/ROADMAP.md)

## Architettura e scelte

| Parte | Scelta e motivo |
| --- | --- |
| Interfaccia | React con JavaScript e CSS. Lo stato React conserva la bozza, la cronologia locale di **Annulla** e **Ripeti** e i messaggi in preparazione. Galleria e cronologia delle versioni usano il dialogo nativo. |
| Comunicazione | Fetch nativa, risposte JSON e PDF. Il browser chiama `/api` sullo stesso indirizzo da cui Vite serve l’interfaccia. In sviluppo e in anteprima della build, il proxy inoltra le richieste a Flask su `127.0.0.1:5001`. [Configurazione del proxy Vite](https://vite.dev/config/server-options#server-proxy) |
| Backend | Flask separa route HTTP, validazione e operazioni sui CV. |
| Persistenza | SQLite usa un file locale. Il modulo standard `sqlite3` rende visibili query parametrizzate, vincoli e transazioni. |
| Confronto | La libreria `diff` calcola le differenze testuali con `diffWordsWithSpace`. L’interfaccia usa barrature per le rimozioni, sottolineature per le aggiunte e offre la vista Prima/Dopo. |
| Revisione | Flask usa HTTPX per il catalogo e le richieste a OpenRouter. Il mock deterministico permette di usare la demo senza chiave né rete. |
| Documento e PDF | L’editor, le miniature e l’esportazione usano gli stessi `CvDocument.mjs` e `document.css`. Flask avvia un piccolo script Node.js che rende il componente in HTML e usa Playwright per la stampa A4 di Chromium. Il testo del PDF resta selezionabile. |

## Avvio

Servono Python **3.12 o 3.13** e Node.js **22.12 o successivo** con npm. La procedura di riferimento usa PowerShell e Python 3.13. Per il PDF, installa Chromium tramite Playwright dopo `npm ci`. Se Chromium di Playwright è assente, il renderer cerca Chrome o Edge di sistema.

L’ambiente `.venv`, le dipendenze npm, il file locale `backend/.env` e il database appartengono a questa cartella. Il comando per inizializzare `.env` copia il modello solo se il file è assente.

### Windows PowerShell

Avvia Flask nel primo terminale, dalla radice del progetto.

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
.\.venv\Scripts\python.exe -m flask --app backend.app init-db
.\.venv\Scripts\python.exe -m flask --app backend.app run --host 127.0.0.1 --port 5001
```

Avvia Vite nel secondo terminale, ancora dalla radice.

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd exec playwright install chromium
npm.cmd run dev
```

Apri [CV Copilot](http://127.0.0.1:5174). I due server devono restare attivi mentre usi l’app. Per controllare Flask direttamente, apri [GET /api/health](http://127.0.0.1:5001/api/health).

Per provare la build locale, ferma Vite nel secondo terminale ed esegui dalla cartella `frontend`.

```powershell
npm.cmd run build
npm.cmd run preview
```

Vite serve l’anteprima su `127.0.0.1:5174` e usa lo stesso proxy `/api` verso Flask su `127.0.0.1:5001`.

### Linux e macOS

Avvia Flask dalla radice con `python3` in versione 3.12 o 3.13.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
[ -f backend/.env ] || cp backend/.env.example backend/.env
.venv/bin/python -m flask --app backend.app init-db
.venv/bin/python -m flask --app backend.app run --host 127.0.0.1 --port 5001
```

Avvia Vite nel secondo terminale, ancora dalla radice.

```bash
cd frontend
npm ci
npm exec playwright install chromium
npm run dev
```

## Demo in modalità simulata

1. In **I miei CV**, seleziona **Prova con un esempio** per aprire il CV sintetico di `backend/example_cv.json`. **Crea un CV** parte da un documento vuoto. In seguito il browser ricorda l’ultimo documento aperto e ne verifica l’esistenza dopo il refresh.
2. Scrivi nel campo in basso nella chat oppure scegli un suggerimento. **Invio** spedisce la richiesta e **Maiusc+Invio** aggiunge una riga. La sezione iniziale è Profilo, se presente. Puoi cambiarla accanto al campo di scrittura e aprire **Annuncio di lavoro** per allegare un testo.
3. Leggi la motivazione e le differenze nella conversazione. **Accetta** salva una nuova versione e aggiorna il PDF. **Rifiuta** chiude la proposta. In entrambi i casi puoi riaprire i dettagli. L’etichetta **Demo · risposte simulate** indica che il mock applica regole di forma alla sezione invece di interpretare la domanda o l’annuncio.
4. Se il CV è vuoto, scegli **Aggiungi Profilo** sotto la chat, scrivi il testo direttamente sul foglio e premi **Salva**. La sezione salvata rende possibile l’invio della richiesta.

## Modificare il documento

1. Scegli **Modifica** e scrivi direttamente sul titolo, sul nome di una sezione o sul suo testo. **Aggiungi sezione** inserisce un nuovo riquadro. Il titolo della pagina fa parte della versione salvata. Il nome usato in **I miei CV** si rinomina dall’archivio.
2. Apri **Template** per sfogliare 24 varianti nelle famiglie Classic, Modern, Minimal, Sidebar, Editorial e Creative. Le anteprime usano il componente del documento. Se il CV è vuoto, la scelta inserisce nome, ruolo, contatti, esperienze, formazione e competenze dimostrativi. I template con foto aggiungono un ritratto sintetico. Se il CV è compilato, il cambio conserva i contenuti e applica il nuovo layout.
3. Seleziona un riquadro per vedere il contorno e le maniglie. Trascina le maniglie oppure imposta larghezza e altezza minima con **Stile riquadro**. Le frecce da tastiera agiscono sulla maniglia con focus. Il riquadro resta nella sua colonna e cresce in base al testo. Le frecce **Sposta su** e **Sposta giù** riordinano le sezioni nella colonna. Nei layout a due colonne puoi scegliere la colonna nel pannello di stile. **Ripristina riquadro** rimuove le impostazioni specifiche della sezione. **Elimina sezione** rimuove il riquadro dalla bozza.
4. Apri **Personalizza** per cambiare colori, font, spaziatura, margini, intestazione, separatori e colonne dove previste. **Ripristina stile del template** ricarica i valori iniziali del template e rimuove le personalizzazioni dei riquadri. **Zoom** adatta il foglio alla larghezza disponibile o lo mostra alla scala scelta.
5. **Annulla** e **Ripeti** riguardano la bozza locale. **Salva** invia il documento al server e crea una versione per una modifica effettiva. **Cronologia** permette di confrontare le versioni e **Ripristina** copia quella selezionata in una nuova versione. Se cambi CV o ricarichi la pagina mentre lavori, il browser ti chiede di confermare l’uscita.

Nella galleria **Con foto** raccoglie i layout con ritratto. Finché manca una foto personale, questi layout mostrano un ritratto etichettato **Foto demo** nell’editor e nel PDF. In **Modifica**, clicca sul ritratto oppure su **Carica la tua foto** o **Cambia foto**. Scegli un JPEG o PNG e passa a **Anteprima PDF** per controllare l’immagine. **Dati personali** permette di rimuovere il ritratto e mostra i campi di ruolo e contatto anche quando sono vuoti.

Seleziona una sezione e usa **Dettagli sezione** per aggiungere organizzazione o periodo quando sono vuoti. I dettagli già compilati si modificano direttamente sul foglio. Inizia una riga con `• ` o `- ` per renderla parte di un elenco. L’app salva contatti e foto nello snapshot locale e li esclude dalle richieste a OpenRouter.

Le composizioni prendono spunto dall’uso di intestazioni, colonne e ritratti nelle gallerie Canva. [Curriculum Canva](https://www.canva.com/resumes/templates/) · [Curriculum con foto](https://www.canva.com/resumes/templates/photo/)

<details>
<summary>Origine del ritratto dimostrativo</summary>

Il [ritratto di Elena Ricci](frontend/src/document/demo-portrait.jpg), personaggio fittizio, è stato generato con lo strumento ImageGen integrato. Il prompt è riportato qui per documentarne l’origine.

> One square professional profile portrait photo for a fictional Italian visual designer, Elena Ricci, in a sample CV. A woman around 28–33 years old with medium olive skin, a natural shoulder-length dark brown bob, and a black tailored jacket over a cream crewneck. Relaxed slight smile, looking at camera. Realistic editorial studio photography, large soft window light, plain warm beige background. Straight-on head and shoulders centered, with enough room above the hair and on both sides for circle and vertical arch crops. No text, logo, jewelry emphasis, decorative UI, or borders.

</details>

## Anteprima e download del PDF

**Anteprima PDF** stampa il documento che stai visualizzando. Se hai modifiche in corso, l’etichetta **Bozza non salvata** e il comando **Scarica bozza PDF** identificano il file temporaneo. Tornando a **Modifica** trovi la stessa bozza. **Versione salvata** identifica invece il PDF dello snapshot registrato in SQLite. Solo **Salva** registra la bozza come nuova versione.

Il frontend usa `POST /api/cvs/{id}/pdf/preview` con il contenuto temporaneo oppure `GET /api/cvs/{id}/pdf` per la versione salvata. Genera il PDF quando apri l’anteprima o premi **Aggiorna anteprima**. Se cambi il documento mentre la richiesta è in corso, l’interfaccia segnala che occorre aggiornare l’anteprima. Il download usa lo stesso `Blob` mostrato nel visualizzatore, con il suffisso `- bozza` quando pertinente. Nei browser privi di visualizzatore PDF integrato resta disponibile il download. [Rilevamento dell’anteprima PDF nel browser](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/pdfViewerEnabled)

`render_cv_pdf` passa lo snapshot a `frontend/render-pdf.mjs`. Lo script produce l’HTML da `CvDocument`, attende i font DejaVu e stampa in A4 con Chromium, anche offline. L’editor mantiene un foglio continuo a larghezza A4 con la stessa composizione. Le interruzioni effettive sono visibili in **Anteprima PDF**. La [guida](GUIDA_CODICE.md#il-percorso-del-pdf) spiega la differenza a livello di codice.

## Configurazione AI

La modalità predefinita è **mock**. Nella chat compare **Demo · risposte simulate**. La demo usa regole deterministiche e funziona offline. Per cambiare modalità, imposta `LLM_MODE` nel file `backend/.env` di questo progetto.

### Attivare OpenRouter

1. Apri il file locale `backend/.env` in un editor. Se manca, crealo copiando `backend/.env.example`. Modifica le impostazioni qui sotto mantenendo le altre righe che usi già.

   ```dotenv
   LLM_MODE=openrouter
   OPENROUTER_API_KEY=
   OPENROUTER_DEFAULT_MODEL=
   LLM_TIMEOUT=20
   LLM_MAX_TOKENS=1600
   ```

2. Incolla la tua chiave dopo `OPENROUTER_API_KEY=` nel file locale. `OPENROUTER_DEFAULT_MODEL` è facoltativo. Puoi lasciarlo vuoto oppure indicare un ID reale del catalogo. `LLM_TIMEOUT` è il timeout HTTP in secondi e `LLM_MAX_TOKENS` limita l’output. Le variabili d’ambiente del processo hanno precedenza. [Guida rapida OpenRouter](https://openrouter.ai/docs/quickstart)
3. Riavvia Flask dalla radice del progetto e ricarica [CV Copilot](http://127.0.0.1:5174).

   ```powershell
   .\.venv\Scripts\python.exe -m flask --app backend.app run --host 127.0.0.1 --port 5001
   ```

4. Apri un CV sintetico con almeno una sezione salvata. Scegli **Modello** nella testata **Revisione AI** della chat a sinistra. Su mobile apri **Chat**. Seleziona la sezione vicino al campo di scrittura e invia una richiesta. Il costo dipende dal modello scelto. [Catalogo OpenRouter](https://openrouter.ai/models)

La chiave resta in Flask. `/api/config` comunica al browser la modalità, la presenza della configurazione e i limiti dei campi. L’autenticazione viene verificata dal servizio esterno. Con OpenRouter selezionato e chiave assente, la chat indica come completare la configurazione. Gestione dei CV, editor, cronologia e PDF restano utilizzabili.

### Selezione e invio

Flask legge il catalogo ufficiale, mantiene in memoria per dieci minuti i modelli che dichiarano input e output testuali e supporto ai tool, e verifica l’ID al momento dell’invio. Il browser ricorda in `localStorage` l’ID dell’ultima scelta esplicita. Se è valido, ha precedenza. Alla prima apertura si usa il predefinito configurato, se presente e compatibile, oppure si chiede di scegliere. Se il modello salvato scompare dal catalogo, occorre sceglierne un altro prima di inviare. [Modelli e filtri del catalogo](https://openrouter.ai/docs/guides/overview/models)

Con **Invia**, React passa l’ID scelto a Flask insieme alla domanda. Il server fa una sola chiamata di generazione a OpenRouter fuori dalle transazioni SQLite. Invia il contenuto testuale del CV corrente, la sezione selezionata, l’annuncio facoltativo e fino a otto messaggi applicativi recenti. Con `tool_choice: auto` il modello può rispondere con un testo di chiarimento o fornire una proposta `propose_edit` con sezione, nuovo testo e motivazione. Flask valuta il risultato e salva la proposta in attesa di approvazione. `provider.require_parameters` limita la richiesta agli endpoint che supportano i parametri inviati. `provider.allow_fallbacks` è disattivato. [Tool calling di OpenRouter](https://openrouter.ai/docs/guides/features/tool-calling) · [Selezione del provider](https://openrouter.ai/docs/guides/routing/provider-selection)

Un modello compatibile può comunque essere indisponibile. La chat distingue configurazione assente, chiave non valida, credito insufficiente, limite di richieste, indisponibilità, timeout, problemi di rete e risposte o proposte non valide. Se fallisce il catalogo, puoi ricaricarlo. Se fallisce una generazione, la domanda resta nel campo. Puoi riprovare con lo stesso modello o sceglierne un altro. [Riferimento Chat Completions](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)

La validazione ammette fino a 16 sezioni, 100 caratteri per titolo, 2000 per testo di sezione, 1000 per domanda, 4000 per annuncio, 600 per motivazione e 2000 per il messaggio dell’assistente. Il prompt istruisce il modello a preservare i fatti del CV e a distinguere i requisiti dell’annuncio dalle informazioni del candidato.

## API

Base URL diretta `http://127.0.0.1:5001/api`. I body degli esempi usano `Content-Type: application/json`. Sostituisci gli identificativi e i numeri di versione con quelli del tuo CV.

| Metodo e percorso sotto `/api` | Richiesta o risposta |
| --- | --- |
| `GET /health` | `{"status":"ok"}` quando Flask risponde. |
| `GET /config` | `llm_mode`, `llm_configured` e limiti dei campi. |
| `GET /models` | `models` contiene coppie `id` e `name`. `default_model_id` è il predefinito compatibile oppure `null`. In modalità mock l’elenco è vuoto. |
| `GET /cvs` | Elenco dei CV. |
| `POST /cvs` | `{"title":"CV tirocinio","from_example":true}`. Con `false` oppure senza `from_example` il CV parte vuoto. Restituisce `201` alla creazione o `200` se riapre l’esempio esistente. |
| `GET /cvs/{id}` | Titolo, metadati, `version_number` e `content` corrente. |
| `GET /cvs/{id}/pdf` | Documento A4 corrente, `Content-Type: application/pdf`, generato in memoria. |
| `POST /cvs/{id}/pdf/preview` | `{"content":{"sections":[{"id":"profilo","type":"summary","title":"Profilo","text":"Bozza da controllare."}],"design":{"templateId":"sidebar-studio"}}}`. Valida e stampa la bozza in memoria, senza scrivere una versione. |
| `PATCH /cvs/{id}` | `{"title":"CV aggiornato"}`. Rinomina il CV nell’archivio. Il documento usa il nuovo nome come titolo in pagina quando `document_title` è assente. |
| `DELETE /cvs/{id}` | Elimina il CV e i dati collegati. Risposta `204` senza body. |
| `PUT /cvs/{id}/content` | `{"expected_version":1,"content":{"sections":[{"id":"profilo","type":"summary","title":"Profilo","text":"Studio informatica."}],"design":{"templateId":"sidebar-studio"}}}`. `design` e `document_title` sono facoltativi. |
| `GET /cvs/{id}/versions` | Elenco delle versioni in ordine decrescente. |
| `GET /cvs/{id}/versions/{number}` | Metadati e contenuto di uno snapshot. |
| `POST /cvs/{id}/versions/{number}/restore` | `{"expected_version":3}`. Il numero nel percorso indica la versione da copiare. |
| `GET /cvs/{id}/chat` | Versione corrente, messaggi con attribuzione del modello e proposte con testo di partenza e indicatore `obsolete`. |
| `POST /cvs/{id}/chat` | `{"message":"Rendi il testo più chiaro","section_id":"profilo","expected_version":2}`. In modalità OpenRouter aggiungi `model_id` con un ID restituito da `/models`. `job_posting` resta facoltativo. |
| `POST /cvs/{id}/proposals/{proposal_id}/accept` | Applica il nuovo testo della sezione e restituisce stato e numero di versione. |
| `POST /cvs/{id}/proposals/{proposal_id}/reject` | Registra il rifiuto e restituisce stato e versione corrente. |

Con Flask avviato, puoi provare creazione e lettura delle versioni da PowerShell.

```powershell
$body = @{ title = 'CV prova API'; from_example = $true } | ConvertTo-Json
$cv = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5001/api/cvs -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri "http://127.0.0.1:5001/api/cvs/$($cv.id)/versions"
```

Gli errori seguono il formato `{"error":{"code":"version_conflict","message":"Il CV è cambiato. Ricarica la versione corrente e riprova."}}`. `400` segnala campi o valori incompatibili, `404` una risorsa assente e `409` un conflitto. Tra i conflitti ci sono la versione superata, la proposta obsoleta e `proposal_already_resolved`. `402` indica credito insufficiente, `429` un limite di richieste, `502` un problema del provider e `504` un timeout. Un database temporaneamente occupato o una configurazione AI assente possono dare `503`. Un errore interno restituisce `500` con un messaggio generico.

## Dati e versionamento

| Tabella | Contenuto |
| --- | --- |
| `cv` | Identità, titolo e date di creazione e aggiornamento. |
| `cv_version` | CV, numero progressivo, snapshot JSON, origine, data ed eventuale numero ripristinato. |
| `message` | CV, ruolo, testo, data, versione di partenza, sezione e annuncio facoltativo. Sulle nuove risposte dell’assistente, modalità AI e ID del modello richiesto e di quello restituito, quando presenti. |
| `proposal` | Messaggio collegato, CV, sezione, versione di base, testo proposto, motivazione, stato e dati della risoluzione. |

Ogni proposta appartiene a uno specifico CV e a una sezione di una versione precisa. Il vincolo `UNIQUE (cv_id, number)` assicura una sola versione per numero e CV. Le chiavi esterne sono attive su ogni connessione. La cancellazione di un CV rimuove versioni, messaggi e proposte collegati.

La creazione produce v1. Salvataggio effettivo, accettazione e ripristino aggiungono uno snapshot completo. La versione corrente ha il numero più alto. `BEGIN IMMEDIATE` acquisisce la transazione di scrittura prima di verificare la versione e lo stato, così l’accettazione salva la versione e risolve la proposta insieme. Una proposta `pending` su una base superata viene mostrata come obsoleta. Il rifiuto chiude la proposta senza una nuova versione.

Nel JSON, `sections` contiene testi e identificativi stabili, `document_title` il titolo in pagina e `design` il template, i gruppi `colors`, `typography`, `page` e le modifiche `blocks` indicizzate per ID di sezione. Il backend verifica i limiti e salva i valori effettivi. Le versioni precedenti con sole `sections` usano il template Classic · Roma in visualizzazione. Il design usa la colonna JSON già presente in SQLite. L’accettazione sostituisce soltanto il testo della sezione autorizzata e salva lo snapshot con le stesse impostazioni grafiche.

Se il CV cambia mentre stai modificando una bozza, **Confronta e recupera** mostra le differenze con la nuova versione. Se hai modificato un’altra sezione, puoi recuperare insieme il testo manuale, la grafica e il testo approvato. Se la stessa sezione ha due testi diversi, scegli quale tenere. Il confronto conserva la bozza originale fino alla scelta. Se la versione salvata ha cambiato anche struttura o impostazioni, il confronto offre il recupero completo della bozza, oppure del solo stile se la bozza contiene esclusivamente modifiche grafiche. Dopo il recupero premi **Salva** per registrare la nuova versione. Il controllo della versione attesa continua a rispondere `409` se la base di una scrittura è superata.

Flask inizializza le tabelle mancanti all’avvio. Nell’archivio esistente aggiunge una sola volta le colonne di attribuzione a `message`. I messaggi precedenti mantengono i nuovi campi a `null` e una dicitura neutra nella chat. I messaggi simulati riportano **Demo**. CV, versioni, chat e proposte sono conservati in `backend/instance/cv_copilot.sqlite3` di questo progetto. Una nuova installazione parte da un database indipendente.

## Test e build

In PowerShell esegui questi comandi dalla radice.

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests
Set-Location frontend
npm.cmd test
npm.cmd run build
```

Su Linux e macOS esegui questi comandi dalla radice.

```bash
.venv/bin/python -m pytest backend/tests
cd frontend
npm test
npm run build
```

I test usano file SQLite temporanei. Un trasporto HTTP simulato verifica OpenRouter. Pytest controlla anche versioni, rollback, persistenza del design, font incorporati, testo su più pagine e generazione del PDF di bozza senza scritture. I test Node coprono Annulla e Ripeti, recupero di testo e stile dopo un aggiornamento, risposte PDF arrivate in ritardo e interazioni di editing. I test PDF e browser richiedono le dipendenze frontend e un Chromium disponibile come indicato in **Avvio**.

Su Windows sono passati **67 test pytest**, **13 test Node** e la build Vite. Le prove in Chrome desktop e mobile hanno coperto i 24 template, l’anteprima e il download del PDF di bozza e il recupero di testo e stile dopo un’accettazione AI. Il confronto del PDF lungo ha verificato 224 righe su sei pagine.

La prova di OpenRouter ha usato HTTPX MockTransport per catalogo, errore di credito HTTP 402, nuovo invio riuscito e attribuzione del modello nella chat. La prova con il servizio reale resta da eseguire con chiave e modello accessibile. La demo usa dati sintetici e può funzionare offline dopo l’installazione delle dipendenze. [Verifiche per fase](docs/ROADMAP.md)

## Limiti e uso dell’AI

I controlli di formato limitano quali campi una proposta può cambiare. Date, esperienze e competenze rimangono da verificare a cura dell’utente. In modalità OpenRouter, Flask invia il contesto al servizio esterno, compresi i testi delle sezioni, il titolo del documento e l’eventuale annuncio. Un uso pubblico o multiutente richiederebbe autenticazione, autorizzazioni per ogni risorsa e una gestione dei dati personali adeguata.

**Dichiarazione per la tesina.** OpenAI Codex ha condotto la ricostruzione per fasi seguendo i requisiti e lo stack indicati dall’utente. Ha riutilizzato parti dell’applicazione di riferimento, adattato il codice al nuovo repository, eseguito le verifiche e preparato documentazione e lucidi. I risultati descrivono le verifiche effettuate da Codex. Nell’app, un modello selezionato tramite OpenRouter può proporre modifiche testuali a una sezione. L’utente decide se applicarle. La modalità mock usa regole deterministiche e simula lo stesso percorso di approvazione.

Per preparare l’orale, la guida segue i flussi da React a SQLite e propone domande ed esercizi. La traccia descrive il percorso delle slide e la demo. [Guida al codice](GUIDA_CODICE.md) · [Traccia](docs/presentazione.md) · [Lucidi in PDF](docs/presentazione.pdf)
