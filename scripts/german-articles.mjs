// German-only guide articles. Written for German search terms, not translated from Dutch.
const nhs = ['Cambridge University Hospitals NHS — Sever\'s disease', 'https://www.cuh.nhs.uk/patient-information/severs-diseasesevers-disease/']
const glasgow = ['NHS Greater Glasgow and Clyde — Heel pain in children', 'https://www.clinicalguidelines.scot.nhs.uk/rhc-for-health-professionals/guidelines/primary-care-referral-guidelines/orthopaedic-pre-referral-guidance/heel-pain-in-children-advice-for-referrers/']
const orthokids = ['OrthoKids — Sever\'s apophysitis', 'https://www.orthokids.org/conditions/sever%E2%80%99s-apophysitis/']
const patient = ['Patient.info — Sever\'sche Krankheit', 'https://de.patient.info/childrens-health/severs-disease-leaflet']

const doctor = `<h2>Wann solltest du zum Kinderarzt?</h2>
<p>Fersenschmerzen bei aktiven Kindern im Wachstum sind meist harmlos. Lass sie aber immer abklären bei:</p>
<ul><li>Schmerzen in Ruhe oder wenn dein Kind nachts davon aufwacht;</li><li>Fieber oder wenn sich dein Kind krank fühlt;</li><li>Schwellung, Rötung oder einer warmen Stelle;</li><li>Schmerzen nach einem Sturz, Umknicken oder Unfall;</li><li>wenn dein Kind nicht auftreten kann oder weiter humpelt;</li><li>Schmerzen, die zunehmen, obwohl du die Belastung schon verringert hast.</li></ul>`

const links = {
  sever: '<a href="/de/ratgeber/morbus-sever/">Morbus Sever</a>',
  pain: '<a href="/de/ratgeber/fersenschmerzen-bei-kindern/">Fersenschmerzen bei Kindern</a>',
  insoles: '<a href="/de/ratgeber/einlagen-bei-morbus-sever/">Einlagen bei Morbus Sever</a>',
  product: '<a href="/de/produkt/">ZOL 3/4-Einlagen</a>',
  football: '<a href="/de/ratgeber/einlagen-fussballschuhe-kinder/">Einlagen für Fußballschuhe</a>',
  cushion: '<a href="/de/ratgeber/fersenkissen-kinder/">Fersenkissen für Kinder</a>',
  duration: '<a href="/de/ratgeber/morbus-sever-dauer/">Wie lange dauert Morbus Sever?</a>',
  treatment: '<a href="/de/ratgeber/morbus-sever-behandlung/">Morbus Sever behandeln</a>',
  tape: '<a href="/de/ratgeber/morbus-sever-tapen/">Morbus Sever tapen</a>',
}

