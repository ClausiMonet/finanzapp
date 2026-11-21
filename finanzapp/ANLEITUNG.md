# Finanzapp – Einrichtung Schritt für Schritt

Einmalig etwa 30–40 Minuten. Danach läuft alles offline, nur für den Kursabruf geht kurz eine Anfrage raus. Diese Anfrage enthält **nur Tickersymbole**, nie Beträge.

**Wichtig:** Die App hat **keine Passwort-Wiederherstellung**. Vergisst du dein Passwort, sind die Daten weg. Mach regelmäßig ein Backup (siehe Schritt 6).

---

## Was liegt wo?

| Was | Wo | Wer kann es sehen |
|---|---|---|
| Programmcode der App | GitHub Pages (öffentlich) | Jeder, aber da stehen keine Daten drin |
| Deine Finanzdaten | Nur auf deinem Gerät, AES-256-verschlüsselt | Nur du (mit Passwort) |
| Kurs-Proxy | Dein Cloudflare-Konto | Sieht nur Symbole wie `EUNL.DE` |
| Backup-Datei | Wo du sie hinlegst | Ohne Passwort unlesbar |

---

## Schritt 1: App auf GitHub Pages veröffentlichen

1. Auf **https://github.com/signup** ein kostenloses Konto anlegen (z. B. Benutzername `maxmuster`).
2. Oben rechts auf **+ → New repository** gehen.
   - Repository name: `finanzapp`
   - **Public** auswählen (für kostenlose GitHub Pages nötig, es liegt ja nur Code darin)
   - Auf **Create repository** klicken
3. Auf der neuen Seite den Link **„uploading an existing file“** anklicken.
4. Den **Inhalt** des Ordners `finanzapp` hineinziehen, also `index.html`, `sw.js`, `manifest.webmanifest` und die Ordner `css`, `js`, `icons`. Den Ordner `cloudflare-worker` brauchst du dort nicht.
   *Tipp: Am Laptop geht das per Drag & Drop am einfachsten. Die Ordnerstruktur muss erhalten bleiben.*
5. Unten auf **Commit changes** klicken.
6. Im Repository **Settings → Pages** öffnen:
   - Source: **Deploy from a branch**
   - Branch: **main**, Ordner **/ (root)**, dann **Save**
7. Nach 1–2 Minuten steht oben die Adresse, z. B. `https://maxmuster.github.io/finanzapp/`

## Schritt 2: Kurs-Proxy bei Cloudflare einrichten

1. Auf **https://dash.cloudflare.com/sign-up** kostenlos registrieren. Eine eigene Domain brauchst du nicht.
2. Links **Compute (Workers) → Workers & Pages** öffnen und auf **Create** klicken. Dann **Start with Hello World** (bzw. „Create Worker“) wählen.
   - Name: z. B. `kurse`, dann **Deploy**
3. Auf **Edit code** klicken, den gesamten Beispielcode löschen und den Inhalt von `cloudflare-worker/worker.js` einfügen. Danach **Deploy** klicken.
4. Ein geheimes Token festlegen, also ein langes Zufallspasswort, z. B. aus dem Passwortmanager mit 30+ Zeichen:
   - Den Worker öffnen, dann **Settings → Variables and Secrets → Add**
   - Type: **Secret**, Name: `TOKEN`, Value: dein Token, dann **Deploy**
5. Die Worker-Adresse notieren, z. B. `https://kurse.maxmuster.workers.dev`
   *Test: Rufst du die Adresse im Browser auf, muss „Nicht autorisiert“ erscheinen. Genau richtig, ohne Token kommt niemand rein.*

Der kostenlose Plan erlaubt 100.000 Anfragen pro Tag. Du brauchst ein paar Dutzend.

## Schritt 3: App installieren

**Android (Chrome):**
1. Die GitHub-Pages-Adresse öffnen.
2. Menü **⋮ → „App installieren“** bzw. **„Zum Startbildschirm hinzufügen“** wählen.
3. Die App liegt jetzt als Icon auf dem Homescreen und startet auch ohne Internet.

**Laptop (Chrome oder Edge):**
1. Die gleiche Adresse öffnen.
2. Rechts in der Adressleiste auf das **Installieren-Symbol** (Monitor mit Pfeil) klicken.

## Schritt 4: Erster Start

1. Ein **Passwort** festlegen (mind. 8 Zeichen) und gut merken.
2. Unter **Einstellungen → Kurs-Proxy** die Worker-Adresse und das Token eintragen, dann **Verbindung testen**. Es sollten Bitcoin- und MSCI-World-Kurse erscheinen.
3. Unter **Vermögen → + Konto** deine Konten anlegen:
   - Girokonten (Sparkasse, Volksbank, DKB …) als **Girokonto**
   - Tagesgeld (ING …) als **Tagesgeld**
   - Trade Republic, Scalable als **Depot**
   - Bitvavo als **Krypto**

