import { Controller, Get, Header, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LauncherService } from './launcher.service';

// Dados da própria pessoa para o launcher do HUB. Protegido pelo JwtAuthGuard
// global (cookie access_token ou Bearer).
@ApiTags('Auth')
@Controller('me')
export class MeController {
  constructor(private readonly launcher: LauncherService) {}

  // [{ key, name, description, launchUrl, icon, order }] das flags ativas.
  @Get('systems')
  @ApiBearerAuth('JWT-auth')
  @Header('Cache-Control', 'no-store')
  systems(@Request() req: any) {
    return this.launcher.listFor(req.user.id);
  }
}
