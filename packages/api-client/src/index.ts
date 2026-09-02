import type {
  AuthResponse,
  Availability,
  DeviceAuthResponse,
  DeviceTimeEntryResult,
  Shift,
  ShiftAssignment,
  ShiftOffer,
  Site,
  TimeEntry,
  User,
} from '@horaires/shared-types';

// Client HTTP typé partagé par checkin-mobile, checkin-pos et web-manager.
// But : écrire la logique d'appel API (gestion du token, des erreurs) une
// seule fois plutôt que de la dupliquer dans les 3 apps.

// Porte le status HTTP pour que les appelants distinguent un vrai rejet
// (401/403 → identifiants invalides) d'un souci réseau (à réessayer).
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// React Native n'a pas toujours URLSearchParams disponible selon la version —
// on construit la query string à la main plutôt que d'en dépendre.
function toQueryString(params?: Record<string, string | undefined>): string {
  if (!params) return '';
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void; // ex: rediriger vers le login si le token a expiré
}

export class ApiClient {
  private baseUrl: string;
  private getAccessToken?: () => string | null;
  private onUnauthorized?: () => void;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.getAccessToken = options.getAccessToken;
    this.onUnauthorized = options.onUnauthorized;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = this.getAccessToken?.();

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      this.onUnauthorized?.();
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new ApiError(errorBody.message ?? `Erreur API (${res.status})`, res.status);
    }

    // 204 (ex: DELETE /shifts/:id) n'a pas de corps — res.json() lèverait une
    // erreur de parsing sur une réponse vide et empêcherait tout code après
    // l'appel de s'exécuter (ex: le rechargement de la liste après suppression).
    if (res.status === 204) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  }

  // ---- Auth ----
  login(email: string, password: string) {
    return this.request<AuthResponse>('POST', '/auth/login', { email, password });
  }

  register(payload: {
    companyName: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    return this.request<AuthResponse>('POST', '/auth/register', payload);
  }

  refresh(refreshToken: string) {
    return this.request<AuthResponse>('POST', '/auth/refresh', { refreshToken });
  }

  // ---- Device (checkin-pos) — pas d'utilisateur connecté, le device
  // s'authentifie lui-même avec son qrSecret ----
  authenticateDevice(deviceId: string, qrSecret: string) {
    return this.request<DeviceAuthResponse>('POST', '/site-devices/authenticate', {
      deviceId,
      qrSecret,
    });
  }

  enrollBadge(pin: string, badgeCode: string) {
    return this.request<{ id: string; firstName: string; lastName: string; badgeCode: string }>(
      'POST',
      '/site-devices/enroll-badge',
      { pin, badgeCode },
    );
  }

  // Pas de `type` à fournir : le serveur bascule automatiquement
  // clock_in/clock_out selon le dernier pointage de l'employé sur ce site.
  clockInWithBadge(badgeCode: string) {
    return this.request<DeviceTimeEntryResult>('POST', '/time-entries/device', {
      source: 'badge_scan',
      badgeCode,
    });
  }

  clockInWithPin(pin: string) {
    return this.request<DeviceTimeEntryResult>('POST', '/time-entries/device', {
      source: 'pin_code',
      pin,
    });
  }

  // ---- Sites ----
  getSites() {
    return this.request<Site[]>('GET', '/sites');
  }

  // ---- Utilisateurs (annuaire de l'entreprise — noms des collègues) ----
  getUsers() {
    return this.request<User[]>('GET', '/users');
  }

  inviteUser(payload: { email: string; firstName: string; lastName: string; role?: string }) {
    return this.request<User>('POST', '/users/invite', payload);
  }

  updateUserRole(userId: string, role: string) {
    return this.request<User>('PATCH', `/users/${userId}/role`, { role });
  }

  regenerateBadge(userId: string) {
    return this.request<User>('POST', `/users/${userId}/badge/regenerate`);
  }

  setUserPin(userId: string, pin: string) {
    return this.request<{ ok: true }>('POST', `/users/${userId}/pin`, { pin });
  }

  getPresence(siteId: string) {
    return this.request<{ id: string; firstName: string; lastName: string }[]>(
      'GET',
      `/sites/${siteId}/presence`,
    );
  }

  // ---- Pointage (checkin-mobile — l'employé pointe pour lui-même) ----
  clockInWithGps(siteId: string, type: string, geoLat: number, geoLng: number) {
    return this.request<TimeEntry>('POST', '/time-entries/self', {
      source: 'gps',
      siteId,
      type,
      geoLat,
      geoLng,
    });
  }

  clockInWithQrScan(deviceId: string, type: string) {
    return this.request<TimeEntry>('POST', '/time-entries/self', {
      source: 'qr_scan_own_phone',
      deviceId,
      type,
    });
  }

  getMyTimeEntries(params?: { userId?: string; from?: string; to?: string }) {
    return this.request<TimeEntry[]>('GET', `/time-entries${toQueryString(params)}`);
  }

  // ---- Shifts ----
  getShifts(params?: { siteId?: string; from?: string; to?: string }) {
    return this.request<Shift[]>('GET', `/shifts${toQueryString(params)}`);
  }

  // Écriture réservée en pratique à web-manager (choix produit — un manager
  // reste autorisé par son rôle quel que soit le client, voir CLAUDE.md).
  createShift(payload: {
    siteId: string;
    startsAt: string;
    endsAt: string;
    roleNeeded?: string;
    status?: string;
  }) {
    return this.request<Shift>('POST', '/shifts', payload);
  }

  updateShift(
    shiftId: string,
    payload: Partial<{
      siteId: string;
      startsAt: string;
      endsAt: string;
      roleNeeded: string;
      status: string;
    }>,
  ) {
    return this.request<Shift>('PATCH', `/shifts/${shiftId}`, payload);
  }

  deleteShift(shiftId: string) {
    return this.request<void>('DELETE', `/shifts/${shiftId}`);
  }

  assignShift(shiftId: string, userId: string) {
    return this.request<ShiftAssignment>('POST', `/shifts/${shiftId}/assign`, { userId });
  }

  offerShiftAssignment(assignmentId: string) {
    return this.request<ShiftOffer>('POST', `/shift-assignments/${assignmentId}/offer`);
  }

  acceptShiftOffer(offerId: string) {
    return this.request<ShiftAssignment>('POST', `/shift-offers/${offerId}/accept`);
  }

  approveShiftOffer(offerId: string) {
    return this.request<ShiftAssignment>('POST', `/shift-offers/${offerId}/approve`);
  }

  // ---- Disponibilités ----
  getAvailabilities(userId?: string) {
    return this.request<Availability[]>('GET', `/availabilities${toQueryString({ userId })}`);
  }

  createAvailability(payload: {
    dayOfWeek?: number;
    specificDate?: string;
    startTime: string;
    endTime: string;
    isAvailable?: boolean;
  }) {
    return this.request<Availability>('POST', '/availabilities', payload);
  }
}
