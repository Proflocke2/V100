# Wizard-UI-Layer

Der Bot hatte 49 Slash-Commands mit über 280 Unterbefehlen. Funktional stark,
bedienbar kaum. Dieser Layer legt eine menügeführte Oberfläche darüber, ohne
eine einzige Command-Implementierung anzufassen.

**Registriert bei Discord:** `/menu`, `/games`, `/staff`, `/config`, `/help`.
Alles andere bleibt in `client.commands` geladen und läuft über die Menüs.

## Warum das ohne Feature-Verlust funktioniert

Jeder Command liefert bereits einen `SlashCommandBuilder`. Dessen `.toJSON()`
enthält den vollständigen Baum: Gruppen, Unterbefehle, Optionstypen, Choices,
`min_value`/`max_value`, `channel_types`. Der Katalog liest das beim Start aus
und generiert die Menüs daraus.

Konsequenz: Wer einem Legacy-Command eine Option hinzufügt, bekommt das Feld im
Wizard automatisch. Es gibt keine zweite Liste, die auseinanderlaufen könnte.

```
src/ui/
  ids.ts             customId-Codec + UiAction-Enum (alles typisiert)
  placement.ts       4 Hubs, 33 Kategorien, Zuordnungsregeln
  catalog.ts         Laufzeit-Katalog aus client.commands
  publicCommands.ts  Allow-List für den Deploy
  permissions.ts     Zugriffsrollen + Node-Overrides (SQLite)
  session.ts         Session-Store, 15 min TTL, Cap 2000
  optionForm.ts      Modal-/Select-Builder + Validierung
  views.ts           Hub-, Kategorie- und Eintragsansicht
  permissionView.ts  Rechte-Editor
  bridge.ts          Proxy → virtuelle ChatInputCommandInteraction
  router.ts          zentrale Dispatch-Logik
```

## Die Brücke

Der Kern ist `bridge.ts`. Legacy-Code liest seine Eingaben über
`interaction.options.getString('reason')`. Statt ~50 `execute()`-Rümpfe
umzuschreiben, bekommt der Command eine Proxy-Interaction: Sie beantwortet
`options.*` aus den im Menü gesammelten Werten, meldet sich als
Chat-Input-Command und reicht alles andere — `reply`, `deferReply`,
`editReply`, `followUp`, `showModal`, `user`, `guild`, `channel`, `client` — an
die echte Button-Interaction durch.

Damit laufen Command-Logik und sämtliche Datenbankaufrufe unverändert. Geändert
hat sich nur, woher die Argumente kommen.

`BridgedOptionResolver` deckt jeden Accessor ab, der im Projekt tatsächlich
vorkommt (per grep verifiziert): `getString`, `getInteger`, `getNumber`,
`getBoolean`, `getUser`, `getMember`, `getRole`, `getChannel`, `getMentionable`,
`getAttachment`, `getSubcommand`, `getSubcommandGroup`, `getFocused`, `get`,
`data`.

## Parameter-Erfassung

| Optionstyp | Komponente |
|---|---|
| String / Integer / Number | Modal-Textfeld (bis zu 5 gebündelt) |
| mit `choices` | String-Select |
| Boolean | String-Select (Ja / Nein) |
| User / Role / Channel | passendes Entity-Select, `channel_types` werden respektiert |
| Mentionable | Mentionable-Select |
| Attachment | nicht erfassbar — siehe unten |

Validierung spiegelt, was Discord beim echten Slash-Command erzwungen hätte:
`min_value`, `max_value`, `min_length`, `max_length`, Ganzzahl-Prüfung,
Choice-Zugehörigkeit. Ein Command sieht über die Brücke also keine Eingabe, die
er vorher nicht auch hätte sehen können.

### Datei-Uploads

Drei Einträge erwarten einen Upload und lassen sich über Buttons technisch nicht
bedienen: `/bot-admin customize avatar`, `/bot-admin customize banner`,
`/bot-backup import`. Sie erscheinen im Menü mit Hinweis statt Ausführen-Button.
Für diese Fälle `LEGACY_COMMANDS=true` setzen — dann steht der Originalbefehl
wieder als Slash-Command bereit.

## Rechte-System

Zwei Ebenen, beide pro Server konfigurierbar unter `/config → 🔑 Berechtigungen`.

**Zugriffsrollen** (`ui_access_roles`) — welche Rollen als Team bzw. Admin
gelten. Admin-Rollen zählen automatisch auch als Team-Rollen. Ist nichts
gesetzt, greifen die Discord-Rechte *Mitglieder moderieren* und
*Server verwalten*.

**Node-Overrides** (`ui_permission_overrides`) — pro Befehl oder pro einzelnem
Unterbefehl, vier Modi: `inherit`, `allow`, `deny`, `roles`.

Nodes spiegeln den Befehlsbaum:

```
hub.staff
cmd.security
cmd.security.antinuke
cmd.security.antinuke.setup
```

Die Auflösung läuft vom spezifischsten Knoten nach oben bis zum Hub-Knoten. Ein
Server kann also die gesamte Moderations-Ebene an `@Moderator` geben und
`cmd.mass-action` davon ausnehmen — oder umgekehrt.

Server-Owner und Träger der Administrator-Berechtigung kommen immer überall hin.

### Wo geprüft wird

Serverseitig, bei **jedem** Dispatch in `router.ts` — nicht beim Rendern und
nicht im Client:

1. Session existiert, gehört diesem Nutzer und dieser Guild
2. Hub ist für das Mitglied noch offen
3. der konkrete Eintrag ist für das Mitglied noch offen
4. der Command ist auf der Guild nicht deaktiviert (`/disable`-Parität)

Punkt 2 und 3 werden bei jeder Interaktion neu aus der Datenbank aufgelöst. Ein
Moderator, dem mitten in der Session die Rolle entzogen wird, verliert das Menü
sofort — eine offene Session ist kein Freifahrtschein.

`setDefaultMemberPermissions` auf `/staff` und `/config` blendet die Befehle im
Client aus. Das ist Kosmetik; die verbindliche Prüfung sitzt in `openHub()`.

## Navigation

```
Hub        → Bereichsbeschreibung + Kategorie-Auswahl
Kategorie  → Inhaltsbeschreibung + Eintrags-Auswahl (25 pro Seite)
Eintrag    → Was der Befehl tut, welche Parameter er nimmt, Ausführen-Button
```

Jede Ebene erklärt sich selbst — das war der ganze Anlass des Umbaus. Sessions
sind ephemeral, an den Aufrufer gebunden und laufen nach 15 Minuten ohne
Aktivität ab.

## Umbenennung

`src/commands/games/games.ts` heißt intern jetzt `games-impl`, damit `/games`
für den Hub frei wird. Die Datei bleibt geladen, die Spiellogik ist unverändert;
im Menü erscheint weiterhin der Pfad `/games …`.

## Erweitern

Neuer Command → Datei wie gewohnt unter `src/commands/` anlegen. Er landet
automatisch im Katalog. Ohne Eintrag in `placement.ts` fällt er in
`/menu → 📦 Sonstiges` mit Mitglieder-Zugriff. Eine Zeile in `BY_COMMAND` oder
`BY_LEAF` setzt ihn an die richtige Stelle und auf die richtige Zugriffsstufe.