export const germanArticles = [
  {
    slug: 'einlagen-fussballschuhe-kinder',
    card: ['Fußball', 'Einlagen für Fußballschuhe', 'Was in enge Schuhe passt und worauf du achtest.'],
    title: 'Einlagen für Fußballschuhe bei Kindern: Worauf achten? | ZOL Solutions',
    description: 'Einlagen für Fußballschuhe bei Kindern: warum normale Einlagen oft nicht passen, was eine 3/4-Einlage anders macht und wie du die Passform prüfst.',
    eyebrow: 'Fußball',
    h1: ['Einlagen für', 'Fußballschuhe.'],
    lead: 'Fußballschuhe sind eng, flach und kaum gedämpft. Deshalb passt längst nicht jede Einlage hinein.',
    body: `<p class="article-lead">Klagt dein Kind nach dem Training über die Ferse, liegt der Gedanke an eine Einlage nahe. Im Fußballschuh ist das aber gar nicht so einfach: Er sitzt eng, hat wenig Innenraum und eine dünne Sohle. Hier liest du, welche Einlagen in Frage kommen und wie du prüfst, ob sie wirklich passen.</p>
<h2>Warum Fußball die Ferse besonders fordert</h2>
<p>Kurze Sprints, Abstoppen, Drehungen auf einem Bein und Landungen nach dem Kopfball: Beim Fußball wird die Ferse ständig belastet. Bei Kindern im Wachstum sitzt hinten im Fersenbein noch eine Wachstumsfuge. An dieser Stelle zieht die Achillessehne. Sind Beschwerden dort typisch, spricht man oft von ${links.sever}. Eine Diagnose stellt aber immer der Arzt.</p>
<p>Dazu kommt der Schuh selbst. Er ist für Ballgefühl gebaut, nicht für Dämpfung. Auf hartem Kunstrasen oder trockenem Boden kommt der Stoß deshalb recht direkt an der Ferse an.</p>
<h2>Warum normale Einlagen oft nicht passen</h2>
<p>Eine durchgehende Einlage füllt den ganzen Schuh aus. Im Fußballschuh führt das schnell zu drei Problemen:</p>
<ul><li>Die Zehen stoßen vorne an, weil der Platz fehlt.</li><li>Der Fuß rückt nach oben, und die Ferse sitzt nicht mehr tief in der Fersenkappe.</li><li>Der Schuh drückt oben auf den Fußrücken.</li></ul>
<h2>Was eine 3/4-Einlage anders macht</h2>
<p>Eine 3/4-Einlage reicht von der Ferse bis kurz vor die Zehen. Der Vorfuß bleibt frei und das Ballgefühl weitgehend erhalten. Dämpfung und Halt liegen dort, wo die Ferse sie braucht. Unsere ${links.product} sind genau so aufgebaut, mit Dämpfung unter der Ferse und einer festen Fersenschale, in Doppelgrößen von 34/35 bis 44/45. Sie sind ein Komfortprodukt und keine individuell angepasste Maßeinlage.</p>
<h2>Darauf achtest du beim Kauf</h2>
<ul><li><strong>Flacher Aufbau:</strong> Die Ferse darf nicht aus dem Schuh gehoben werden.</li><li><strong>Feste Fersenschale:</strong> Sie hält die Ferse bei Drehungen an ihrem Platz.</li><li><strong>Dämpfung unter der Ferse:</strong> genau dort, wo die Landung ankommt.</li><li><strong>Für Kinderfüße gemacht:</strong> keine verkleinerte Erwachseneneinlage.</li><li><strong>Passende Größe:</strong> Die Einlage darf nicht rutschen oder drücken.</li></ul>
<h2>So prüfst du die Passform</h2>
<ol><li>Nimm die vorhandene Innensohle heraus, wenn das geht.</li><li>Lege die Einlage flach hinten in den Schuh, und zwar in beide Schuhe, auch wenn nur eine Ferse schmerzt.</li><li>Lass dein Kind mit Fußballsocken hineinschlüpfen und den Schuh normal schnüren.</li><li>Prüfe, ob die Ferse tief und ruhig sitzt und die Zehen genug Platz haben.</li><li>Lass es ein paar Mal antreten und die Richtung wechseln.</li></ol>
<p>Steigere die Nutzung langsam. Neue oder stärkere Beschwerden sind ein Grund, die Einlage wegzulassen und um Rat zu fragen.</p>
<h2>Die Einlage ist nur ein Teil</h2>
<p>Eine Einlage ersetzt keine Anpassung der Belastung. Sprich mit dem Trainer über weniger Sprints und Sprünge und kürzere Spielzeiten, solange die Ferse empfindlich ist. Mehr dazu unter ${links.treatment}.</p>
${doctor}`,
    faq: [
      ['Passen Einlagen überhaupt in Fußballschuhe?', 'Dünne 3/4-Einlagen passen meist besser als durchgehende Einlagen, weil der Vorfuß frei bleibt. Prüfe trotzdem immer die Passform im Schuh deines Kindes.'],
      ['Muss die Originalsohle raus?', 'Wenn sie herausnehmbar ist, meist ja. So bleibt mehr Platz und die Ferse sitzt tiefer im Schuh.'],
      ['Braucht mein Kind in beiden Schuhen eine Einlage?', 'Ja, auch wenn nur eine Ferse schmerzt. So stehen beide Füße gleich hoch.'],
      ['Helfen Einlagen auf Kunstrasen?', 'Eine dämpfende Einlage kann den Stoß auf hartem Untergrund angenehmer machen. Wie stark sich das auswirkt, ist von Kind zu Kind verschieden.'],
    ],
    sources: [nhs, orthokids],
    aside: ['sever', 'cushion', 'treatment', 'product'],
  },
  {
    slug: 'fersenkissen-kinder',
    card: ['Vergleich', 'Fersenkissen für Kinder', 'Gel, Silikon oder Einlage: die Unterschiede.'],
    title: 'Fersenkissen für Kinder: Sinnvoll bei Fersenschmerzen? | ZOL Solutions',
    description: 'Fersenkissen für Kinder aus Gel oder Silikon: was sie leisten können, wo ihre Grenzen liegen und was der Unterschied zu einer Einlage mit Fersenschale ist.',
    eyebrow: 'Vergleich',
    h1: ['Fersenkissen', 'für Kinder.'],
    lead: 'Günstig, schnell gekauft und einfach eingelegt. Aber was kann ein Fersenkissen bei einem sportlichen Kind wirklich leisten?',
    body: `<p class="article-lead">Hat dein Kind Schmerzen an der Ferse, ist das Fersenkissen aus Apotheke oder Drogerie oft der erste Schritt. Das ist verständlich. Klinikinformationen nennen Fersenkissen auch als mögliche Unterstützung bei Morbus Sever. Bei viel Sport haben sie aber Grenzen, die du kennen solltest.</p>
<h2>Was ein Fersenkissen leisten kann</h2>
<p>Ein Fersenkissen aus Gel, Silikon oder weichem Schaum macht vor allem zwei Dinge:</p>
<ul><li>Es dämpft den Stoß beim Auftreten.</li><li>Es hebt die Ferse ein wenig an, sodass die Achillessehne etwas weniger gespannt ist.</li></ul>
<p>Manche Kinder empfinden das als angenehm. Es ist außerdem günstig und einfach auszuprobieren.</p>
<h2>Wo die Grenzen liegen</h2>
<h3>Weiche Unterlage, wenig Halt</h3>
<p>Ein weiches Kissen gibt bei jedem Schritt nach. Beim Sprinten und Drehen braucht die Ferse aber eine ruhige Basis. Steht sie instabil, müssen Muskeln und Sehnen mehr ausgleichen, und genau die ziehen an der empfindlichen Stelle.</p>
<h3>Die Ferse rückt nach oben</h3>
<p>Durch die Erhöhung sitzt die Ferse weniger tief in der Fersenkappe. Gerade in engen Fußball- oder Hockeyschuhen kann der Halt darunter leiden.</p>
<h3>Oft nicht für Kinderfüße gemacht</h3>
<p>Viele Modelle sind für Erwachsene gedacht. Achte auf eine Größe, die wirklich zum Schuh deines Kindes passt, und darauf, dass das Kissen nicht verrutscht.</p>
<h2>Fersenkissen oder Einlage mit Fersenschale?</h2>
<table><thead><tr><th></th><th>Fersenkissen</th><th>3/4-Einlage mit Fersenschale</th></tr></thead><tbody><tr><td>Dämpfung unter der Ferse</td><td>Ja</td><td>Ja</td></tr><tr><td>Seitlicher Halt der Ferse</td><td>Wenig</td><td>Ja</td></tr><tr><td>Unterstützung des Rückfußes</td><td>Nein</td><td>Ja</td></tr><tr><td>Preis</td><td>Niedrig</td><td>Höher</td></tr></tbody></table>
<p>Treibt dein Kind nur wenig Sport, kann ein Kissen ein vernünftiger Versuch sein. Bei häufigem Training mit vielen Sprints und Richtungswechseln ist mehr Halt oft sinnvoller. Dafür haben wir die ${links.product} entwickelt. Mehr dazu unter ${links.insoles} und ${links.football}.</p>
<h2>Darauf solltest du immer achten</h2>
<ul><li>Teste die Unterlage in dem Schuh, in dem dein Kind wirklich Sport treibt.</li><li>Nutze sie in beiden Schuhen, auch wenn nur eine Ferse schmerzt.</li><li>Prüfe, ob die Zehen und die Ferse noch genug Platz haben.</li><li>Trainiere nicht durch starke Schmerzen, nur weil eine Unterlage im Schuh liegt.</li></ul>
${doctor}`,
    faq: [
      ['Helfen Fersenkissen bei Fersenschmerzen von Kindern?', 'Sie können den Stoß dämpfen und manchen Kindern Komfort geben. Sie geben der Ferse aber wenig seitlichen Halt und ersetzen keine angepasste Belastung.'],
      ['Gel oder Silikon: Was ist besser?', 'Entscheidend sind Passform und Komfort im Schuh deines Kindes. Eine allgemeingültige Antwort gibt es nicht.'],
      ['Kann ich ein Fersenkissen im Fußballschuh nutzen?', 'Das geht, aber der Platz ist knapp und die Ferse kann dadurch höher sitzen. Prüfe, ob sie weiterhin fest in der Fersenkappe steht.'],
      ['Sollte das Kissen in beide Schuhe?', 'Ja, damit beide Füße gleich hoch stehen.'],
    ],
    sources: [nhs, glasgow],
    aside: ['insoles', 'football', 'treatment', 'product'],
  },
  {
    slug: 'morbus-sever-dauer',
    card: ['Verlauf', 'Wie lange dauert Morbus Sever?', 'Was du beim Verlauf erwarten kannst.'],
    title: 'Morbus Sever: Wie lange dauert es? Verlauf und Heilung | ZOL Solutions',
    description: 'Wie lange dauert Morbus Sever? Dauer einer Schmerzphase, warum die Beschwerden wiederkommen können und ab welchem Alter sie aufhören.',
    eyebrow: 'Verlauf',
    h1: ['Wie lange dauert', 'Morbus Sever?'],
    lead: 'Die wichtigste Nachricht zuerst: Morbus Sever geht wieder vorbei. Wie lange es dauert, hängt vor allem vom Wachstum ab.',
    body: `<p class="article-lead">Hat dein Kind die Diagnose ${links.sever} bekommen, ist die erste Frage meist: Wie lange noch? Eine genaue Zahl gibt es nicht. Man kann aber zwischen einer einzelnen Schmerzphase und der gesamten Zeit unterscheiden, in der die Beschwerden auftreten können.</p>
<h2>Eine einzelne Schmerzphase</h2>
<p>Eine Phase mit Beschwerden dauert oft einige Wochen bis wenige Monate. Wie lange genau, hängt unter anderem davon ab, wie stark die Ferse belastet wird und ob die Belastung rechtzeitig angepasst wird.</p>
<h2>Warum es wiederkommen kann</h2>
<p>Morbus Sever hängt mit dem Wachstum zusammen. Solange die Wachstumsfuge im Fersenbein offen ist, können die Beschwerden zurückkehren. Typische Auslöser sind:</p>
<ul><li>ein neuer Wachstumsschub;</li><li>der Beginn der Saison oder mehr Trainingseinheiten;</li><li>Turniere mit vielen Spielen in kurzer Zeit;</li><li>harter Untergrund oder abgenutzte Schuhe.</li></ul>
<p>Das ist kein Zeichen dafür, dass etwas schiefgelaufen ist. Es gehört bei vielen Kindern zum Verlauf.</p>
<h2>Wann ist es endgültig vorbei?</h2>
<p>Die Wachstumsfuge schließt sich meist im Alter von etwa 14 bis 16 Jahren. Danach fällt diese Ursache von Fersenschmerzen weg. Bleibende Schäden an der Ferse sind nach den herangezogenen Klinikinformationen nicht zu erwarten.</p>
<h2>Was den Verlauf beeinflussen kann</h2>
<ul><li><strong>Belastung anpassen:</strong> weniger Sprints und Sprünge, solange es wehtut.</li><li><strong>Langsam steigern:</strong> nach einer Pause nicht sofort wieder voll einsteigen.</li><li><strong>Passende Schuhe:</strong> feste Fersenkappe, genug Länge, keine abgelaufene Sohle.</li><li><strong>Dämpfung und Halt:</strong> eine passende Einlage kann die Ferse im Schuh unterstützen, etwa die ${links.product}.</li><li><strong>Dehnen:</strong> ruhige Übungen für die Wade, am besten vom Physiotherapeuten gezeigt.</li></ul>
<p>Mehr dazu unter ${links.treatment}.</p>
<h2>So behältst du den Überblick</h2>
<p>Notiere ein paar Wochen lang, wann die Schmerzen auftreten, wie stark sie sind und wie dein Kind am nächsten Morgen geht. Als grobe Orientierung gilt: Leichte Beschwerden, die innerhalb eines Tages abklingen, sind meist unproblematisch. Nehmen sie zu, führt die Belastung zum Humpeln oder ist die Ferse am nächsten Tag noch deutlich empfindlich, solltest du zurückschalten.</p>
${doctor}`,
    faq: [
      ['Wie lange dauert Morbus Sever?', 'Eine Schmerzphase dauert oft einige Wochen bis wenige Monate. Die Beschwerden können wiederkommen, bis sich die Wachstumsfuge schließt, meist mit etwa 14 bis 16 Jahren.'],
      ['Geht Morbus Sever von alleine weg?', 'Ja, spätestens wenn die Wachstumsfuge geschlossen ist, fällt diese Ursache weg. Bis dahin kann angepasste Belastung die Beschwerden lindern.'],
      ['Bleiben Schäden zurück?', 'Nach den herangezogenen Klinikinformationen sind bleibende Schäden an der Ferse nicht zu erwarten.'],
      ['Warum kommen die Schmerzen immer wieder?', 'Weil die Wachstumsfuge noch offen ist. Wachstumsschübe und mehr Training können die Beschwerden erneut auslösen.'],
    ],
    sources: [nhs, patient, orthokids],
    aside: ['sever', 'treatment', 'tape', 'product'],
  },
  {
    slug: 'morbus-sever-behandlung',
    card: ['Behandlung', 'Morbus Sever behandeln', 'Was üblich ist und was selten nötig ist.'],
    title: 'Morbus Sever Behandlung: Was bei Kindern üblich ist | ZOL Solutions',
    description: 'Morbus Sever behandeln: Belastung anpassen, Kühlen, Dehnen, passende Schuhe und Einlagen. Was üblich ist, was selten nötig ist und wer helfen kann.',
    eyebrow: 'Behandlung',
    h1: ['Morbus Sever', 'behandeln.'],
    lead: 'Tabletten oder eine Operation sind in der Regel nicht das Thema. Im Mittelpunkt steht, die Belastung an die wachsende Ferse anzupassen.',
    body: `<p class="article-lead">Hat der Kinderarzt oder Orthopäde Morbus Sever festgestellt, kommt die Frage: Was nun? Die Beschwerden vergehen von selbst, wenn sich die Wachstumsfuge schließt. Bis dahin geht es darum, dein Kind möglichst beschwerdearm und aktiv zu halten. Diese Bausteine sind üblich.</p>
<h2>1. Belastung anpassen, nicht unbedingt aufhören</h2>
<p>Das ist der wichtigste Punkt. Ein kompletter Sportstopp ist meist nicht nötig. Reduziere vorübergehend, was am meisten wehtut: Sprints, Sprünge, viele Spiele hintereinander und harten Untergrund. Nehmen die Schmerzen zu oder humpelt dein Kind, solltest du zurückschalten.</p>
<h2>2. Nach dem Sport kühlen</h2>
<p>Ein Kühlpack in einem Tuch etwa 15 Minuten auf die Ferse legen, nie direkt auf die Haut. An der Ursache ändert das nichts, der Abend nach dem Sport wird aber oft angenehmer.</p>
<h2>3. Wade und Achillessehne dehnen</h2>
<p>Im Wachstumsschub wächst der Knochen oft schneller, als sich Muskeln und Sehnen anpassen. Ruhige Dehnübungen für die Wade werden deshalb häufig empfohlen. Lass sie dir von einem Physiotherapeuten zeigen. Wichtig ist, dass sie nicht wehtun.</p>
<h2>4. Passende Schuhe und Unterstützung an der Ferse</h2>
<p>Barfußlaufen oder flache, weiche Schuhe können die Ferse stärker belasten. Hilfreich ist ein Sportschuh mit fester Fersenkappe. Klinikinformationen nennen außerdem stoßdämpfende Einlagen und Fersenkissen als mögliche Unterstützung. Mehr dazu unter ${links.insoles} und ${links.cushion}. Für Sportschuhe haben wir die ${links.product} entwickelt; sie ersetzen keine ärztliche Behandlung.</p>
<h2>5. Schmerzmittel nur nach Rücksprache</h2>
<p>Sprich mit dem Kinderarzt oder in der Apotheke, bevor du deinem Kind Schmerzmittel gibst. Sie sind nicht dafür da, trotz deutlicher Schmerzen weiter Sport zu ermöglichen.</p>
<h2>6. Fachliche Begleitung</h2>
<p>Bei anhaltenden Beschwerden kann ein Kinderphysiotherapeut beim Aufbau helfen. Ein Orthopäde oder Orthopädietechniker kann Fußstellung und Schuhe beurteilen und, wenn nötig, Maßeinlagen verordnen oder anfertigen. Das ist nicht bei jedem Kind nötig.</p>
<h2>Was selten nötig ist</h2>
<p>Gips oder eine Orthese sind bei Morbus Sever nur selten Thema, etwa bei sehr starken Schmerzen und nach ärztlicher Entscheidung. Eine Operation ist nicht üblich.</p>
<h2>Was du sonst noch ausprobieren kannst</h2>
<p>Manche Familien nutzen zusätzlich Tape. Die Studienlage dazu ist begrenzt, siehe ${links.tape}. Wie lange du mit Beschwerden rechnen solltest, liest du unter ${links.duration}.</p>
${doctor}`,
    faq: [
      ['Was ist die beste Behandlung bei Morbus Sever?', 'Die eine beste Behandlung gibt es nicht. Grundlage ist die angepasste Belastung. Kühlen, Dehnen, passende Schuhe und Dämpfung an der Ferse können ergänzen.'],
      ['Muss mein Kind mit dem Sport aufhören?', 'Meist nicht vollständig. Passe Menge und Art der Belastung an die Schmerzen an. Bei starken Schmerzen kann eine kurze Pause nötig sein.'],
      ['Welcher Arzt ist zuständig?', 'Erste Anlaufstelle ist der Kinderarzt. Er kann bei Bedarf zum Orthopäden oder zur Physiotherapie überweisen.'],
      ['Braucht mein Kind eine Operation?', 'Eine Operation ist bei Morbus Sever nicht üblich.'],
    ],
    sources: [nhs, glasgow, orthokids, patient],
    aside: ['sever', 'duration', 'tape', 'product'],
  },
  {
    slug: 'morbus-sever-tapen',
    card: ['Tape', 'Morbus Sever tapen', 'Was Tape kann und was nicht.'],
    title: 'Morbus Sever tapen: Was bringt Tape beim Kind? | ZOL Solutions',
    description: 'Morbus Sever tapen: welche Tape-Arten es gibt, was über die Wirkung bekannt ist, worauf du bei Kinderhaut achtest und welche Alternativen es gibt.',
    eyebrow: 'Tape',
    h1: ['Morbus Sever', 'tapen.'],
    lead: 'Buntes Tape an der Ferse sieht man oft am Spielfeldrand. Was es bei Morbus Sever leisten kann und was nicht.',
    body: `<p class="article-lead">Viele Eltern fragen sich, ob Tape auch ihrem Kind helfen könnte. Kurz gesagt: Manche Kinder empfinden es als angenehm, eine Behandlung für sich ist es aber nicht, und die Studienlage ist begrenzt.</p>
<h2>Welche Arten von Tape gibt es?</h2>
<ul><li><strong>Fersentape:</strong> hält das Fettpolster unter der Ferse zusammen, damit die Landung besser abgefedert wird. Bei Morbus Sever ist das die häufigste Technik.</li><li><strong>Sporttape:</strong> fest und nicht dehnbar. Es stabilisiert ein Gelenk oder begrenzt Bewegung, etwa am Sprunggelenk.</li><li><strong>Kinesiotape:</strong> elastisch und wird teilweise entlang der Wade geklebt. Bei Morbus Sever ist das weniger üblich als Tape um die Ferse.</li></ul>
<h2>Was ist über die Wirkung bekannt?</h2>
<p>Gute Studien speziell zu Tape bei Morbus Sever gibt es kaum. Einige Kinder spüren beim Sport weniger Beschwerden, andere merken keinen Unterschied. Klinikinformationen nennen vor allem angepasste Belastung, Dehnen, gute Schuhe und Fersenerhöhung oder Dämpfung. Tape kann das ergänzen, aber nicht ersetzen. Mehr unter ${links.treatment}.</p>
<h2>Darauf solltest du achten</h2>
<ul><li>Lass dir das Anlegen beim ersten Mal von einem Physiotherapeuten zeigen.</li><li>Achte auf die Haut. Entferne das Tape bei Juckreiz, Rötung oder Blasen.</li><li>Tape ist kein Grund, bei zunehmenden Schmerzen weiterzumachen.</li><li>Merkt dein Kind keinen Unterschied, lohnt es sich nicht, weiterzumachen.</li></ul>
<h2>Alternativen zu Tape</h2>
<p>Tape muss vor jedem Training neu angelegt werden. Wer das vermeiden möchte, kann sich Dämpfung und Halt im Schuh ansehen. Eine Einlage wie die ${links.product} liegt einfach bei jedem Training im Schuh. Vergleiche auch ${links.cushion}.</p>
<h2>Tape oder Einlage?</h2>
<p>Beide setzen an unterschiedlichen Stellen an: Tape am Fettpolster der Ferse, eine Einlage an Dämpfung und einem stabilen Stand im Schuh. Manche Kinder nutzen auch beides. Wichtig ist, dass der Schuh weiterhin gut passt.</p>
${doctor}`,
    faq: [
      ['Hilft Tapen bei Morbus Sever?', 'Manche Kinder empfinden es als angenehm, die Studienlage ist aber begrenzt. Sieh es als Ergänzung zur angepassten Belastung, nicht als Behandlung.'],
      ['Kann ich selbst tapen?', 'Das ist möglich. Lass dir die Technik beim ersten Mal aber von einem Physiotherapeuten zeigen, damit sie stimmt und die Haut nicht gereizt wird.'],
      ['Wie lange darf das Tape bleiben?', 'Kinesiotape kann oft einige Tage bleiben, Sporttape nimmst du nach dem Training ab. Bei Hautreaktionen sofort entfernen.'],
      ['Ist Tape besser als eine Einlage?', 'Beide leisten etwas anderes. Tape zielt auf das Fettpolster der Ferse, eine Einlage auf Dämpfung und Halt im Schuh.'],
    ],
    sources: [nhs, glasgow, orthokids],
    aside: ['sever', 'treatment', 'duration', 'product'],
  },
].map(article => ({ ...article, target: `/de/ratgeber/${article.slug}/`, asideHtml: article.aside.map(key => links[key]).join('\n') }))
