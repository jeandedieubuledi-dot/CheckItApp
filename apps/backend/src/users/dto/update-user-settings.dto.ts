import { IsBoolean, IsOptional } from 'class-validator';

// `gpsClockInEnabled: null` (envoyé explicitement) remet l'employé sur le
// réglage entreprise par défaut plutôt que de garder une surcharge figée.
export class UpdateUserSettingsDto {
  @IsOptional()
  @IsBoolean()
  gpsClockInEnabled?: boolean | null;
}
