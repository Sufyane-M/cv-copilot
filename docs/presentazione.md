# CV Copilot

Traccia per la discussione di Tecnologie Web. **8 slide, 9 minuti e 30 secondi.** [Lucidi in PDF](presentazione.pdf).

## 1. Editor visuale di curriculum · 0:40

Mostrare la chat a sinistra e il foglio A4 a destra. Chi aggiorna un curriculum può intervenire sul documento, personalizzarne l’aspetto e valutare una proposta AI prima di applicarla. L’app è locale e monoutente.

## 2. Architettura web · 1:10

React gestisce la bozza e usa Fetch per le richieste relative sotto `/api`. Vite ascolta su 5174 e inoltra le richieste a Flask su 5001, anche in anteprima della build. Il backend valida i dati e conserva gli snapshot in SQLite. HTTPX collega Flask a OpenRouter. Uno script Node separato avvia Chromium per la stampa del PDF.

## 3. Template e snapshot · 1:05

Aprire `templates.json` e mostrare i preset di due famiglie. Un template inizializza palette, font, gerarchia e struttura di pagina. Le miniature usano lo stesso componente del CV. Nello snapshot JSON il campo `sections` contiene i testi e gli ID. Il campo `design` contiene lo stile della pagina e le personalizzazioni dei riquadri per ID. Uno snapshot precedente senza `design` usa il template iniziale.

## 4. Dall’editor al PDF · 1:30

Cliccare su un titolo o su un testo nel foglio. `VisualEditor` rende quel valore come campo di testo e aggiorna la bozza. Per un riquadro, la larghezza resta tra il 50% e il 100% della colonna e l’altezza impostata rappresenta un minimo. Mostrare `CvDocument.mjs` e `document.css`, usati dall’editor, dalla galleria e dallo script `render-pdf.mjs`. Chromium applica le regole di stampa A4 e incorpora i font DejaVu. Il renderer riceve la bozza corrente o lo snapshot salvato. Aprire l’anteprima della bozza genera il PDF senza scrivere una versione. Il browser usa lo stesso PDF per anteprima e download.

## 5. Proposte e conflitti · 1:25

La richiesta indica la versione attesa. OpenRouter può invocare `propose_edit` per proporre un nuovo testo. Alla conferma, `BEGIN IMMEDIATE` protegge il controllo della versione e la scrittura dello snapshot. L’accettazione cambia il solo testo autorizzato e conserva `design`. Una base superata causa HTTP 409. Se una proposta aggiorna il CV mentre è aperta una bozza, **Confronta e recupera** permette di riprendere insieme il testo manuale e lo stile. Se la stessa sezione è cambiata in entrambe le versioni, l’utente sceglie il testo da tenere. Annulla e Ripeti riguardano la bozza. Ripristina crea una nuova versione da uno snapshot salvato.

## 6. Demo locale · 2:00

Avviare Flask e Vite in modalità `mock` con dati sintetici.

1. Aprire il CV d’esempio e scegliere un template dalla galleria.
2. Modificare un testo inline, ridimensionare un riquadro e regolare font e colore.
3. Aprire Anteprima PDF sulla bozza. Salvare, aprire l’anteprima della versione e scaricare il documento.
4. Inviare una richiesta sulla sezione Profilo e accettare la proposta simulata. Mostrare lo stile conservato e ripristinare la versione precedente dalla Cronologia.

## 7. Verifiche · 1:00

Indicare i risultati su Windows. Sono passati 67 test pytest, 13 test Node e la build Vite. Mostrare il test sulla doppia accettazione e quello sulla conservazione del design. Il test PDF controlla formato, font e testo selezionabile su più pagine. Le prove in Chrome desktop e mobile usano dati sintetici. Mostrare il controllo della bozza PDF senza scritture e del recupero di testo e stile dopo l’accettazione. HTTPX simulato ha coperto catalogo, errore di credito e nuovo invio con attribuzione del modello.

## 8. Limiti e uso dell’AI · 0:40

Il foglio in modalità Modifica ha larghezza A4 e scorre in verticale. Le interruzioni di pagina effettive si vedono in Anteprima PDF. L’esportazione richiede Playwright e Chromium. La modalità reale invia il contesto testuale a OpenRouter. La verifica dei fatti spetta a chi scrive il CV. Codex ha ricostruito l’app per fasi, riusando parti del progetto di riferimento in un repository separato, ed eseguito le verifiche documentate. La modalità reale resta da provare con credenziali OpenRouter. Il README contiene la dichiarazione completa.