## Schritt 5: Daten importieren

**Kontoumsätze:** Im Online-Banking (am besten am Laptop) die Umsätze der letzten 6–12 Monate als **CSV** exportieren. In der App dann **Umsätze → CSV importieren**. Die Menünamen können je nach Bank etwas abweichen:

| Bank | Wo ungefähr |
|---|---|
| Sparkasse | Umsätze → Export → **CSV-CAMT V2** |
| Volksbank/Raiffeisenbank | Umsätze → Exportieren → CSV |
| ING | Umsätze → Export / Download → CSV |
| DKB | Umsätze → Download-Symbol → CSV |
| comdirect | Umsätze → Export → CSV |

Die App erkennt das Format automatisch. Doppelte Buchungen werden beim erneuten Import übersprungen, du kannst also einfach jeden Monat den letzten Zeitraum importieren. Nach dem ersten Import fragt die App nach dem **aktuellen Kontostand**, damit dein Vermögen stimmt.

**Depot & Krypto:**
- **Scalable Capital:** Transaktionen als CSV exportieren, dann **Vermögen → Broker-CSV**
- **Bitvavo:** Transaktionshistorie als CSV exportieren, dann **Vermögen → Broker-CSV**
- **Trade Republic:** Falls deine App einen CSV-Export anbietet, geht er über Broker-CSV mit Spaltenzuordnung. Sonst trägst du die Positionen über **+ Position** ein (ISIN suchen, Stückzahl und Ø-Kaufkurs eintragen). Bei Sparplänen passt du ab und zu die Stückzahl an.

Kurs-Symbole: Bei ETFs/Aktien sucht die App per ISIN automatisch das Xetra-Symbol (Endung `.DE`), Krypto bekommt z. B. `BTC-EUR`. Über **Kurse** aktualisierst du die Kurse, beim App-Start passiert das automatisch, wenn die letzten Kurse älter als 6 Stunden sind.

## Schritt 6: Laptop ↔ Handy abgleichen

Es gibt bewusst keine Cloud. So überträgst du deinen Stand:
1. Auf dem Gerät mit dem aktuellen Stand: **Einstellungen → Backup exportieren**. Es entsteht eine `.finanzapp`-Datei.
2. Die Datei aufs andere Gerät bringen, z. B. per USB, Quick Share oder Mail an dich selbst. Ohne Passwort ist sie unlesbar.
3. Auf dem anderen Gerät: **Einstellungen → Backup importieren**. Der Stand dort wird **ersetzt**.

Am besten machst du die großen Arbeiten (CSV-Import) am Laptop und schiebst dann das Backup aufs Handy. Bewahre zusätzlich ein Backup an einem sicheren Ort auf (z. B. USB-Stick).

## Schritt 7: Automatischer Abgleich (statt Backup hin und her)

Einmalig in Cloudflare, ca. 3 Minuten:
1. Im Cloudflare-Dashboard **Storage & Databases → Workers KV** öffnen (bzw. „KV“), dann **Create** (Name z. B. `finanzapp-sync`).
2. Deinen Worker `kurse` öffnen, dann **Settings → Bindings → Add → KV Namespace**:
   - Variable name: **`SYNC`** (genau so geschrieben)
   - KV namespace: `finanzapp-sync`, dann **Deploy**
3. Den neuen Code aus `cloudflare-worker/worker.js` wie in Schritt 2 im Worker einfügen und **Deploy** klicken.

In der App:
1. **Auf dem Laptop:** Einstellungen → **Sync starten (erstes Gerät)**, danach **Kopplungscode anzeigen** und kopieren.
2. **Auf dem Handy** (App installiert, eigenes Passwort gesetzt): Einstellungen → **Mit anderem Gerät koppeln** und den Code einfügen.

Ab dann gleichen sich beide Geräte beim Öffnen, Schließen und nach Änderungen automatisch ab. Cloudflare speichert nur verschlüsselten Datensalat. Der Schlüssel steckt im Kopplungscode, **behandle ihn wie ein Passwort**. Belege (Fotos/PDFs) werden nicht abgeglichen, die überträgst du weiter per Backup. Änderst du auf beiden Geräten gleichzeitig etwas, werden die Stände zusammengeführt.

## Schritt 8: Fingerabdruck einrichten (Android)

Voraussetzungen: Die App ist über die GitHub-Adresse installiert und am Handy ist eine Displaysperre mit Fingerabdruck eingerichtet.
1. Einstellungen → **Fingerabdruck → Einrichten**
2. Das App-Passwort einmal bestätigen
3. Android fragt, ob ein **Passkey** gespeichert werden soll. Mit **Ja** bestätigen (Google-Passwortmanager).

