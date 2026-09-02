// Types partagés entre backend, checkin-mobile, checkin-pos et web-manager.
// Reflètent le schéma Prisma — à garder synchronisé manuellement pour l'instant
// (on pourra générer ce fichier automatiquement depuis Prisma plus tard si besoin).

export type UserRole = 'admin' | 'manager' | 'employee';
export type UserStatus = 'active' | 'invited' | 'disabled';
export type ShiftStatus = 'draft' | 'published' | 'cancelled';
export type AssignmentStatus =
  | 'assigned'
  | 'offered'
  | 'swap_pending'
  | 'confirmed'
  | 'cancelled';
export type OfferStatus = 'open' | 'accepted' | 'approved' | 'rejected' | 'expired';
export type TimeEntryType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
export type TimeEntrySource =
  | 'qr_scan_own_phone'
  | 'badge_scan'
  | 'pin_code'
  | 'gps'
  | 'manual_by_manager';

export interface Company {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
}

export interface Site {
  id: string;
  companyId: string;
  name: string;
  address?: string;
  geoLat?: number;
  geoLng?: number;
  timezone: string;
}

export interface User {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  // pas de badgeCode/pinCodeHash exposés côté client par défaut
}

export interface TimeEntry {
  id: string;
  userId: string;
  siteId: string;
  deviceId?: string;
  type: TimeEntryType;
  timestamp: string;
  source: TimeEntrySource;
  isEdited: boolean;
  editReason?: string;
}

export interface Shift {
  id: string;
  siteId: string;
  startsAt: string;
  endsAt: string;
  roleNeeded?: string;
  status: ShiftStatus;
  assignments?: ShiftAssignment[];
}

export interface ShiftAssignment {
  id: string;
  shiftId: string;
  userId: string;
  status: AssignmentStatus;
  offers?: ShiftOffer[];
}

export interface ShiftOffer {
  id: string;
  shiftAssignmentId: string;
  offeredBy: string;
  acceptedBy?: string;
  status: OfferStatus;
  requiresManagerApproval: boolean;
}

export interface Availability {
  id: string;
  userId: string;
  dayOfWeek?: number;
  specificDate?: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

// ---- checkin-pos : le device s'authentifie lui-même, pas un utilisateur ----

export interface DeviceAuthResponse {
  deviceToken: string;
  siteId: string;
  deviceLabel: string;
}

export interface DeviceTimeEntryResult extends TimeEntry {
  employee: { firstName: string; lastName: string };
}
