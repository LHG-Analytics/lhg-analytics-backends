import { Controller, Get, Header, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HelpdeskService } from './helpdesk.service';
import { AccessService } from '../access/access.service';

@ApiTags('Help Desk')
@Controller('helpdesk')
export class HelpdeskController {
  constructor(
    private readonly helpdeskService: HelpdeskService,
    private readonly access: AccessService,
  ) {}

  // Protegido pelo JwtAuthGuard global (cookie access_token ou Bearer).
  // Token de curta duração (1h) para o widget do LHG Help Desk. Só para quem
  // está ACTIVE e com acesso ao Analytics (o widget vive dentro dele).
  @Get('token')
  @ApiBearerAuth('JWT-auth')
  @Header('Cache-Control', 'no-store')
  async getToken(@Request() req: any) {
    await this.access.assertCanUseAnalytics(req.user.id);
    return this.helpdeskService.createToken(req.user);
  }
}
