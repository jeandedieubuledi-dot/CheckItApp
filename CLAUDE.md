# Horaires App — Contexte projet pour Claude Code

## Quoi

SaaS multi-entreprises de gestion des horaires et pointage, pour le marché belge.
Conformité avec l'obligation belge de pointage objectif/fiable/accessible (effective
au 1er janvier 2027, découlant de la jurisprudence CJUE CCOO 2019).

Cible : PME de 20-100 employés par site.

## Les 3 clients front + le backend

- **`apps/backend`** — API NestJS + PostgreSQL (Prisma), sert les 3 clients.
- **`apps/checkin-mobile`** — App mobile (Expo/React Native) unique pour staff ET
  managers. L'UI/navigation s'adapte selon `user.role`. Ne permet PAS la création
  d'horaires (lecture seule des plannings).
- **`apps/checkin-pos`** — App tablette (Expo/React Native), mode kiosk, fixée sur
  le lieu de travail (caisse, vestiaire). C'est le terminal de pointage physique.
  **Ne s'authentifie PAS comme un utilisateur** — s'authentifie comme un
  `SiteDevice` (voir plus bas). Permet : scan (par la caméra de la tablette) du
  QR rotatif affiché sur le téléphone de l'employé, identification par
  badge/NFC, PIN code, enrôlement de nouveaux badges, pairing initial de
  l'appareil et rotation de son `qrSecret`.
- **`apps/web-manager`** — App web (React/Vite), managers uniquement. Seul endroit
  où on peut créer/éditer des horaires (Planning en drag-drop). Propose aussi :
  validation des échanges de shifts (Approvals), présence en direct, gestion de
  l'équipe (dont l'override GPS par employé), gestion des sites (avec
  géocodage d'adresse), réglages entreprise (toggle GPS).

## Décisions d'architecture déjà prises (ne pas reproposer sans raison forte)

1. **Multi-tenant shared-schema** : toutes les tables métier ont un `companyId`.
   Isolation gérée en code (guard + filtrage systématique dans les requêtes
   Prisma), pas par schema Postgres séparé par client. Voir
   `apps/backend/src/auth/tenant-scope.guard.ts` — **RÈGLE CRITIQUE** : toute
   requête Prisma sur une table qui a un `companyId` DOIT filtrer dessus.
   Ne jamais faire `prisma.site.findUnique({ where: { id } })`, toujours
   `prisma.site.findFirst({ where: { id, companyId: user.companyId } })`.

2. **Pointage à 3 modes** (voir enum `TimeEntrySource` dans le schema Prisma) :
   `qr_scan_own_phone`, `badge_scan`, `pin_code`, `gps`, `manual_by_manager`.
   Le pointage ne doit jamais dépendre uniquement du téléphone de l'employé
   (batterie/casse) — badge physique et PIN sont les vrais filets de sécurité,
   pas des options annexes.

3. **Auth à deux modèles différents** :
   - `checkin-mobile` et `web-manager` : auth utilisateur classique (JWT avec
     payload `{ sub: userId, companyId, role }`)
   - `checkin-pos` : auth **appareil**, via `SiteDevice.qrSecret` (rotatif). Pas
     de notion d'utilisateur connecté sur cette app — l'employé s'identifie
     ponctuellement pour créer une entrée dans `time_entries`, sans session.

4. **Horodatage toujours côté serveur**, jamais confiance dans l'heure envoyée
   par le client (exigence légale de fiabilité).

5. **Restriction "création d'horaires = web only"** traitée comme choix produit
   (l'écran n'existe pas côté mobile), pas comme un blocage API — un manager
   reste autorisé par son rôle à créer des shifts, quel que soit le client
   utilisé. Ne pas ajouter de détection "client mobile vs web" côté backend
   sauf décision explicite contraire.

6. **QR rotatif = TOTP (RFC 6238, `otplib`), pas un QR statique.** Le secret
   (`User.qrSecret`) est généré une seule fois côté serveur, à la première
   activation, et n'est jamais transmis au client — seul le code à 6 chiffres
   dérivé l'est. Le téléphone de l'employé (checkin-mobile) affiche ce code
   sous forme de QR qui se régénère toutes les 30s (`PersonalQrCode` +
   `RotatingQrService.generateCode`) ; la tablette (checkin-pos) le scanne et
   renvoie `{ userId, code }` au backend pour vérification
   (`RotatingQrService.verifyCode`), avec une fenêtre de tolérance d'une étape
   pour absorber le décalage d'horloge entre les deux appareils.

7. **Échange de shifts (marché) modélisé par `ShiftOffer`**, distinct de
   `ShiftAssignment` : un employé propose son shift assigné (`offeredBy`), un
   collègue l'accepte (`acceptedBy`), puis un manager valide ou refuse
   (`requiresManagerApproval`, `true` par défaut). Avant toute validation,
   revérifier que le collègue acceptant n'a pas un conflit d'horaire sur ce
   créneau (`ensureNoOverlap`) — c'est un cas légitime de 409, pas un bug, et
   l'UI doit l'afficher clairement plutôt que d'échouer silencieusement (voir
   historique : `ShiftApprovalPage` catchait déjà ce cas correctement une
   fois corrigé).

