# INCrovax Control 0.1 — Entwicklungsfassung

Eigener Server, eigene Technikerkonsole und eigenes Windows-QuickSupport-Programm.
Dieser Quellstand verwendet keinen RustDesk-Code und kein RustDesk-Protokoll.
Er liegt vorerst in einem getrennten Branch des vorhandenen Forks. Dessen ältere
Historie stammt weiterhin von RustDesk; die neue Entwicklung befindet sich in
diesem Branch. Für eine spätere Veröffentlichung ein eigenes Repository verwenden.

## Bereits implementiert

- Ein Technikerzugang mit eigenem Passwort; keine Standardzugangsdaten.
- Kunden anlegen und Geräte per einmaligem Code einem Kunden zuordnen.
- Geräteübersicht, Online-Status und Sperren eines Gerätezugangs.
- Windows-Programm mit sichtbarer Zustimmung bei jeder Sitzung und lokaler Stopptaste.
- Hauptmonitor als JPEG-Bildfolge (etwa ein Bild pro Sekunde, maximal 1440 Pixel breit).
- Einfache Maussteuerung und Tasten (ASCII-Buchstaben, Ziffern, Navigation, Modifikatoren).
- Zugriffssperre vor Freigabe sowie nach Ablehnung, Sitzungsende oder Verbindungsverlust.
- Sicherheitsrelevante Ereignisse im Serverprotokoll; keine Bildschirmaufzeichnung.
- Registrierungsschlüssel serverseitig nur gehasht; im QuickSupport nur im Arbeitsspeicher.
- Automatisierte API-Tests und Windows-Build mit Test des sichtbaren Programmstarts.

## Deutliche Grenzen dieser Version

Dies ist ein Testprototyp für eigene Geräte und keine Kundenfreigabe. Noch keine
Ende-zu-Ende-Verschlüsselung: Der Server verarbeitet Bildschirmbilder und Eingaben
im Klartext innerhalb seines Prozesses. HTTPS schützt nur die einzelnen Transportwege.
Für den ersten Test bleibt der Server deshalb an localhost und wird über SSH erreicht.
Noch keine Mehrfaktor-Anmeldung, mehreren Techniker oder echte Mandantentrennung.
Kunden sind organisatorische Zuordnungen für einen Betreiber, keine Sicherheitsmandanten.
Noch keine Code-Signierung, Agentinstallation, UAC-Steuerung, mehreren Monitore,
Dateiübertragung oder unbeaufsichtigten Zugriffe. Die UI zeigt diese Grenzen sichtbar.
Geräte werden bei jedem neuen QuickSupport-Start erneut registriert und erhalten eine
neue ID. Frühere Einträge lassen sich sperren. Keine Zugangsdaten für Fernwartung
werden im Programm eingebettet. Nach Sitzungsende ist eine neue Zustimmung nötig.
Die erreichte Übertragungsrate hängt von Verbindung und Bildgröße ab.

## Lokaler Start ohne Docker

Node.js 24 installieren. Im Projektverzeichnis ein eigenes Technikerpasswort über
die Umgebungsvariable `ADMIN_PASSWORD` setzen. Mindestens 14 Zeichen verwenden.
Dann `npm start` ausführen und `http://127.0.0.1:8787` öffnen. Kein npm install nötig.
Einzelne PowerShell-Sitzung: `$env:ADMIN_PASSWORD = Read-Host 'Testpasswort'`.
Für echte Zugangsdaten besser ein sicheres Geheimnismanagement verwenden.
`node --test tests/control.test.mjs` führt die Servertests aus.

## Auf dem bestehenden Linux-Testserver mit Docker

Das Paket in einen eigenen Ordner kopieren. `deploy/.env.example` nach `deploy/.env`
kopieren und dort ausschließlich lokal ein neues Technikerpasswort setzen.
Aus dem Projektordner `docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build`
starten. Das verwendet Port 8787 nur an localhost und eigene Daten; kein RustDesk-Port.

Auf dem Windows-Techniker-PC einen SSH-Tunnel offen halten:
`ssh -L 8787:127.0.0.1:8787 <SSH-BENUTZER>@<TESTSERVER>`
Browser: `http://127.0.0.1:8787`. Für ein zweites eigenes Windows-Testgerät einen
entsprechenden Tunnel mit einem eigenen autorisierten SSH-Schlüssel öffnen.
SSH-Schlüssel niemals an Kunden verteilen. Diese Tunnel sind nur für den isolierten Test.
Keine Firewall-Ports für den Prototyp öffnen. Internetbereitstellung ist nicht Teil dieser Version.

## Erster Durchlauf

1. Technikerkonsole öffnen und mit dem selbst gesetzten Passwort anmelden.
2. Testkunden anlegen, auswählen und einen Registrierungscode erzeugen.
3. Auf dem Testrechner `INCrovax-QuickSupport.exe` starten. Serveradresse auf
   `http://127.0.0.1:8787` ändern (bei offenem Tunnel), Code eintragen und registrieren.
4. Das Gerät erscheint in der Konsole. „Support anfragen“ anklicken.
5. Die Person am Testgerät nimmt die Anfrage ausdrücklich an.
6. Bildschirm prüfen; für Steuerung die Checkbox aktivieren und das Bild fokussieren.
7. Am Testgerät „ZUGRIFF BEENDEN“ drücken. Weitere Eingaben müssen abgelehnt werden.
8. Ablehnen und Abbruch der Verbindung gesondert mit eigenen Geräten testen.

## Windows-Build

.NET 10 SDK: `dotnet publish windows/INCrovax.QuickSupport.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o artifacts/QuickSupport`.
GitHub Actions erledigt diesen Build im Branch `incrovax-control` und prüft,
dass das sichtbare Programmfenster startet. Das ersetzt keinen praktischen
Ende-zu-Ende-Test mit zwei Windows-Rechnern.

## Nächste Entwicklungsstufen

Zuerst Windows-Ende-zu-Ende-Tests und Fehlerbehebung. Danach Geräteidentitäten,
Techniker-MFA, echte Kundentrennung, Ende-zu-Ende-Verschlüsselung mit geprüfter
Gegenstelle und geeigneter Echtzeitübertragung. Anschließend erst installierter
Agent, explizite Richtlinien für unbeaufsichtigten Zugriff und Monitoring.

Datenmodell und Server sind bewusst auf eine kleine, einzelne Testinstanz begrenzt.
Bestandsdaten werden atomar in JSON gespeichert; ein Datenbank- und Backupkonzept
ist vor produktiver Nutzung erforderlich. Sitzungen und Anmeldungen verfallen bei Neustart.
