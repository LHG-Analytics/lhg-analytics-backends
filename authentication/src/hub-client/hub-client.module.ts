import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HubClientController } from './hub-client.controller';

// O Analytics como cliente do HUB (login central): /api/hub/*.
@Module({
  imports: [AuthModule],
  controllers: [HubClientController],
})
export class HubClientModule {}