8. **`ShiftsService.assign()` vérifie la disponibilité déclarée avant
   d'assigner.** Une entrée `Availability` sur une date précise (`specificDate`)
   prime sur une entrée récurrente (`dayOfWeek`) pour ce même jour ; absence
   totale de disponibilité déclarée → rejet en 409 (pas de déclaration =
   bloqué par défaut). Si une entrée existe :
   - `isAvailable: true` → le shift doit rentrer entièrement dans
     `startTime`/`endTime` (comportement backend inchangé). Côté écran
     Disponibilités (checkin-mobile), un employé ne peut plus saisir
     d'heures pour "Disponible" — l'écran envoie toujours la sentinelle
     "toute la journée" (`FULL_DAY_START`/`FULL_DAY_END` = `00:00`/`23:59`)
     pour toute nouvelle déclaration. Le check d'heures ci-dessus reste dans
     le backend (générique, pas mort : une ligne existante avec une fenêtre
     plus étroite, ex. import ou ancien jeu de données, doit continuer à
     être respectée) mais n'est plus atteignable via l'app pour un nouveau
     "Disponible" — ne pas réintroduire de saisie d'heures ici sans
     décision produit explicite contraire.
   - `isAvailable: false` → bloque **toute la journée par défaut**. Mais
     `startTime`/`endTime` ne sont plus ignorés : l'employé peut "préciser
     une plage" (écran Disponibilités) au lieu de la sentinelle "toute la
     journée" — mais seulement l'un des deux bords à la fois, pas les
     deux : soit *« à partir de X »* (`startTime: X`, `endTime` = sentinelle
     de fin `23:59`), soit *« jusqu'à Y »* (`startTime` = sentinelle de
     début `00:00`, `endTime: Y`). Un seul champ horaire à saisir, jamais un
     intervalle fermé au milieu de la journée avec les deux bords
     personnalisés — c'est un choix produit (simplicité de saisie), pas une
     limite technique : `ensureAvailable` teste un chevauchement générique
     et accepterait tout aussi bien un intervalle fermé arbitraire. Seul un
     shift qui chevauche la plage ainsi bloquée est rejeté, le reste du jour
     reste assignable. Ne pas contourner cette vérification pour un ajout
     "rapide" de shift, et ne jamais réinterpréter `startTime`/`endTime` sur
     une ligne `isAvailable: true` comme une plage d'indisponibilité (deux
     sens opposés du même champ selon `isAvailable` — voulu, pas une
     incohérence à "corriger").

