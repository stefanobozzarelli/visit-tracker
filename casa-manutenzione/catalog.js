// Catalogo di apparecchiature con manutenzioni suggerite.
// Ogni task: { t: titolo, k: 'consumabile' | 'programmata', n: ogni N, u: 'days'|'weeks'|'months'|'years' | null (a consumo) }
export const CATALOG = [
  { group: 'Acqua', items: [
    { id: 'addolcitore', name: 'Addolcitore', icon: '🧂', tasks: [
      { t: 'Reintegro sale rigenerante', k: 'consumabile', n: 2, u: 'months' },
      { t: 'Pulizia serbatoio salamoia', k: 'programmata', n: 6, u: 'months' },
      { t: 'Controllo e disinfezione resine', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'depuratore', name: 'Depuratore / filtro acqua', icon: '💧', tasks: [
      { t: 'Sostituzione cartucce filtro', k: 'consumabile', n: 6, u: 'months' },
      { t: 'Sanificazione impianto', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'scaldabagno', name: 'Scaldabagno / boiler', icon: '🚿', tasks: [
      { t: 'Controllo anodo di magnesio', k: 'programmata', n: 2, u: 'years' },
      { t: 'Decalcificazione resistenza e serbatoio', k: 'programmata', n: 1, u: 'years' },
      { t: 'Controllo valvola di sicurezza', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'autoclave', name: 'Autoclave / pompa', icon: '🛠️', tasks: [
      { t: 'Controllo pressione vaso di espansione', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'idraulico', name: 'Impianto idraulico / rubinetti', icon: '🚰', tasks: [
      { t: 'Pulizia aeratori rubinetti e soffioni', k: 'programmata', n: 6, u: 'months' },
      { t: 'Pulizia sifoni e scarichi', k: 'programmata', n: 6, u: 'months' } ] },
    { id: 'fossa', name: 'Fossa biologica / pozzetti', icon: '🕳️', tasks: [
      { t: 'Svuotamento e controllo', k: 'programmata', n: 1, u: 'years' } ] },
  ] },
  { group: 'Riscaldamento e clima', items: [
    { id: 'caldaia', name: 'Caldaia', icon: '🔥', tasks: [
      { t: 'Manutenzione e analisi fumi', k: 'programmata', n: 1, u: 'years' },
      { t: 'Controllo pressione impianto', k: 'programmata', n: 3, u: 'months' } ] },
    { id: 'climatizzatore', name: 'Climatizzatore', icon: '❄️', tasks: [
      { t: 'Pulizia filtri', k: 'programmata', n: 3, u: 'months' },
      { t: 'Sanificazione e controllo gas', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'pdc', name: 'Pompa di calore', icon: '♨️', tasks: [
      { t: 'Controllo tecnico annuale', k: 'programmata', n: 1, u: 'years' },
      { t: 'Pulizia unità esterna', k: 'programmata', n: 6, u: 'months' } ] },
    { id: 'pellet', name: 'Stufa a pellet', icon: '🪵', tasks: [
      { t: 'Pulizia straordinaria e controllo', k: 'programmata', n: 1, u: 'years' },
      { t: 'Acquisto pellet', k: 'consumabile', n: null, u: null } ] },
    { id: 'camino', name: 'Camino / canna fumaria', icon: '🏚️', tasks: [
      { t: 'Pulizia spazzacamino', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'termosifoni', name: 'Termosifoni', icon: '🌡️', tasks: [
      { t: 'Sfiato aria dai radiatori', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'deumidificatore', name: 'Deumidificatore', icon: '💨', tasks: [
      { t: 'Pulizia filtro e serbatoio', k: 'programmata', n: 3, u: 'months' } ] },
    { id: 'purificatore', name: 'Purificatore d\'aria', icon: '🌬️', tasks: [
      { t: 'Sostituzione filtri', k: 'consumabile', n: 6, u: 'months' } ] },
  ] },
  { group: 'Cucina', items: [
    { id: 'frigo', name: 'Frigorifero / congelatore', icon: '🧊', tasks: [
      { t: 'Pulizia bobine e guarnizioni', k: 'programmata', n: 6, u: 'months' },
      { t: 'Sostituzione filtro acqua', k: 'consumabile', n: 6, u: 'months' },
      { t: 'Sbrinamento', k: 'programmata', n: 6, u: 'months' } ] },
    { id: 'lavastoviglie', name: 'Lavastoviglie', icon: '🍽️', tasks: [
      { t: 'Rabbocco sale e brillantante', k: 'consumabile', n: 1, u: 'months' },
      { t: 'Pulizia filtro', k: 'programmata', n: 1, u: 'months' },
      { t: 'Ciclo anticalcare / pulizia', k: 'programmata', n: 3, u: 'months' } ] },
    { id: 'forno', name: 'Forno / piano cottura', icon: '🍳', tasks: [
      { t: 'Pulizia approfondita', k: 'programmata', n: 3, u: 'months' } ] },
    { id: 'cappa', name: 'Cappa aspirante', icon: '🌀', tasks: [
      { t: 'Lavaggio filtri antigrasso', k: 'programmata', n: 2, u: 'months' },
      { t: 'Sostituzione filtro ai carboni', k: 'consumabile', n: 6, u: 'months' } ] },
    { id: 'caffe', name: 'Macchina del caffè', icon: '☕', tasks: [
      { t: 'Decalcificazione', k: 'programmata', n: 3, u: 'months' },
      { t: 'Sostituzione filtro acqua', k: 'consumabile', n: 2, u: 'months' } ] },
  ] },
  { group: 'Lavanderia', items: [
    { id: 'lavatrice', name: 'Lavatrice', icon: '🧺', tasks: [
      { t: 'Pulizia filtro e cassetto', k: 'programmata', n: 3, u: 'months' },
      { t: 'Ciclo anticalcare a vuoto', k: 'programmata', n: 3, u: 'months' } ] },
    { id: 'asciugatrice', name: 'Asciugatrice', icon: '👕', tasks: [
      { t: 'Pulizia filtro pelucchi / condensatore', k: 'programmata', n: 1, u: 'months' } ] },
  ] },
  { group: 'Elettrico e sicurezza', items: [
    { id: 'rilevatori', name: 'Rilevatori fumo / gas / CO', icon: '🚨', tasks: [
      { t: 'Test e sostituzione batterie', k: 'programmata', n: 6, u: 'months' } ] },
    { id: 'estintore', name: 'Estintore', icon: '🧯', tasks: [
      { t: 'Controllo semestrale', k: 'programmata', n: 6, u: 'months' } ] },
    { id: 'quadro', name: 'Quadro elettrico / salvavita', icon: '⚡', tasks: [
      { t: 'Test tasto differenziale', k: 'programmata', n: 6, u: 'months' },
      { t: 'Verifica impianto da elettricista', k: 'programmata', n: 5, u: 'years' } ] },
    { id: 'allarme', name: 'Impianto d\'allarme / videosorveglianza', icon: '🔐', tasks: [
      { t: 'Sostituzione batterie sensori', k: 'consumabile', n: 1, u: 'years' },
      { t: 'Controllo funzionamento', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'cancello', name: 'Cancello / basculante automatico', icon: '🚪', tasks: [
      { t: 'Lubrificazione e controllo fotocellule', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'fotovoltaico', name: 'Impianto fotovoltaico', icon: '☀️', tasks: [
      { t: 'Pulizia pannelli e verifica inverter', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'wallbox', name: 'Wallbox auto elettrica', icon: '🔌', tasks: [
      { t: 'Controllo tecnico', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'ups', name: 'Gruppo di continuità (UPS)', icon: '🔋', tasks: [
      { t: 'Sostituzione batteria', k: 'consumabile', n: 3, u: 'years' } ] },
  ] },
  { group: 'Casa e struttura', items: [
    { id: 'grondaie', name: 'Tetto e grondaie', icon: '🏠', tasks: [
      { t: 'Pulizia grondaie e controllo tegole', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'infissi', name: 'Infissi / serramenti', icon: '🪟', tasks: [
      { t: 'Lubrificazione ferramenta e guarnizioni', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'tapparelle', name: 'Tapparelle / zanzariere', icon: '🪟', tasks: [
      { t: 'Pulizia e controllo cinghie/motori', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'bagno', name: 'Bagno (silicone e fughe)', icon: '🛁', tasks: [
      { t: 'Controllo e rifacimento siliconi', k: 'programmata', n: 2, u: 'years' } ] },
    { id: 'parquet', name: 'Pavimenti / parquet', icon: '🪵', tasks: [
      { t: 'Trattamento / lucidatura', k: 'programmata', n: 2, u: 'years' } ] },
    { id: 'tinteggiatura', name: 'Pareti / tinteggiatura', icon: '🎨', tasks: [
      { t: 'Ritinteggiatura', k: 'programmata', n: 7, u: 'years' } ] },
    { id: 'facciata', name: 'Facciata / terrazzo', icon: '🧱', tasks: [
      { t: 'Controllo impermeabilizzazione', k: 'programmata', n: 2, u: 'years' } ] },
  ] },
  { group: 'Esterni', items: [
    { id: 'giardino', name: 'Giardino / irrigazione', icon: '🌱', tasks: [
      { t: 'Controllo ugelli e centralina', k: 'programmata', n: 1, u: 'years' },
      { t: 'Svernamento impianto', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'tagliaerba', name: 'Tagliaerba / robot tagliaerba', icon: '🚜', tasks: [
      { t: 'Affilatura / sostituzione lame', k: 'consumabile', n: 1, u: 'years' },
      { t: 'Tagliando', k: 'programmata', n: 1, u: 'years' } ] },
    { id: 'piscina', name: 'Piscina', icon: '🏊', tasks: [
      { t: 'Analisi acqua e dosaggio cloro', k: 'consumabile', n: 1, u: 'weeks' },
      { t: 'Pulizia filtro', k: 'programmata', n: 1, u: 'months' } ] },
  ] },
  { group: 'Elettronica e ufficio', items: [
    { id: 'stampante', name: 'Stampante', icon: '🖨️', tasks: [
      { t: 'Sostituzione toner / cartucce', k: 'consumabile', n: null, u: null },
      { t: 'Pulizia testine', k: 'programmata', n: 6, u: 'months' } ] },
    { id: 'robot', name: 'Robot aspirapolvere', icon: '🤖', tasks: [
      { t: 'Sostituzione spazzole e filtri', k: 'consumabile', n: 2, u: 'months' },
      { t: 'Svuotamento e pulizia sensori', k: 'programmata', n: 1, u: 'months' } ] },
    { id: 'aspirapolvere', name: 'Aspirapolvere', icon: '🧹', tasks: [
      { t: 'Sostituzione filtro / sacchetti', k: 'consumabile', n: 3, u: 'months' } ] },
    { id: 'router', name: 'Router / rete WiFi', icon: '📶', tasks: [
      { t: 'Aggiornamento firmware', k: 'programmata', n: 6, u: 'months' } ] },
    { id: 'nas', name: 'NAS / backup', icon: '💾', tasks: [
      { t: 'Verifica backup', k: 'programmata', n: 3, u: 'months' } ] },
  ] },
  { group: 'Altro', items: [
    { id: 'custom', name: 'Altro (personalizzato)', icon: '🧰', tasks: [] },
  ] },
];

export const UNIT_LABEL = {
  days: ['giorno', 'giorni'], weeks: ['settimana', 'settimane'],
  months: ['mese', 'mesi'], years: ['anno', 'anni'],
};

export const PROPERTY_TYPES = [
  { id: 'casa', label: 'Casa', icon: '🏡' },
  { id: 'appartamento', label: 'Appartamento', icon: '🏢' },
  { id: 'villa', label: 'Villa', icon: '🏘️' },
  { id: 'montagna', label: 'Casa in montagna', icon: '🏔️' },
  { id: 'mare', label: 'Casa al mare', icon: '🏖️' },
  { id: 'garage', label: 'Garage / box', icon: '🚗' },
  { id: 'altro', label: 'Altro', icon: '📍' },
];

export const LOG_TYPES = {
  consumabile: { label: 'Consumabile', icon: '🧂', color: 'amber' },
  programmata: { label: 'Programmata', icon: '🗓️', color: 'blue' },
  straordinaria: { label: 'Straordinaria', icon: '🚨', color: 'red' },
};
