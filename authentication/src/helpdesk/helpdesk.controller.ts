import { Controller, Get, Header, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HelpdeskService } from './helpdesk.service';

@ApiTags('Help Desk')
@Controller('helpdesk')
export class HelpdeskController {
  constructor(private readonly helpdeskService: HelpdeskService) {}

  // Protegido pelo JwtAuthGuard global (cookie access_token ou Bearer).
  // Token de curta duração (1h) para o widget do LHG Help Desk.
  @Get('token')
  @ApiBearerAuth('JWT-auth')
  @Header('Cache-Control', 'no-store')
  getToken(@Request() req: any) {
    return this.helpdeskService.createToken(req.user);
  }
}
