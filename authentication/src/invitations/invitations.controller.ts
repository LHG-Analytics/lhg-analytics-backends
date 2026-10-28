import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { requestContext } from '../access/access.service';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Units } from '../auth/decorators/units.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UnitsGuard } from '../auth/guards/units.guard';
import {
  AcceptByPasswordDto,
  CreateInvitationDto,
  InvitationTokenDto,
} from './dto/invitation.dto';
import { InvitationsService } from './invitations.service';

const actorOf = (req: any) => ({
  id: req.user?.id,
  ctx: requestContext(req),
});

/**
 * Aceite do convite: rotas PÚBLICAS. O token vai no CORPO (nunca na URL,
 * que cai em logs HTTP), sem Referer e com rate limit mais apertado.
 * Registrado ANTES do controller de admin (rotas "accept/..." x ":id").
 */
@ApiTags('Invitations')
@Controller('invitations/accept')
@Public()
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class InvitationAcceptController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Cache-Control', 'no-store')
  check(@Body() body: InvitationTokenDto) {
    return this.invitations.check(body.token);
  }

  @Post('password')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Cache-Control', 'no-store')
  acceptByPassword(@Body() body: AcceptByPasswordDto, @Request() req: any) {
    return this.invitations.acceptByPassword(body.token, body.password, {
      ctx: requestContext(req),
    });
  }
}

/** Gestão de convites: só ADMIN da LHG, com auditoria. */
@ApiBearerAuth()
@ApiTags('Invitations')
@UseGuards(JwtAuthGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN')
@Units('LHG')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  // O token aparece SÓ nesta resposta (e no new-link); o banco guarda o hash.
  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() dto: CreateInvitationDto, @Request() req: any) {
    return this.invitations.create(dto, actorOf(req));
  }

  @Get()
  list() {
    return this.invitations.list();
  }

  @Delete(':id')
  revoke(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.invitations.revoke(id, actorOf(req));
  }

  @Post(':id/new-link')
  @Header('Cache-Control', 'no-store')
  newLink(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.invitations.newLink(id, actorOf(req));
  }
}