9. **GPS clock-in désactivable, à deux niveaux** : `Company.gpsClockInEnabled`
   (réglage par défaut de l'entreprise) et `User.gpsClockInEnabled` nullable
   (override par employé — `null` = hérite du réglage entreprise). Le réglage
   résolu (override employé ?? défaut entreprise) doit être vérifié par
   `TimeEntriesService.createSelf` avant d'accepter un pointage `source: gps` ;
   sinon 403.

10. **Géocodage via Nominatim/OpenStreetMap (pas de clé API), réservé
    admin/manager.** `/geocoding/search` (adresse → coordonnées, utilisé à la
    création/édition d'un site) et `/geocoding/reverse` (coordonnées → adresse
    lisible, utilisé sur les écrans de présence en direct quand un pointage
    GPS existe mais que le site n'a pas de coordonnées déclarées). Le reverse
    geocoding doit rester fail-soft (ne jamais casser l'écran de présence) et
    est mis en cache mémoire (clé = coordonnées arrondies, TTL 1h) pour
    respecter le rate-limit de Nominatim.

11. **Scoping par rôle sur la lecture, pas seulement sur l'écriture** :
    `GET /shifts` ne renvoie à un employé que les shifts où il est assigné
    (filtré dans la requête Prisma elle-même, jamais côté client) ; manager/
    admin voient tout le planning du site. `GET /sites/:id/presence` est
    réservé admin/manager (il expose les coordonnées GPS exactes des collègues)
    et renvoie en plus `source` (méthode de pointage) et
    `distanceFromSiteMeters` (haversine, uniquement pour `source: gps` et un
    site avec coordonnées).

12. **Grille du planning (web-manager, `PlanningPage`) = tableau
    employés x jours, pas une colonne par jour avec les shifts empilés.**
    Structure exacte (voir `PlanningGridCell`, `EmployeeRowHeader`) :
    - 1ère colonne : sélecteur « Semaine »/« Jour » (bascule le nombre de
      colonnes jour affichées, 7 ou 1 — indépendant du toggle Semaine/Mois
      qui reste au-dessus et gère la vue mois séparée) puis une ligne par
      employé (photo ronde = initiales tant qu'il n'y a pas de vraie photo
      de profil dans `User`, nom, total d'heures assignées sur la semaine).
    - Colonnes suivantes : Lundi → Dimanche (`WEEKDAY_LABELS_FR` dans
      `lib/date.ts` — respecter cet ordre, pas celui de `Date.getDay()`).
    - 1ère ligne du corps : « Shifts disponibles », fond vert menthe très
      pâle (`colors.accentTint`), affiche les shifts sans assignation du
      jour concerné.
    - Une carte de shift (`ShiftCard`) = horaire en gras + durée en dessous
      (`formatDurationLabel`), fond pastel très léger et texte assorti,
      couleur choisie par hash déterministe de l'id du shift parmi 4
      (orange/bleu/rose/violet — `shiftPalette` dans `ui-tokens`,
      `getShiftPalette` côté web-manager). Séparations de grille fines,
      gris clair (`colors.border`).
    - Glisser-déposer : toute la carte est la poignée ; on la lâche sur une
      cellule (employé x jour) pour assigner (uniquement si le shift n'a
      pas déjà un titulaire différent — pas de ré-assignation, le backend
      ne l'expose pas) et/ou changer son jour, en une seule dépose
      (`PlanningPage.moveShift`, combine `PATCH /shifts/:id` et
      `POST /shifts/:id/assign`).

13. **Création de shift = modèle sans date d'abord, date au moment de la
    dépose.** Le formulaire « Nouveau shift » ne prend plus que des heures
    (`type="time"`, ex. 16h-20h) : il ne crée pas de `Shift` en base, il
    ajoute un `ShiftTemplate` (`lib/shiftTemplates.ts` — id, startTime,
    endTime, roleNeeded), un concept **purement client**, persisté en
    `localStorage`, jamais envoyé au backend tel quel (le `Shift` Prisma
    exige `startsAt`/`endsAt`, voir schema). Le modèle s'affiche sous le
    formulaire comme une carte réutilisable (`ShiftTemplateCard`, même
    palette pastel que `ShiftCard`) qu'on glisse sur une cellule de la
    grille : `PlanningPage.placeTemplate` combine alors la date de la
    cellule avec les heures du modèle (`combineDateAndTime`,
    `durationMinutesFromTimeRange` — gère le passage à minuit pour un
    shift de nuit) et appelle `POST /shifts` (**`status: 'draft'`**, voir
    décision #15) puis, si déposé sur la ligne d'un employé,
    `POST /shifts/:id/assign`. Le modèle n'est pas consommé par la dépose :
    il reste dans la bibliothèque pour être réutilisé (suppression
    manuelle via le bouton sur la carte).

14. **Indisponibilités affichées dans la grille = seulement les
    déclarations explicites (`Availability.isAvailable: false`), pas
    l'absence de déclaration — et distinguées visuellement selon qu'elles
    couvrent toute la journée ou juste une plage.** Le backend bloque
    l'assignation dans tous les cas, y compris l'absence de déclaration
    (`ShiftsService.ensureAvailable` — décision #8), mais côté affichage
    (`lib/availability.ts` → `getUnavailabilityInfo`, qui renvoie
    `'none' | 'full' | 'from' | 'until'`) l'absence de déclaration retombe
    sur `'none'` : "pas encore renseigné" ne veut pas dire "refusé", et tout
    marquer pareil noierait la grille (beaucoup de créneaux ne sont jamais
    déclarés dans les données de démo).
    - `'full'` (journée entière) : fond plein rose très pâle (`#FEF2F2`) +
      étiquette « Indisponible ».
    - `'from'`/`'until'` (plage partielle, décision #8) : même teinte mais
      en **dégradé horizontal proportionnel** à la portion bloquée de la
      journée (`PlanningGridCell` → `partialGradient`, `lib/date.ts` →
      `fractionOfDay` ; gauche = 00:00, droite = 24:00 — ex. « à partir de
      18h » teinte les 25% de droite de la cellule) + étiquette « Indisponible
      dès/jusqu'à HH:mm » plutôt que le texte générique. Cette mini-timeline
      dans la cellule est le seul indice visuel de la portion bloquée — pas
      de découpage réel de la cellule par créneau.
    - La dépose n'est bloquée que si l'élément réellement glissé chevauche
      la plage indisponible ce jour-là (`PlanningGridCell` recombine
      l'heure de l'élément glissé — `draggedTimeRange`, indépendante de sa
      date d'origine — avec la date de la cellule via
      `isEmployeeAvailableForShift`, décision #16) : une indisponibilité
      partielle ne bloque plus toute la ligne, contrairement à avant. Le
      menu déroulant de secours sur `ShiftCard` applique la même
      vérification précise, voir décision #16.

15. **Workflow brouillon -> assignation -> publication, appliqué côté
    backend et pas juste côté écran.** `Shift.status` par défaut à
    `'draft'` à la création (`CreateShiftDto.status`, déjà le cas côté
    Prisma) ; le manager peut travailler et assigner un brouillon
    librement (il le voit toujours, voir `ShiftsService.findAll`), mais
    **un employé ne voit un shift que s'il est à la fois assigné à lui ET
    `status: 'published'`** — sinon publier ne changerait rien à ce qu'il
    voit sur checkin-mobile. C'est un filtre Prisma dans la requête, pas un
    masquage à l'affichage (même logique que le scoping companyId/rôle,
    décision #11). Côté web-manager : `ShiftCard` affiche une bordure en
    tirets + étiquette « Brouillon » et une action rapide *Publier* par
    carte (icône `Send`) ; `PlanningPage` a en plus un bouton « Publier N
    brouillons » qui publie en une fois tous les brouillons de la semaine
    chargée (`publishAllDrafts`, confirmation via `Dialog`). Ne jamais
    faire dépendre cette visibilité d'une vérification côté client — le
    filtre `status: 'published'` doit rester dans la requête Prisma de
    `findAll`.

16. **Le sélecteur d'assignation d'une carte de shift (`ShiftCard`, repli
    sans glisser-déposer) filtre les employés proposés par disponibilité
    réelle sur l'HEURE du shift, pas juste sur le jour.** Un employé
    indisponible seulement 12h-14h doit rester proposable pour un shift
    16h-20h le même jour — filtrer au jour près (comme le fait la grille
    pour son étiquette « Indisponible », décision #14) aurait exclu à tort
    tous les employés partiellement indisponibles ce jour-là. Voir
    `lib/availability.ts` → `isEmployeeAvailableForShift`, un miroir client
    exact de `ShiftsService.ensureAvailable` (décision #8) : recalculer
    cette règle côté frontend est fragile (double maintenance), mais
    nécessaire ici pour éviter de proposer un choix que le backend
    refuserait de toute façon en 409.

17. **Ce même sélecteur exclut aussi tout employé déjà occupé ce jour-là,
    même sans chevauchement horaire avec CE shift précis** — contrairement
    à la décision #16 (qui ne regarde que la disponibilité déclarée), ici
    c'est un choix produit délibéré : on ne veut pas encourager à donner un
    second shift le même jour à quelqu'un qui en a déjà un, même si les
    horaires ne se chevauchent pas (ex: un shift 08h-12h ne bloque pas pour
    12h-14h côté `ensureNoOverlap`, mais on ne le propose plus quand même
    dans ce sélecteur). `PlanningGridCell` fournit `dayShifts` (tous les
    shifts du jour de la cellule, tous employés, assignés ou non) à chaque
    `ShiftCard`, qui exclut les employés y ayant une assignation active
    (`status !== 'cancelled'`) de la liste proposée. Ne pas confondre avec
    `ensureNoOverlap` côté backend (décision #8), qui reste, lui, au
    chevauchement horaire strict — cette restriction-ci n'existe que côté
    web-manager, pour guider vers de meilleures assignations, pas pour
    empêcher techniquement un second shift le même jour (le glisser-déposer
    direct sur une cellule employé, ou l'API, restent possibles).

18. **La simple bascule Disponible/Indisponible (checkin-mobile,
    `AvailabilitiesScreen`) n'engage QUE le jour affiché — jamais les
    semaines suivantes.** Poser une indisponibilité récurrente (qui vaut
    pour toutes les semaines suivantes) est une action **explicite**,
    réservée au bouton dédié « Rendre récurrente » / « Indisponibilité
    récurrente (toute la journée) » (`applyRecurringFullDayBlock`) —
    jamais une conséquence du toggle. C'est une distinction volontaire de
    mécanisme, pas seulement de mot : plutôt que "permanente" (mot choisi
    par le demandeur, mais ambigu — suggère l'irrévocable), l'écran et ce
    document parlent d'indisponibilité **récurrente**, le terme standard en
    planification pour "se répète chaque semaine".
    - **Bascule (`toggleDay`)** : crée/édite toujours une exception
      ponctuelle (`Availability` avec `specificDate` = la date exacte de
      cette occurrence dans la semaine affichée), jamais l'enregistrement
      `dayOfWeek`. Exception à cette règle : la toute première bascule vers
      Disponible sur un jour de semaine qui n'a jamais rien de déclaré crée
      un enregistrement `dayOfWeek` avec `isAvailable: true` — sinon ce
      jour resterait bloqué indéfiniment (absence de déclaration = refusé
      par défaut, décision #8) et il faudrait le redéclarer chaque semaine ;
      ce n'est pas "poser une récurrence d'indisponibilité", c'est établir
      la ligne de base disponible sans laquelle l'écran serait inutilisable.
    - **« Rendre récurrente » / « Indisponibilité récurrente (toute la
      journée) »** (`applyRecurringFullDayBlock`) — seul point d'entrée qui
      pose ou renforce un blocage `dayOfWeek` (`isAvailable: false`, journée
      entière). Supprime l'exception ponctuelle du jour affiché si elle
      existait (devenue redondante, la récurrence couvre désormais ce jour
      de toute façon). Visible directement sur l'état « Indisponible »
      plein-jour (à côté de « Préciser une plage horaire »), et comme
      filet de secours dans l'éditeur de plage.
    - **Remettre disponible un jour bloqué par une récurrence ACTIVE**
      (aucune exception ponctuelle en dessous) déclenche une boîte de
      dialogue plutôt qu'une bascule directe, puisque l'action a un impact
      au-delà du jour affiché :
      - **« Garder la récurrence, libérer cette semaine »** — crée une
        exception ponctuelle (`specificDate`, `isAvailable: true`) pour la
        semaine affichée, sans toucher à l'enregistrement `dayOfWeek` :
        repose entièrement sur la précédence déjà existante specificDate >
        dayOfWeek de `resolveAvailability` (frontend) /
        `ShiftsService.ensureAvailable` (backend, décision #8) — **aucun
        changement backend n'a été nécessaire**.
      - **« Annuler la récurrence définitivement »** — repasse directement
        l'enregistrement `dayOfWeek` à `isAvailable: true`, pour toutes les
        semaines.
      Si la bascule touche un jour bloqué par une exception ponctuelle
      seule (pas de récurrence active), c'est un cas simple et scopé au
      jour affiché : la supprimer suffit, pas de dialogue.
    L'éditeur de plage (« Préciser une plage horaire ») et sa sauvegarde
    (`saveEditing`) opèrent sur le même enregistrement que celui qui produit
    l'affichage courant — l'exception ponctuelle si elle existe, sinon la
    récurrence active — jamais l'un à la place de l'autre.

19. **`AvailabilitiesScreen` (checkin-mobile) navigue entre semaines**
    (flèches sous le titre, `weekStart` en state au lieu d'un `useMemo` figé
    au montage) — nécessaire pour que la décision #18 ait un sens : sans
    navigation, il n'y avait qu'une seule semaine à voir, donc rien à
    distinguer entre "ce jour est indisponible cette semaine" et "il l'est
    de façon récurrente". `weekDates` (7 jours dérivés de `weekStart`) et
    `overrideForDay` (exceptions ponctuelles de la semaine affichée) se
    recalculent avec la semaine courante — `toggleDay` et
    `keepRecurringButFreeThisWeek` (décision #18) opèrent donc sur la
    semaine *affichée*, pas nécessairement la semaine réelle actuelle.
    Deux signes distinctifs accompagnent cette navigation, pour qu'un
    employé qui parcourt les semaines suivantes comprenne d'où vient ce
    qu'il voit sans avoir à deviner :
    - **Badge répétition** (icône `repeat`, à côté de « Indisponible ») —
      affiché quand l'indisponibilité vient de la récurrence et s'applique
      bien cette semaine (pas masquée par une exception ponctuelle).
      Répond directement au besoin : confirmer que « l'indisponibilité
      récurrente a bien été appliquée » — par opposition à une
      indisponibilité qui ne concerne que le jour affiché (pas de badge).
    - **« Exception cette semaine »** (sous « Disponible ») — cas inverse :
      une récurrence existe mais est mise en pause cette semaine par une
      exception ponctuelle active ; sans ce texte, « Disponible » seul
      aurait pu laisser croire que la récurrence avait été annulée pour de
      bon.
    Aucun changement backend : ces deux indicateurs ne font que lire l'état
    déjà renvoyé par `GET /availabilities` (recurring vs override), calculé
    côté client (`isRecurringApplied` / `isRecurringPaused`).

20. **`GET /shift-offers` est le SEUL endroit où un employé voit des shifts
    qui ne sont pas les siens.** `GET /shifts` ne renvoie jamais que les
    shifts de l'appelant pour un employé (`assignments: { some: { userId }
    }`, décision #11) — dériver les offres ouvertes des collègues à partir
    de `getShifts()` (comme le faisait initialement l'écran
    `ShiftMarketplaceScreen`) ne pouvait donc structurellement jamais rien
    trouver : un employé ne recevait toujours que *ses propres* offres.
    `ShiftsService.listOpenOffers(companyId, requesterId)` interroge
    directement `ShiftOffer` (`status: 'open'`, `offeredBy: { not:
    requesterId }`, scopé à l'entreprise via `shiftAssignment.shift.site`)
    et renvoie une forme aplatie dédiée (`OpenShiftOffer` dans
    `shared-types` : `{ id, shiftId, shift, offeredBy, createdAt }`) plutôt
    que des `Shift[]` imbriqués — plus simple à consommer côté écran que de
    refouiller des `assignments[].offers[]`. Portée volontairement étroite :
    uniquement les offres encore ouvertes, jamais le planning complet d'un
    collègue — ne pas élargir ce filtre sans décision produit explicite.
    L'écran fait deux appels distincts : `getShifts()` pour « Mes
    échanges » (shifts propres, inchangé), `getOpenShiftOffers()`
    (`GET /shift-offers`) pour « Disponibles ».
    *Note historique* : ce bug a été corrigé indépendamment par deux
    sessions Claude Code en parallèle sur ce dépôt (deux implémentations
    quasi identiques poussées à quelques minutes d'écart) — la seconde à
    pousser a dû fusionner manuellement les deux ; c'est la version
    `listOpenOffers`/`OpenShiftOffer` ci-dessus qui a été retenue.

21. **`ShiftsService.ensureAvailable` compare les horaires dans le fuseau du
    SITE, jamais en UTC brut.** Un `Shift` est stocké en UTC, mais les
    heures `HH:mm` d'une `Availability` et son `dayOfWeek` sont déclarés en
    heure locale du site — les comparer sans conversion décale tout d'1 à 2h
    selon l'heure d'été/hiver (un shift 09:00 locale à Bruxelles est 07:00Z
    l'été : comparé tel quel à une dispo "08:00-16:00", il semblait
    commencer AVANT l'ouverture). `assign()` charge le fuseau du site
    (`Site.timezone`, défaut `Europe/Brussels`) et `ensureAvailable`
    décompose chaque borne via `Intl.DateTimeFormat` (`zonedParts`) en
    année/mois/jour/jour-de-semaine/minutes-du-jour LOCAUX avant toute
    comparaison — jamais de `Date` UTC comparées directement à une chaîne
    `HH:mm`. Un shift de nuit dont la fin tombe le lendemain en heure locale
    voit sa fin exprimée sur une échelle > 24h (`shiftEndMinutes = fin +
    joursDeDécalage × 1440`) plutôt que rembobinée à minuit — sans ça, un
    22h-06h locale se ferait comparer une fin "avant" son propre début.
    Cette conversion est partagée par les deux branches de la fonction
    (fenêtre disponible ET plage d'indisponibilité partielle, décision #8) :
    ne jamais réintroduire une comparaison sur les `Date` UTC brutes du
    shift dans l'une des deux sans l'autre, elles doivent rester cohérentes.

22. **Le marché de shifts accepte plusieurs candidats par offre — le manager
    choisit lequel approuver, le shift ne quitte le planning de son
    propriétaire d'origine qu'à ce moment-là.** Avant cette décision, une
    seule personne pouvait "accepter" une offre (`ShiftOffer.acceptedBy`,
    champ unique) : la première à cliquer verrouillait l'offre pour tout le
    monde. Nouveau modèle :
    - `ShiftOfferCandidate` (nouvelle table, `@@unique([offerId, userId])`)
      enregistre chaque candidature — plusieurs lignes possibles pour la
      même offre. `ShiftsService.acceptOffer` (endpoint
      `POST /shift-offers/:id/accept`, toujours ce nom pour l'API, mais
      c'est désormais une candidature, pas une finalisation) se contente d'y
      ajouter une ligne : **ni `ShiftOffer.status` ni
      `ShiftAssignment.status` ne changent tant qu'aucun choix n'est fait**
      — le shift reste `offered`, visible et attribué à son propriétaire
      d'origine dans son planning (`GET /shifts`, web-manager comme
      checkin-mobile) exactement comme avant qu'il ne le propose. Les
      statuts `swap_pending` (assignation) et `accepted` (offre) de l'ancien
      flux à candidat unique restent dans les enums Prisma/TS pour ne pas
      casser une migration à froid, mais **le nouveau code ne les produit
      plus jamais** — ne pas s'étonner qu'ils soient orphelins.
    - `ShiftsService.approveOffer(companyId, offerId, { userId })` prend
      maintenant l'id du candidat choisi (nouveau `ApproveShiftOfferDto`) :
      transfère l'assignation à CE candidat précis, revérifie son absence de
      chevauchement (l'état a pu changer depuis sa candidature), clôt
      l'offre, et **supprime les autres candidatures** (`deleteMany`,
      devenues sans objet). `rejectOffer` fait de même sans choisir
      personne : l'assignation revient au propriétaire d'origine, toutes
      les candidatures sont effacées.
    - `GET /shift-offers/pending` (nouveau, `listPendingOffersForManager`,
      admin/manager) alimente la page "Échanges à valider"
      (web-manager `ShiftApprovalPage`, checkin-mobile
      `ShiftApprovalScreen`) : **toutes** les offres encore ouvertes de
      l'entreprise, candidatures comprises — y compris celles à zéro
      candidat, pour que le manager voie ce qui traîne sans preneur sur le
      marché, pas seulement ce qui est prêt à valider. Le manager choisit
      parmi les candidats (menu déroulant web, chips tapables mobile) avant
      de valider ; sans candidat, seul "Retirer" (rejectOffer) est possible.
    - `GET /shift-offers` (marché employé, `listOpenOffers`) renvoie en
      plus `hasApplied` (l'appelant a-t-il déjà candidaté sur cette offre)
      pour que le bouton "Candidater" du marché (checkin-mobile
      `ShiftMarketplaceScreen`, renommé — "Accepter" n'était plus honnête,
      candidater ne finalise plus rien) se désactive après une candidature
      plutôt que de proposer un second clic sans effet visible.

23. **Mises à jour en temps réel via un unique gateway WebSocket
    (`apps/backend/src/realtime`), pas de payload fusionné côté client.**
    - `RealtimeGateway` (socket.io, `@nestjs/websockets` +
      `@nestjs/platform-socket.io`) authentifie chaque connexion au handshake
      avec le même JWT que les requêtes HTTP (`socket.auth.token`), puis
      rejoint le client à une room `company:${companyId}` — aucune autre
      room, même isolement multi-tenant que le reste de l'API (décision #1).
      Un token absent/invalide déconnecte immédiatement le socket.
      `RealtimeModule` est `@Global()` : n'importe quel service injecte
      `RealtimeGateway` sans réimport, un seul canal pour toute l'app.
    - **checkin-pos n'y participe pas** : c'est un terminal mono-tâche
      (pointage), sans écran multi-viewer à tenir à jour en direct.
    - Événements volontairement grossiers — `shifts:changed`,
      `time-entries:changed`, `availabilities:changed` — sans payload
      exploitable (`{}`). Chaque écran réagit en rappelant sa fonction
      `load()` existante (le même chemin que le pull-to-refresh) plutôt que
      de fusionner un état partiel : plus simple, et chaque écran consomme
      déjà ces données sous une forme différente (shift imbriqué dans une
      grille, présence aplatie, etc.) — fusionner aurait dupliqué cette
      logique de mise en forme à chaque écran.
    - Émis par `ShiftsService` (`offerAssignment`, `acceptOffer`,
      `approveOffer`, `rejectOffer`), `TimeEntriesService` (les 4 chemins de
      pointage + update), `AvailabilitiesService` (create, update, remove) —
      toujours juste avant le `return`, jamais avant que la transaction
      Prisma ait committé.
    - **Exception délibérée dans `ShiftsService` : `create`, `update` (sauf
      passage à `published`), `remove` et `assign` n'émettent PAS
      `shifts:changed`.** Construire le planning (créer un brouillon,
      l'assigner en glisser-déposer, ajuster ses horaires, le supprimer) est
      un travail de préparation, invisible de toute façon pour un employé
      tant que le shift reste `draft` (décision #15) — rafraîchir en direct
      l'écran des AUTRES managers à chaque geste de préparation ne fait que
      perturber leur propre glisser-déposer en cours, pour un bénéfice nul
      tant que rien n'est publié. Seul le vrai passage à `status:
      'published'` dans `update()` (bouton *Publier* d'une carte, "Publier N
      brouillons", ou l'éditeur générique de shift) déclenche l'émission :
      c'est le seul moment où le contenu change réellement pour quelqu'un
      d'autre. Ne pas réintroduire d'émission sur les autres branches de ces
      méthodes sans revenir sur ce choix produit explicite. Les mutations du
      marché d'échange (`offerAssignment`/`acceptOffer`/`approveOffer`/
      `rejectOffer`) restent inchangées : ce n'est pas de la préparation de
      planning, la page "Échanges à valider" doit rester réactive en direct.
    - Côté front, `packages/api-client/src/realtime.ts` expose
      `connectRealtime(baseUrl, token)` (force `transports: ['websocket']`,
      plus fiable que le long-polling XHR sur React Native). Les deux
      `AuthService.tsx` (web-manager, checkin-mobile) ouvrent la connexion
      dès qu'un `user` est authentifié (login ou session restaurée) et la
      ferment au logout ; le socket est exposé via `useAuth().socket`.
    - `PresenceLivePage`/`PresenceLiveScreen` gardent leur polling existant
      (30s web, aucun avant côté mobile) **en filet de sécurité** — le
      websocket accélère juste le rafraîchissement, il ne le remplace pas.

## Stack

- Backend : NestJS + PostgreSQL + Prisma + Passport/JWT
- Mobile (checkin-mobile, checkin-pos) : React Native + Expo
- Web (web-manager) : React + Vite
- Monorepo : pnpm workspaces + Turborepo
- Types partagés : `packages/shared-types`
- Client API partagé : `packages/api-client` (utilisé par les 3 clients front,
  évite de dupliquer la logique d'appel)
- Design tokens partagés : `packages/ui-tokens`

## État actuel du repo

Le projet a dépassé le stade du squelette : les 3 apps front ont des écrans
réels et fonctionnels, le backend a sa logique métier implémentée (pas
seulement les routes), et il tourne en démo (seed réaliste, déploiement
Railway). Ce n'est plus une base à construire mais un produit existant à
faire évoluer — vérifier l'état réel du code avant de supposer qu'une brique
reste "à faire".

**Fait** :
- Schéma Prisma complet (`apps/backend/prisma/schema.prisma`) — 10 tables,
  incluant `ShiftOffer` (marché d'échange) et `AuditLog` (traçabilité —
  table présente mais **non encore alimentée par aucun service**, voir
  "Connu manquant" ci-dessous)
- `AuthModule` fonctionnel : register, login, refresh, stratégie JWT.
  Le logout (checkin-mobile) est **purement client** (vide le stockage local)
  — aucun endpoint de révocation de refresh token côté backend
- `TenantScopeGuard` et `JwtAuthGuard` (+ `DeviceAuthGuard`/`DeviceJwtStrategy`
  pour l'auth appareil de checkin-pos)
- Tous les modules backend ont leur logique métier écrite, avec test unitaire
  associé (8 fichiers `*.spec.ts`) : companies, sites, users, site-devices,
  time-entries, shifts, availabilities, geocoding
- Les 3 modes de pointage physiques sont opérationnels : QR rotatif TOTP
  (téléphone → tablette), badge/NFC, PIN — plus `gps` (activable/désactivable
  par entreprise et par employé, voir décision #9) et `manual_by_manager`
- Marché d'échange de shifts (`ShiftOffer`) avec validation manager et
  vérification anti-conflit (décision #7)
- Disponibilités (`Availability`) + vérification automatique avant
  assignation d'un shift (décision #8)
- Géocodage d'adresses (Nominatim) pour la création de sites et la résolution
  d'adresse en présence en direct (décision #10)
- Présence en direct (web-manager `PresenceLivePage` + checkin-mobile
  `PresenceLiveScreen`) avec badge de source de pointage et distance GPS
  colorée par seuil
- Écrans réels sur les 3 apps :
  - **checkin-mobile** : Login, Pointage (QR rotatif + fallback badge/PIN),
    Planning (lecture seule, scopé employé), Disponibilités (bascule
    Disponible/Indisponible par jour, sans heures à saisir ; en option, une
    indisponibilité peut être restreinte à un seul bord — « à partir de » OU
    « jusqu'à », pas les deux — via « Préciser une plage horaire », voir
    décision #8 ; rebasculer un jour récurrent vers Disponible ouvre un
    choix garder-la-récurrence/annuler, décision #18), Marché de shifts,
    Validation d'échanges, Présence en direct, Profil (logout)
  - **checkin-pos** : Pairing d'appareil, Accueil kiosk (scan QR), Saisie PIN,
    Enrôlement badge, Écran hors-ligne
  - **web-manager** : Login, Planning (grille employés x jours, création/
    édition/assignation en drag-drop — voir décision #12), Approvals
    (validation d'échanges), Présence en direct, Équipe (override GPS par
    employé), Sites (CRUD + géocodage), Réglages (toggle GPS entreprise)
- Seed de démo réaliste : 6 semaines d'activité sur 8 employés
- `packages/shared-types` et `packages/api-client` à jour avec toutes les
  routes ci-dessus (évite la duplication de logique d'appel entre les 3 apps)
- Déploiement configuré sur Railway (migrations Prisma auto-appliquées au
  déploiement)

**Connu manquant / dette identifiée** :
1. Pas de révocation de session côté backend (voir logout ci-dessus) — à
   traiter avant toute exigence de sécurité plus stricte (déconnexion à
   distance, expiration forcée)
2. `AuditLog` existe dans le schéma mais n'est écrit par aucun service —
   pertinent pour l'exigence légale de traçabilité du pointage (2027), pas
   juste un nice-to-have
3. Pas d'écran de consultation/export des données de pointage par l'employé
   lui-même — à vérifier au regard de l'exigence "accessible" de la
   conformité belge

## Conventions de code

- Code (variables, fonctions, commentaires de code) en anglais
- Commentaires métier/documentation (comme ce fichier) peuvent rester en français
- DTOs validés avec `class-validator` sur chaque endpoint
- Toujours un test unitaire minimal sur les services touchant à l'auth ou au
  scoping multi-tenant (zone la plus sensible du projet)
