# FinanzFlips

Private Finanzverwaltung mit Konten, Buchungen, Kategorien, Verträgen, Kreditberechnung und Sparbeträgen. Läuft auf dem eigenen Rechner oder als Home-Assistant-App. Keine Zahlungsaufträge werden an eine Bank gesendet.

## Automatisches Sparen

Gebuchter ING-Girokontostand minus 1.000 €, mindestens 0 €. Manueller Abruf jederzeit; optional monatlich am 10. um 15:00 Europe/Berlin, frühestens ab 10.11.2026. Die Automatik ist bei Installation aus. Ein offener Zahlungsvorgang wird wiederverwendet. Vor der Bereitstellung wird erneut abgerufen; ein geänderter Betrag erfordert erneute Bestätigung.

Die Überweisung erfolgt eigenständig in ING. Kopierbare Zahlungsdaten und ein lokal erzeugter EPC-GiroCode erleichtern die Eingabe. Ein generierter Code gilt niemals als ausgeführte Zahlung. Der Erledigt-Status ist eine ausdrücklich manuelle Bestätigung. Der Galerieimport auf demselben iPhone und die Annahme des Codes für das eigene Extra-Konto sind noch nicht praktisch verifiziert.

## Home Assistant

Dieses Repository im App-Store hinzufügen, FinanzFlips installieren und unter Konfiguration die eigene HA-Benutzer-ID sowie optional `mobile_app_<gerät>` als `notify_service` eintragen. Der Zugriff erfolgt ausschließlich über HA-Ingress und nur für die konfigurierte Benutzer-ID. Keine öffentlichen Ports, keine Host-Netzwerkfreigabe, kein Docker-Zugriff. Core-API-Zugriff wird für Benachrichtigungen verwendet; Supervisor-Zugriff mit Standardrolle zur Ermittlung der eigenen Paneladresse.

Unter „Automatisches Sparen“ Quellkonto, Zielname, Kontoinhaber und Ziel-IBAN prüfen. Speichern aktiviert den Zeitplan nicht. Die erste Aktivierung muss ausdrücklich erfolgen. Der HA-Rechner muss dauerhaft laufen. Nach Ausfällen wird nur der fällige Lauf des aktuellen Monats nachgeholt, mit maximal drei Abrufversuchen.

## Lokal

Node.js 24, `npm ci`, `npm start`. Standard: http://127.0.0.1:8787. `FINANZFLIPS_DATA_DIR` legt den privaten Datenordner fest. Lokaler Betrieb ist an Loopback gebunden. Für iPhone-Web-Push werden eine sichere HTTPS-Verbindung und eine auf dem Home-Bildschirm installierte App benötigt. HA nutzt stattdessen die bestehende Companion-App.

## Datenschutz, Schlüssel und Sicherung

Persönliche Daten, Umgebungsdatei, Bankschlüssel und Sparvorgänge gehören niemals ins Repository. Finanzdaten, API-Konfiguration und der private Enable-Banking-Schlüssel werden beim Start atomar mit AES-256-GCM verschlüsselt. Bestehende Klartextdateien werden eingelesen und migriert. Der separate lokale Schlüssel `.finanzflips-master.key` muss zusammen mit den Daten privat gesichert werden. Er liegt auf demselben Gerät: Dies ersetzt weder Festplattenverschlüsselung noch ein abgesichertes Betriebssystem. Wer vollständigen Zugriff auf Gerät oder Backup hat, kann auch den Schlüssel auslesen. HA-Backups deshalb verschlüsselt aufbewahren. Explizite Datenexporte enthalten Finanzdaten im Klartext.

Bankfreigaben können ablaufen. Die Bankanbindung und deren Kosten/Zulässigkeit richten sich nach dem Anbieter und dem eigenen Vertrag; die kostenlose dauerhafte Verfügbarkeit fremder APIs wird nicht zugesichert. OpenAI ist optional und verursacht die separat konfigurierten API-Kosten. Für Sparberechnung, QR und HA-Push entsteht kein zusätzliches kostenpflichtiges Abonnement.

## Tests

`npm test` verwendet ausschließlich künstliche Daten. Enthalten sind Berechnung, frische Salden, Duplikatschutz, Neustart, begrenzte Wiederholung, Zeitzone, QR-Erzeugung mit unabhängiger Dekodierung und Ingress-Zugangsschutz. Keine echten Testüberweisungen.

## Quellen und Bibliotheken

- [ING-App-Hilfe](https://www.ing.de/hilfe/ing-app/alle-faq/): QR-Scan; kein verifizierter allgemeiner Deep Link zur Befüllung einer Überweisung.
- [ING Extra-Konto](https://www.ing.de/sparen-anlegen/sparen/extra-konto-kunden/): Einzahlung per Überweisung auf die Extra-IBAN.
- [EPC QR-Richtlinie](https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation): lokaler SEPA-Datensatz.
- [Home Assistant Ingress](https://contributors.home-assistant.io/apps/guides/ingress/) und [Companion-Push](https://companion.home-assistant.io/docs/notifications/notifications-basic/).
- [WebKit iOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- `qrcode` 1.5.4 (MIT), `web-push` 3.6.7 (MIT), Testdecoder `jsqr` 1.4.0 (Apache-2.0), `pngjs` 7.0.0 (MIT). Optional `python-fints` (LGPL-3.0); ausschließlich lesende Kontenabrufe im Worker.

Marken und Banklogos gehören den jeweiligen Rechteinhabern. Keine Verbindung oder offizielle Partnerschaft mit den abgebildeten Banken.
