import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { AvailabilitiesService } from './availabilities.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { FindAvailabilitiesQueryDto } from './dto/find-availabilities-query.dto';

@ApiTags('availabilities')
@Controller('availabilities')
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class AvailabilitiesController {
  constructor(private readonly availabilitiesService: AvailabilitiesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAvailabilityDto) {
    return this.availabilitiesService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindAvailabilitiesQueryDto) {
    return this.availabilitiesService.findAll(user.companyId, user.userId, user.role, query.userId);
  }
}
