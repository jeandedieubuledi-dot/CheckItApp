import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { SitesModule } from './sites/sites.module';
import { UsersModule } from './users/users.module';
import { SiteDevicesModule } from './site-devices/site-devices.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { ShiftsModule } from './shifts/shifts.module';
import { AvailabilitiesModule } from './availabilities/availabilities.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CompaniesModule,
    SitesModule,
    UsersModule,
    SiteDevicesModule,
    TimeEntriesModule,
    ShiftsModule,
    AvailabilitiesModule,
  ],
})
export class AppModule {}
