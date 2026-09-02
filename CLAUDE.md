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
  `SiteDevice` (voir plus bas). Permet : scan QR par le téléphone de l'employé,
  identification par badge/NFC, PIN code, enrôlement de nouveaux badges.
- **`apps/web-manager`** — App web (React/Vite), managers uniquement. Seul endroit
  où on peut créer/éditer des horaires. Propose aussi tout ce que le mobile
  propose côté manager (validation d'échanges, présence en direct).

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

**Fait** :
- Schéma Prisma complet (`apps/backend/prisma/schema.prisma`) — 9 tables
- `AuthModule` fonctionnel : register, login, refresh, stratégie JWT
- `TenantScopeGuard` et `JwtAuthGuard`
- Squelettes de modules : companies, sites, users, site-devices, time-entries,
  shifts, availabilities (structure posée, logique métier à écrire)
- `packages/shared-types` avec les types de base
- `packages/api-client` avec un client HTTP typé minimal
- Scaffolds des 3 apps front (package.json + point d'entrée minimal, pas encore
  d'écrans réels)

**À faire, dans l'ordre recommandé** :
1. `pnpm install` à la racine, `docker compose up -d`, `prisma migrate dev`
   pour valider que la base tourne
2. Implémenter `CompaniesService`/`SitesService`/`UsersService` (CRUD, toujours
   filtré par companyId)
3. Implémenter `SiteDevicesService` (génération/rotation du `qrSecret`, endpoint
   d'authentification d'appareil pour checkin-pos)
4. Implémenter `TimeEntriesService` (les 3 modes de pointage)
5. Écrans checkin-pos : scan QR, saisie PIN, enrôlement badge
6. Écrans checkin-mobile : login, pointage, dispos, marché de shifts
7. `ShiftsService` + écrans web-manager pour la création de planning

## Conventions de code

- Code (variables, fonctions, commentaires de code) en anglais
- Commentaires métier/documentation (comme ce fichier) peuvent rester en français
- DTOs validés avec `class-validator` sur chaque endpoint
- Toujours un test unitaire minimal sur les services touchant à l'auth ou au
  scoping multi-tenant (zone la plus sensible du projet)
