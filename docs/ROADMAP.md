# Roadmap della ricostruzione

Il riferimento è stato letto in sola lettura. Gli incrementi documentano il riuso puntuale di moduli già verificati e le modifiche necessarie al nuovo progetto.

## Inventario verificato

- Archivio CRUD, sezioni con ID stabili, cronologia, ripristino ed errori di versione.
- Chat persistente in modalità mock oppure OpenRouter, catalogo, selezione del modello, proposte e approvazione atomica.
- Documento condiviso, 24 template in sei famiglie, profilo e ritratto, editing inline, personalizzazione, riquadri, Undo/Redo.
- PDF salvato e PDF di bozza senza scritture. Le interruzioni effettive sono calcolate da Chromium. La superficie editabile A4 è continua.
- Recupero di testo manuale e design dopo l’accettazione AI. Se cambia la stessa sezione l’utente sceglie quale testo tenere.

## Fasi

- [x] 01 Fondamenta
- [x] 02 Backend essenziale
- [x] 03 Persistenza
- [x] 04 API dei curriculum
- [x] 05 Frontend iniziale
- [x] 06 Sezioni e modifica manuale
- [x] 07 Versionamento
- [x] 08 Chat in modalità simulata
- [x] 09 Proposte e approvazione
- [x] 10 OpenRouter
- [x] 11 Scelta del modello
- [x] 12 Documento e PDF
- [x] 13 Presentazione negli snapshot
- [ ] 14 Famiglie e galleria dei template
- [ ] 15 Editing direttamente sul documento
- [ ] 16 Personalizzazione e riquadri
- [ ] 17 Bozza e Undo/Redo
- [ ] 18 Coordinamento fra editor e AI
- [ ] 19 Completamento dell’interfaccia
- [ ] 20 Verifica finale e documentazione

## Registro

- **01 Fondamenta** — Cartella separata, branch main, esclusioni, configurazione mock e piano. Verificati identità Git, contenuto iniziale indicizzato e porte locali 5001 e 5174. Prossima fase: avvio Flask e risposte JSON.
- **02** — Factory Flask, controllo /api/health e risposte JSON. Riutilizzati i gestori HTTP del riferimento. Verifica: Due test su avvio, 404 JSON e protezione Origin. Prossimo passo: SQLite, schema e dati sintetici.
- **03** — Schema per CV e snapshot con SQLite indipendente. Riusati connessione, transazioni e fixture sintetica del riferimento. Verifica: Inizializzazione reale nel nuovo progetto, chiavi esterne, idempotenza e rollback. Prossimo passo: Operazioni dell’archivio e validazione.
- **04** — CRUD con archivio persistente, versione iniziale e esempio idempotente. Riusate le query e i limiti del riferimento. Verifica: Creazione, riavvio, rinomina, cancellazione, input e ID invalidi. Prossimo passo: Archivio React e proxy Vite.
- **05** — Archivio React con Fetch, creazione, apertura, rinomina e cancellazione. Riusati la vista archivio e i controlli condivisi. Verifica: Build Vite e creazione/riapertura in Chrome attraverso le porte 5174 e 5001. Prossimo passo: Modifica e ordinamento delle sezioni.
- **06** — Editor delle sezioni con ID stabili, riordino e salvataggio atomico. Riusati il controllo di versione e il salvataggio del riferimento. Verifica: sette test backend, build Vite e modifica, riordino e rimozione in Chrome con database temporaneo. Prossimo passo: cronologia e ripristino.
- **07** — Cronologia confrontabile e ripristino con nuova versione. Riusati il dialogo e il servizio degli snapshot. Verifica: nove test backend, inclusi conflitti e immutabilità, build Vite e confronto e ripristino in Chrome con database temporaneo. Prossimo passo: chat in modalità simulata.
- **08** — Chat simulata persistente con selezione della sezione e annuncio facoltativo. Verifica: Test Flask di invio, persistenza e annuncio senza rete. Build Vite. Prossimo passo: Proposte strutturate e approvazione.
- **09** — Proposte con motivazione, confronto, approvazione e rifiuto. Riusata la transazione di accettazione del riferimento. Verifica: Test di concorrenza, rollback, obsolescenza, autorizzazione della sezione, duplicati e build. Prossimo passo: Adattatore OpenRouter e risposte di errore.
- **10** — Adattatore HTTPX con tool calling, parsing controllato e errori in italiano. Riusato il contratto OpenRouter del riferimento. Verifica: Test HTTPX simulati sul payload, chiarimenti ed errori del provider. Suite Flask e build Vite. Prossimo passo: Catalogo e selezione del modello.
- **11** — Catalogo dei modelli compatibili, cache, selettore, ultima scelta e attribuzione persistita. Riusati il catalogo, la migrazione idempotente e il selettore. Verifica: Suite per catalogo, trasporto HTTPX, attribuzione e migrazione di conversazioni esistenti. Build Vite. Prossimo passo: Rendering condiviso e PDF.
- **12** — Documento condiviso e PDF A4 con Chromium, inclusa anteprima di una bozza senza salvataggio. Riusati renderer React e font con licenza. Verifica: PDF effettivi con testo estraibile, accenti, elenchi e più pagine. Test su versioni, approvazione, anteprima e build. Prossimo passo: Presentazione immutabile nello snapshot.
- **13** — Presentazione nel JSON degli snapshot, con Classic Roma come unico preset. Riusata la validazione del riferimento e preservata la compatibilità con i documenti senza design. Verifica: 55 test Flask, compresi salvataggio, ripristino, valori respinti e accettazione AI che conserva lo stile. Build Vite riuscita. Prossimo passo: Famiglie e galleria.
