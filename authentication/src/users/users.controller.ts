import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { Units } from '../auth/decorators/units.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UnitsGuard } from '../auth/guards/units.guard';
import { requestContext } from '../access/access.service';
import { CreateUserDto } from './dto/create-user.dto';
import { SetSystemsDto } from './dto/set-systems.dto';
import { Actor, UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

// Quem está logado (o JwtAuthGuard põe em req.user) e de onde veio.
const actorOf = (req: any): Actor => ({
  id: req.user?.id,
  ctx: requestContext(req),
});

@ApiBearerAuth()
@ApiTags('Users')
@UseGuards(JwtAuthGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN')
@Units('LHG')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(
    @Body() createUserDto: CreateUserDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, legacyDefault } = await this.usersService.create(
      createUserDto,
      actorOf(req),
    );
    // Cadastro sem `systems` (transição): avisa o cliente que vai acabar.
    if (legacyDefault) res.setHeader('Deprecation', 'true');
    return user;
  }

  @Get()
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async findAll(
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    try {
      const users = await this.usersService.findAll(includeInactive ?? false);
      return users;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Erro ao buscar usuários:', error);
      throw new Error(`Failed to fetch users: ${errorMessage}`);
    }
  }

  @Get('email/:email')
  findByEmail(@Param('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: any,
  ) {
    return this.usersService.update(+id, updateUserDto, actorOf(req));
  }

  // Substitui os acessos ativos da pessoa (concede/revoga, com histórico).
  @Put(':id/systems')
  setSystems(
    @Param('id') id: string,
    @Body() body: SetSystemsDto,
    @Request() req: any,
  ) {
    return this.usersService.setSystems(+id, body.systems, actorOf(req));
  }

  @Post(':id/reactivate')
  reactivate(@Param('id') id: string, @Request() req: any) {
    return this.usersService.reactivate(+id, actorOf(req));
  }

  // Inativa (não apaga a linha); a resposta é a mesma de antes.
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.usersService.remove(+id, actorOf(req));
  }
}
