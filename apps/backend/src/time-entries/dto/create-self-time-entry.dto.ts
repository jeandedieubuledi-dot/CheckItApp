import { TimeEntryType } from '@prisma/client';
import { IsEnum, IsIn, IsLatitude, IsLongitude, IsUUID, ValidateIf } from 'class-validator';

// Émis par checkin-mobile — l'employé pointe pour lui-même, authentifié par
// son propre JWT utilisateur. 'qr_scan_own_phone' = son téléphone scanne le
// QR affiché par le terminal du site ; 'gps' = auto-pointage géolocalisé.
export class CreateSelfTimeEntryDto {
  @IsEnum(TimeEntryType)
  type: TimeEntryType;

  @IsIn(['gps', 'qr_scan_own_phone'])
  source: 'gps' | 'qr_scan_own_phone';

  @ValidateIf((o) => o.source === 'gps')
  @IsUUID()
  siteId?: string;

  @ValidateIf((o) => o.source === 'gps')
  @IsLatitude()
  geoLat?: number;

  @ValidateIf((o) => o.source === 'gps')
  @IsLongitude()
  geoLng?: number;

  @ValidateIf((o) => o.source === 'qr_scan_own_phone')
  @IsUUID()
  deviceId?: string;
}
