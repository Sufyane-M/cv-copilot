import { resolveDesign } from './CvDocument.mjs'

function section(id, type, title, text, subtitle = '', period = '') {
  return { id: `demo-${id}`, type, title, text, ...(subtitle && { subtitle }), ...(period && { period }) }
}

const samples = {
  business: {
    document_title: 'Sofia Marini',
    profile: { role: 'Analista operations', location: 'Milano, Italia', email: 'sofia.marini@example.com', phone: '+39 000 001 2040', website: 'sofia-marini.example' },
    sections: [
      section('profile', 'summary', 'Profilo professionale', 'Analista con esperienza nel coordinamento operativo e nella reportistica. Trasformo dati di vendita e magazzino in indicazioni pratiche per i team commerciali.'),
      section('work', 'experience', 'Analista operations', '• Ho creato una dashboard per ordini, scorte e tempi di consegna.\n• Ho concordato con il magazzino indicatori comuni per la riunione settimanale.\n• Ho ridotto i passaggi manuali nel report mensile, documentando le nuove procedure.', 'Nodo Retail · Milano', '2023 — oggi'),
      section('previous', 'experience', 'Assistente pianificazione', '• Supporto alla pianificazione delle consegne per 12 punti vendita.\n• Controllo delle anomalie e aggiornamento del calendario promozionale.', 'Orizzonte Logistica · Monza', '2021 — 2023'),
      section('project', 'projects', 'Progetto di miglioramento', 'Ho confrontato i tempi di evasione prima e dopo la revisione del flusso e presentato le priorità al responsabile di reparto.', 'Revisione degli ordini urgenti', '2024'),
      section('skills', 'skills', 'Competenze', '• Excel, Power Query e SQL\n• Analisi dei processi\n• Dashboard e reportistica\n• Coordinamento operativo'),
      section('study', 'education', 'Laurea in Economia', 'Indirizzo gestione d’impresa e organizzazione.', 'Università degli Studi di Milano-Bicocca', '2018 — 2021'),
      section('languages', 'skills', 'Lingue', 'Italiano · madrelingua\nInglese · B2'),
    ],
  },
  product: {
    document_title: 'Elena Ricci',
    profile: { role: 'Product Designer', location: 'Bologna, Italia', email: 'elena.ricci@example.com', website: 'elena-ricci.example' },
    sections: [
      section('profile', 'summary', 'Profilo', 'Progetto interfacce e servizi digitali per rendere più semplici compiti complessi. Seguo la ricerca, i prototipi e il lavoro con chi sviluppa il prodotto.'),
      section('work', 'experience', 'Product Designer', '• Ho riprogettato la prenotazione di visite e verificato il prototipo con cinque partecipanti.\n• Ho lavorato con il team tecnico su stati di errore, moduli e navigazione da tastiera.\n• Ho documentato componenti e varianti nel design system.', 'Studio Riva · Bologna', '2023 — oggi'),
      section('previous', 'experience', 'Junior UX Designer', '• Ho condotto interviste e sintetizzato i risultati per il team.\n• Ho preparato prototipi per un portale dedicato ai servizi di quartiere.', 'Atelier Sette · Modena', '2021 — 2023'),
      section('project', 'projects', 'Progetto in evidenza', 'Mappa interattiva delle biblioteche di quartiere. Ho semplificato la ricerca per orario e verificato i risultati con due associazioni locali.', 'Biblioteche aperte', '2024'),
      section('skills', 'skills', 'Competenze', '• Ricerca e test di usabilità\n• Figma e prototipazione\n• Design system\n• Accessibilità web'),
      section('study', 'education', 'Laurea in Design', 'Progettazione dell’interazione e comunicazione visiva.', 'Università di Bologna', '2018 — 2021'),
      section('languages', 'skills', 'Lingue', 'Italiano · madrelingua\nInglese · C1'),
    ],
  },
  editorial: {
    document_title: 'Andrea Riva',
    profile: { role: 'Designer editoriale', location: 'Torino, Italia', email: 'andrea.riva@example.com', website: 'andrea-riva.example' },
    sections: [
      section('profile', 'summary', 'Profilo', 'Disegno pubblicazioni, identità visive e materiali per mostre. Mi occupo di tipografia, sistemi grafici e preparazione dei file per la stampa.'),
      section('work', 'experience', 'Designer editoriale', '• Ho seguito l’impaginazione di una collana illustrata in collaborazione con redazione e tipografia.\n• Ho sviluppato una griglia e una guida per copertine, didascalie e apparati.\n• Ho verificato le bozze di stampa con l’editore.', 'Quaderno Studio · Torino', '2022 — oggi'),
      section('previous', 'experience', 'Grafico junior', '• Ho preparato materiali informativi per mostre e rassegne.\n• Ho adattato le identità per stampa, sito web e segnaletica.', 'Officina Grafica · Cuneo', '2020 — 2022'),
      section('project', 'projects', 'Progetto selezionato', 'Catalogo di 96 pagine per una mostra locale. Ho coordinato immagini, testi e revisioni del progetto grafico.', 'Atlante di quartiere', '2024'),
      section('skills', 'skills', 'Competenze', '• Tipografia e impaginazione\n• InDesign e Illustrator\n• Preparazione per la stampa\n• Direzione grafica'),
      section('study', 'education', 'Diploma in Graphic Design', 'Comunicazione visiva e design editoriale.', 'Accademia Albertina di Belle Arti', '2017 — 2020'),
      section('languages', 'skills', 'Lingue', 'Italiano · madrelingua\nInglese · B2\nFrancese · B1'),
    ],
  },
}

export function templateSample(template, portrait) {
  const key = template.portrait || ['modern', 'sidebar'].includes(template.family) ? 'product'
    : ['editorial', 'creative'].includes(template.family) ? 'editorial' : 'business'
  const sample = samples[key]
  return {
    ...sample,
    profile: { ...sample.profile, ...(template.portrait && portrait ? { photo: portrait } : {}) },
    sections: sample.sections.map(item => ({ ...item })),
    design: resolveDesign({ templateId: template.id }),
  }
}

export function applyTemplate(content, template, portrait) {
  if (content.sections.length) return { ...content, design: resolveDesign({ templateId: template.id }) }
  const sample = templateSample(template, portrait)
  return { ...sample, ...content, sections: sample.sections, profile: { ...sample.profile, ...content.profile }, design: sample.design }
}