Danach erscheint auf dem Sperrbildschirm **„Mit Fingerabdruck entsperren“**. Nach einer Passwortänderung musst du den Fingerabdruck neu einrichten. Falls dein Gerät die nötige Passkey-Funktion nicht unterstützt, zeigt die App das an. Dann geht es weiter mit Passwort.

## Funktionen im Überblick

- **Übersicht:** Hinweise (Budget, Preiserhöhung, Kündigungsfrist, Monatsende knapp …), Nettovermögen mit Verlauf, Monatsprognose, Ausgaben-Kreisdiagramm, Budgets, fällige Verträge
- **Umsätze:** Filter nach Monat, Konto und Kategorie, dazu Volltextsuche (auch `#tag`, `#steuer`, `#beleg`). In jeder Buchung kannst du:
  - auf mehrere Kategorien **aufteilen** (✂)
  - **Tags** vergeben
  - als **steuerlich relevant** markieren (§)
  - **Belege** als Foto/PDF anhängen (📎, verschlüsselt)
  - mit jemandem **teilen** (👥)
- **PayPal-Abgleich:** Die PayPal-Aktivitäten-CSV über „CSV importieren“ wählen. „PayPal“-Abbuchungen bekommen dann den echten Händler. Steht im Verwendungszweck „Ihr Einkauf bei …“, klappt das sogar ohne PayPal-Datei.
- **Vermögen:**
  - Konten, Depot und Krypto mit Gewinn/Verlust
  - **Depot-Verlauf** im Vergleich zum MSCI World (gleiche Einzahlungen)
  - **Rebalancing** mit Kaufvorschlag
  - **Dividenden & Ausschüttungen**
- **Verträge:**
  - automatische Erkennung, Preiserhöhungs-Warnung, Kündigungsschreiben
  - Trag **Vertragsende und Kündigungsfrist** ein, dann erinnert dich die App 30 Tage vor Fristende.
- **Planen:**
  - Budgets und Sparziele
  - **Prognose fürs Monatsende**
  - **Notgroschen-Check**
  - **Vermögensprognose** mit Zinseszins, Inflation und „finanzieller Freiheit“
- **Mehr** (Raster-Symbol oben):
  - **Auswertung**, inkl. Tags
  - **Monatsrückblick**
  - **Ausgaben teilen** (wer schuldet wem)
  - **Steuer & Belege**: absetzbare Ausgaben als CSV, Kapitalerträge je Bank gegen deine Freistellungsaufträge. Den Freistellungsauftrag trägst du beim jeweiligen Konto ein.
- **Benachrichtigungen:** Wichtige Hinweise erscheinen als Handy-Benachrichtigung, wenn du die App öffnest. Bei geschlossener App ist das ohne eigenen Server nicht möglich.
- **Diskret-Modus (Auge oben rechts):** blendet alle Beträge aus. Konten, ETFs und Kategorien bleiben sichtbar, Anteile, Fortschritt und Rendite stehen in Prozent da.
- **Sicherheit:** AES-256-GCM-Verschlüsselung, Fingerabdruck, automatische Sperre bei Inaktivität

## App aktualisieren

Bekommst du neue Dateien, lädst du **den kompletten Inhalt** des Ordners im GitHub-Repository wieder hoch (**Add file → Upload files**, gleiche Namen überschreiben, neue Dateien kommen dazu). Auch `worker.js` im Cloudflare-Worker aktualisieren. Die App holt sich die neue Version beim nächsten Start mit Internet. **Deine Daten bleiben dabei erhalten**, sie liegen ja auf dem Gerät und nicht bei GitHub.

## Häufige Fragen

- **„Kein Kurs“ bei einer Position:** Position antippen und über die Suche (ISIN oder Name) das richtige Symbol wählen. Bei US-Werten geht z. B. `AAPL` (wird automatisch in € umgerechnet) oder das Xetra-Symbol.
- **Import erkennt Spalten falsch:** Im Importdialog unter „Spaltenzuordnung anpassen“ die richtigen Spalten wählen.
- **Falsch erkannter Vertrag:** Vertrag öffnen, dann **„Kein Vertrag – ignorieren“**.
- **Kontostand stimmt nicht:** Konto antippen und den echten Kontostand eintragen.
- **Sync meldet „KV-Speicher nicht verknüpft“:** Schritt 7 prüfen, die Variable muss genau `SYNC` heißen.
- **Browser-Daten gelöscht / Handy neu:** Die App neu installieren und auf dem Sperrbildschirm **„Backup-Datei wiederherstellen“** wählen.
