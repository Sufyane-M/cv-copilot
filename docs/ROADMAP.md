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
- [ ] 02 Backend essenziale
- [ ] 03 Persistenza
- [ ] 04 API dei curriculum
- [ ] 05 Frontend iniziale
- [ ] 06 Sezioni e modifica manuale
- [ ] 07 Versionamento
- [ ] 08 Chat in modalità simulata
- [ ] 09 Proposte e approvazione
- [ ] 10 OpenRouter
- [ ] 11 Scelta del modello
- [ ] 12 Documento e PDF
- [ ] 13 Presentazione negli snapshot
- [ ] 14 Famiglie e galleria dei template
- [ ] 15 Editing direttamente sul documento
- [ ] 16 Personalizzazione e riquadri
- [ ] 17 Bozza e Undo/Redo
- [ ] 18 Coordinamento fra editor e AI
- [ ] 19 Completamento dell’interfaccia
- [ ] 20 Verifica finale e documentazione

## Registro

- **01 Fondamenta** — Cartella separata, branch main, esclusioni, configurazione mock e piano. Verificati identità Git, contenuto iniziale indicizzato e porte locali 5001 e 5174. Prossima fase: avvio Flask e risposte JSON.
