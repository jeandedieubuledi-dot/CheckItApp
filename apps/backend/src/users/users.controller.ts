import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantScopeGuard } from '../auth/tenant-scope.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { SetPinDto } from './dto/set-pin.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll(user.companyId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.findOne(user.companyId, id);
  }

  @Post('invite')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteUserDto) {
    return this.usersService.invite(user.companyId, dto);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(user.companyId, id, dto);
  }

  @Post(':id/badge/regenerate')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  regenerateBadge(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.regenerateBadge(user.companyId, id);
  }

  @Post(':id/pin')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  setPin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetPinDto,
  ) {
    return this.usersService.setPin(user.companyId, id, dto);
  }
}
