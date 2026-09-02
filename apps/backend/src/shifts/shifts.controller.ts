import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { ShiftsService } from './shifts.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { AssignShiftDto } from './dto/assign-shift.dto';
import { FindShiftsQueryDto } from './dto/find-shifts-query.dto';

@ApiTags('shifts')
@Controller()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get('shifts')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindShiftsQueryDto) {
    return this.shiftsService.findAll(user.companyId, query);
  }

  @Get('shifts/:id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shiftsService.findOne(user.companyId, id);
  }

  // Écriture réservée en pratique au client web-manager (choix produit, pas
  // une restriction API — un manager reste autorisé quel que soit le client).
  @Post('shifts')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShiftDto) {
    return this.shiftsService.create(user.companyId, user.userId, dto);
  }

  @Patch('shifts/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.shiftsService.update(user.companyId, id, dto);
  }

  @Delete('shifts/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shiftsService.remove(user.companyId, id);
  }

  @Post('shifts/:id/assign')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  assign(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AssignShiftDto) {
    return this.shiftsService.assign(user.companyId, id, dto);
  }

  // L'employé assigné propose son propre shift.
  @Post('shift-assignments/:id/offer')
  offerAssignment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shiftsService.offerAssignment(user.companyId, user, id);
  }

  // Un collègue accepte une offre ouverte.
  @Post('shift-offers/:id/accept')
  acceptOffer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shiftsService.acceptOffer(user.companyId, user, id);
  }

  @Post('shift-offers/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  approveOffer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shiftsService.approveOffer(user.companyId, id);
  }
}
